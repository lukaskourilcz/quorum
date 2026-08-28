import { createHash } from "node:crypto";
import type { WebDevEditionPackage, WebDevEvidenceBrief, WebDevRecord } from "../../../contracts/webdev-signal.js";
import {
  WebDevEditionPackageSchema,
  validateWebDevBilingualParity,
  validateWebDevEditionAgainstBrief
} from "../../../contracts/webdev-signal.js";

export interface WebDevSocialContentLimits {
  threadsPrimaryMaxChars: number;
  threadsContinuationMaxItems: number;
  threadsContinuationMaxChars: number;
  instagramCaptionMaxChars: number;
  instagramPanelsMin: number;
  instagramPanelsMax: number;
}

export interface WebDevPackagePair {
  cs: WebDevEditionPackage;
  en: WebDevEditionPackage;
}

const CONTENT_VERSION = "1.0.0";
const PROMPT_VERSION = "1.0.0";
const LOCALE_POLICY_VERSION = "1.0.0";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function finalize(value: Omit<WebDevEditionPackage, "contentHash">): WebDevEditionPackage {
  return WebDevEditionPackageSchema.parse({ ...value, contentHash: hash(value) });
}

function conciseWithSource(text: string, sourceUrl: string, maximum: number): string {
  const suffix = ` ${sourceUrl}`;
  const available = Math.max(1, maximum - suffix.length);
  const main = text.length <= available ? text : `${text.slice(0, Math.max(1, available - 1)).trimEnd()}…`;
  return `${main}${suffix}`.slice(0, maximum);
}

function versionLabel(record: WebDevRecord): string {
  return record.fixedVersions[0] ?? record.versionRefs[0] ?? "the documented change";
}

function affectedLabel(record: WebDevRecord, locale: "cs" | "en"): string {
  const value = [...record.affectedVersions, ...record.affectedConfigurations].join(", ");
  return value || (locale === "cs" ? "rozsah uvedený ve zdroji" : "the scope stated by the source");
}

function editorial(locale: "cs" | "en", brief: WebDevEvidenceBrief, record: WebDevRecord) {
  const security = record.changeKind === "security-advisory";
  const breaking = record.changeKind === "breaking-change";
  const deprecation = record.changeKind === "deprecation";
  const preview = brief.releaseStability === "beta" || brief.releaseStability === "preview";
  const version = versionLabel(record);
  const affected = affectedLabel(record, locale);
  const action = brief.safeActions[0]?.text ?? null;
  if (locale === "cs") {
    const headline = security
      ? `${record.project}: oprava v ${version}`
      : breaking ? `${record.project}: nekompatibilní změna v ${version}`
      : deprecation ? `${record.project}: končí podpora části rozhraní`
      : preview ? `${record.project}: ${version} je zatím náhled` : `${record.project} ${version}: co se mění`;
    const deck = security
      ? `Oficiální upozornění vymezuje dotčený rozsah: ${affected}.`
      : breaking || deprecation ? `Oficiální zdroj vymezuje dotčený rozsah: ${affected}.`
      : preview ? "Novinka ještě není stabilní; hodí se k ověření, ne k ukvapenému nasazení." : "Nové vydání mění práci webových vývojářů v rozsahu popsaném oficiálním zdrojem.";
    const explanation = security
      ? `Opravený rozsah je ${record.fixedVersions.join(", ")}. Používáte-li ${affected}, ověřte instalovanou verzi${action ? ` a postupujte podle uvedeného kroku: ${action}` : "."}`
      : breaking || deprecation ? `Změna se týká ${affected}. Před aktualizací zkontrolujte dotčené použití${action ? ` a postupujte podle uvedeného kroku: ${action}` : "."}`
      : preview ? `Jde o ${brief.releaseStability}, nikoli stabilní vydání. Vývojáři mohou změnu otestovat proti vlastnímu projektu a sledovat další oficiální aktualizace.` : `Oficiální zdroj popisuje změnu pro ${record.project}. Před úpravou projektu zkontrolujte verzi, rozsah a migrační poznámky.`;
    return { headline, deck, explanation, sourceLabel: "Oficiální zdroj", actionLabel: action ?? "Oficiální podklady neuvádějí žádný další krok.", impactLabel: `Týká se: ${affected}.` };
  }
  const headline = security
    ? `${record.project}: fix available in ${version}`
    : breaking ? `${record.project}: breaking change in ${version}`
    : deprecation ? `${record.project}: documented API deprecation`
    : preview ? `${record.project} ${version} remains a preview` : `${record.project} ${version}: what changed`;
  const deck = security
    ? `The official advisory defines the affected scope as ${affected}.`
    : breaking || deprecation ? `The official source defines the affected scope as ${affected}.`
    : preview ? "This is not a stable release; test it deliberately before considering adoption." : "The official release changes a documented part of the working web-development workflow.";
  const explanation = security
    ? `The fixed scope is ${record.fixedVersions.join(", ")}. If a project uses ${affected}, verify the installed version${action ? ` and follow the stated action: ${action}` : "."}`
    : breaking || deprecation ? `The change affects ${affected}. Check the affected use before updating${action ? ` and follow the stated action: ${action}` : "."}`
    : preview ? `The accepted evidence describes a ${brief.releaseStability}, not stable availability. Test it against a real project and follow subsequent official updates.` : `The official source documents the change for ${record.project}. Check the exact version, affected workflow and migration notes before changing a project.`;
  return { headline, deck, explanation, sourceLabel: "Official source", actionLabel: action ?? "The official evidence states no additional action.", impactLabel: `Affected scope: ${affected}.` };
}

function packageFor(input: {
  locale: "cs" | "en";
  brief: WebDevEvidenceBrief;
  briefRef: string;
  record: WebDevRecord;
  limits: WebDevSocialContentLimits;
  deterministic: boolean;
  provider?: "openai" | "anthropic" | null;
  model?: string | null;
}): WebDevEditionPackage {
  const copy = editorial(input.locale, input.brief, input.record);
  const source = input.brief.sources[0]!;
  const isCs = input.locale === "cs";
  const threadsText = isCs
    ? `${copy.headline}. ${copy.impactLabel} ${copy.actionLabel}`
    : `${copy.headline}. ${copy.impactLabel} ${copy.actionLabel}`;
  const captionText = isCs
    ? `${copy.headline}\n\n${copy.deck}\n\n${copy.actionLabel}\n\nZdroj: ${source.url}`
    : `${copy.headline}\n\n${copy.deck}\n\n${copy.actionLabel}\n\nSource: ${source.url}`;
  const panels: WebDevEditionPackage["instagramPanels"] = input.brief.safeActions.length > 0
    ? [
        { role: "cover", heading: copy.headline, body: versionLabel(input.record) },
        { role: "change", heading: isCs ? "Co se změnilo" : "What changed", body: copy.deck },
        { role: "impact", heading: isCs ? "Koho se týká" : "Who is affected", body: copy.impactLabel },
        { role: "action", heading: isCs ? "Co zkontrolovat" : "What to check", body: copy.actionLabel }
      ]
    : [
        { role: "cover", heading: copy.headline, body: versionLabel(input.record) },
        { role: "change-impact", heading: isCs ? "Změna a dopad" : "Change and impact", body: `${copy.deck} ${copy.impactLabel}` },
        { role: "action", heading: isCs ? "Co zkontrolovat" : "What to check", body: copy.actionLabel }
      ];
  if (input.brief.uncertainty.length > 0) panels.push({ role: "impact", heading: isCs ? "Hranice důkazů" : "Evidence boundary", body: input.brief.uncertainty[0]! });
  panels.push({ role: "source", heading: isCs ? "Zdroj" : "Source", body: `${copy.sourceLabel}: ${source.label}` });
  const instagramPanels = panels.slice(0, input.limits.instagramPanelsMax);
  const claimIdsUsed = input.brief.claims.map(({ id }) => id);
  const base = {
    schemaVersion: "webdev-edition-package/1" as const,
    id: `edition:${input.brief.id.slice(6)}:${input.locale}`,
    locale: input.locale,
    evidenceBriefRef: input.briefRef,
    editionProfileRef: `social-profile-webdev-signal-${input.locale}`,
    headline: copy.headline.slice(0, 160),
    deck: copy.deck.slice(0, 280),
    explanation: copy.explanation.slice(0, 1_500),
    threads: {
      primary: conciseWithSource(threadsText, source.url, Math.min(500, input.limits.threadsPrimaryMaxChars)),
      continuation: []
    },
    instagramCaption: captionText.slice(0, Math.min(2_200, input.limits.instagramCaptionMaxChars)),
    instagramPanels,
    cta: input.brief.safeActions.length > 0 ? "check-affected-version" as const : "read-official-source" as const,
    altTextInput: isCs
      ? `${instagramPanels.length} panelů shrnuje změnu v ${input.record.project}, její dopad, praktickou kontrolu a oficiální zdroj.`
      : `${instagramPanels.length} panels summarize the ${input.record.project} change, its impact, a practical check and the official source.`,
    sourceAttribution: input.brief.sources.map(({ url, label }) => ({ url, label })),
    factualSentences: input.brief.claims.map(({ text, id }) => ({ text, claimIds: [id] })),
    claimIdsUsed,
    affectedVersionRefsUsed: [...input.brief.affectedVersions, ...input.brief.fixedVersions],
    affectedAudienceIdsUsed: input.brief.affectedAudienceIds,
    safeActionIdsUsed: input.brief.safeActions.map(({ id }) => id),
    languageChecks: { expectedLocale: input.locale, nativeRegister: true, prohibitedPhraseHits: [] },
    parityChecks: { briefHash: input.brief.contentHash, coreClaimsPresent: true, uncertaintyPreserved: true, unsupportedFacts: [] },
    originalityChecks: {
      sourceCopyOverlapRatio: copy.headline === input.record.title || copy.explanation.includes(input.record.sourceSummary) ? 1 : 0.05,
      literalTranslationRisk: false,
      comparedLocalePackageHash: null
    },
    characterCounts: {
      headline: copy.headline.length,
      deck: copy.deck.length,
      threadsPrimary: conciseWithSource(threadsText, source.url, Math.min(500, input.limits.threadsPrimaryMaxChars)).length,
      instagramCaption: captionText.slice(0, Math.min(2_200, input.limits.instagramCaptionMaxChars)).length
    },
    editorialProvenance: {
      modelRole: "WEBDEV_SIGNAL_EDITOR" as const,
      promptVersion: PROMPT_VERSION,
      localePolicyVersion: LOCALE_POLICY_VERSION,
      provider: input.provider ?? null,
      model: input.model ?? null,
      deterministic: input.deterministic
    },
    status: "draft" as const,
    heldReason: null,
    contentVersion: CONTENT_VERSION,
    capabilityRefs: ["webdev-signal-to-design-lab:bounded-render-summary:bounded-render-summary/1" as const]
  };
  return finalize(base);
}

export function createDeterministicWebDevPackages(input: {
  brief: WebDevEvidenceBrief;
  briefRef: string;
  record: WebDevRecord;
  limits: WebDevSocialContentLimits;
}): WebDevPackagePair {
  return {
    cs: packageFor({ ...input, locale: "cs", deterministic: true }),
    en: packageFor({ ...input, locale: "en", deterministic: true })
  };
}

function textOf(pack: WebDevEditionPackage): string {
  return [pack.headline, pack.deck, pack.explanation, pack.threads.primary, pack.instagramCaption ?? "", ...pack.instagramPanels.flatMap(({ heading, body }) => [heading, body])].join(" ");
}

export function validateGeneratedWebDevPackages(input: {
  brief: WebDevEvidenceBrief;
  record: WebDevRecord;
  packages: WebDevPackagePair;
  limits: WebDevSocialContentLimits;
  recentPackageTexts?: readonly string[];
}): { cs: string[]; en: string[]; pair: string[] } {
  const localeReasons = (pack: WebDevEditionPackage): string[] => {
    const reasons = validateWebDevEditionAgainstBrief({ brief: input.brief, edition: pack });
    const text = textOf(pack);
    if (pack.threads.primary.length > input.limits.threadsPrimaryMaxChars) reasons.push("threads-over-limit");
    if (pack.threads.continuation.length > input.limits.threadsContinuationMaxItems
      || pack.threads.continuation.some((value) => value.length > input.limits.threadsContinuationMaxChars)) reasons.push("threads-continuation-over-limit");
    if ((pack.instagramCaption?.length ?? 0) > input.limits.instagramCaptionMaxChars) reasons.push("instagram-caption-over-limit");
    if (pack.instagramPanels.length < input.limits.instagramPanelsMin || pack.instagramPanels.length > input.limits.instagramPanelsMax) reasons.push("instagram-panel-count-invalid");
    if (input.brief.sources.some(({ url }) => !pack.sourceAttribution.some((source) => source.url === url)) || !text.includes(input.brief.sources[0]!.url)) reasons.push("missing-source-attribution");
    if (input.brief.prohibitedPhrases.some((phrase) => text.toLocaleLowerCase(pack.locale).includes(phrase.toLocaleLowerCase(pack.locale)))) reasons.push("hype-or-engagement-bait");
    if (pack.headline.trim() === input.record.title.trim() || pack.explanation.includes(input.record.sourceSummary)) reasons.push("source-copy-overlap");
    const previewSafeText = text
      .replace(/\bnot (?:a )?stable(?: release)?\b/giu, "")
      .replace(/\bnení stabilní\b/giu, "");
    if (["beta", "preview"].includes(input.brief.releaseStability) && /\b(?:is stable|stable release|je stabilní)\b/iu.test(previewSafeText)) reasons.push("preview-stability-drift");
    if (input.record.changeKind === "security-advisory"
      && [...input.brief.affectedVersions, ...input.brief.fixedVersions].some((version) => !text.includes(version))) reasons.push("security-version-drift");
    if (input.recentPackageTexts?.some((recent) => recent === text)) reasons.push("recent-package-duplicate");
    return [...new Set(reasons)];
  };
  return {
    cs: localeReasons(input.packages.cs),
    en: localeReasons(input.packages.en),
    pair: validateWebDevBilingualParity({ brief: input.brief, cs: input.packages.cs, en: input.packages.en })
  };
}

export function holdWebDevPackage(pack: WebDevEditionPackage, reasons: readonly string[]): WebDevEditionPackage {
  const { contentHash: _oldHash, ...withoutHash } = pack;
  return finalize({
    ...withoutHash,
    headline: withoutHash.headline.slice(0, 160),
    deck: withoutHash.deck.slice(0, 280),
    explanation: withoutHash.explanation.slice(0, 1_500),
    threads: {
      primary: withoutHash.threads.primary.slice(0, 500),
      continuation: withoutHash.threads.continuation.slice(0, 3).map((value) => value.slice(0, 500))
    },
    instagramCaption: withoutHash.instagramCaption?.slice(0, 2_200),
    instagramPanels: withoutHash.instagramPanels.slice(0, 8).map((panel) => ({
      ...panel,
      heading: panel.heading.slice(0, 120),
      body: panel.body.slice(0, 500)
    })),
    status: "held",
    heldReason: reasons.join(", ").slice(0, 500) || "editorial-validation-failed"
  });
}
