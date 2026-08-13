import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import type {
  KvorumGateResult,
  TribunPackage
} from "../../contracts/kvorum-desk.js";
import type {
  KvorumMonitorCluster,
  KvorumMonitorItem
} from "../../contracts/kvorum-monitor.js";
import { reviewArticleText } from "../../edition/stet.js";

const VOTE_RECOMMENDATION = /(?<![\p{L}\p{N}_])(?:nevolte|volte|hlasujte|kroužkujte|zakroužkujte|dejte (?:svůj )?hlas|měli byste volit|doporučujeme volit)(?![\p{L}\p{N}_])/iu;
const ENDORSEMENT = /(?<![\p{L}\p{N}_])(?:podporujeme|odmítáme|stojíme za|jsme pro|jsme proti|zaslouží si (?:váš|náš) hlas|je (?:(?:jediná )?(?:nejlepší|správná)|jediná) volba|nesmí vládnout)(?![\p{L}\p{N}_])/iu;
const CRIME = /(?<![\p{L}\p{N}_])(?:trestn(?:ý čin|ého činu)|zločin(?:ec|kyně)?|podvod(?:ník|nice)?|korup(?:ce|čník|čnice)|úplatek|uplácel|kradl|ukradl|tuneloval|pral peníze|spáchal|obviněn|obžalován)(?![\p{L}\p{N}_])/iu;
const ON_RECORD = /(?<![\p{L}\p{N}_])(?:podle|uvedl[ao]?|informoval[ao]?|policie|soud|státní zastupitelství|státní zástupce|usnesení|obžaloba|rozsudek|obvinil[ao]?|obžaloval[ao]?)(?![\p{L}\p{N}_])/iu;
const SINGLE_SOURCE_LABEL = /(?<![\p{L}\p{N}_])(?:(?:zatím|prozatím) (?:jediný|jediného) zdroj|podle jediného (?:dostupného )?zdroje|jeden (?:ověřený )?zdroj)(?![\p{L}\p{N}_])/iu;
const PRIVATE_CONTEXT = /(?<![\p{L}\p{N}_])(?:manžel(?:ka)?|partner(?:ka)?|syn|dcera|bratr|sestra|příbuzn(?:ý|á)|soused(?:ka)?|komentující|kolemjdoucí|bystander)(?![\p{L}\p{N}_])/iu;
const UNKNOWN_FULL_NAME = /(?<![\p{L}\p{N}_])(\p{Lu}\p{Ll}{2,}(?:[-’']\p{Lu}?\p{Ll}+)?\s+\p{Lu}\p{Ll}{2,}(?:[-’']\p{Lu}?\p{Ll}+)?)(?![\p{L}\p{N}_])/gu;
const ALARM_VOCABULARY = /(?<![\p{L}\p{N}_])(?:šok(?:ující)?|skandál(?:ní)?|katastrofa|pohroma|alarmující|děsiv(?:ý|á|é)|totální chaos|teď nebo nikdy|poslední šance|musíme okamžitě|země je v ohrožení)(?![\p{L}\p{N}_])/iu;
const VOTER_MOCKERY = /(?:(?:voliči|voličky|lidé,? kteří volí|kdo volí).{0,48}(?:hloup|naiv|ovc|idiot|nevzdělan|dezolát)|(?:hlupáci|idioti|ovce|dezoláti).{0,48}(?:volí|voliči))/iu;
const FORBIDDEN_ACTION = /(?<![\p{L}\p{N}_])(?:publikujme|zveřejněme|naplánujme (?:post|příspěvek)|postněme|založme účet|vytvořme účet|otevřme kanál|spusťme reklamu|podpořme placeně|boost(?:něme)?|sponzorovaný příspěvek|fundraising|vyberme peníze)(?![\p{L}\p{N}_])/iu;

export const KVORUM_REGISTER_GATE_IDS = new Set([
  "alarm-vocabulary",
  "voter-respect",
  "stop-slop"
]);

interface ContentBlock {
  text: string;
  claimId: string | null;
}

function blocks(candidate: TribunPackage): ContentBlock[] {
  return [
    { text: candidate.headline, claimId: null },
    { text: candidate.summary.text, claimId: null },
    { text: candidate.whyItMatters.text, claimId: null },
    { text: candidate.ourAngle, claimId: null },
    { text: candidate.ourAngleDiffers, claimId: null },
    ...candidate.targets.flatMap((target) => [
      { text: target.copy, claimId: null },
      ...(target.altText ? [{ text: target.altText, claimId: null }] : [])
    ]),
    ...candidate.claims.map((claim) => ({ text: claim.text, claimId: claim.id }))
  ];
}

function result(
  gate: string,
  failures: readonly string[],
  passMessage: string,
  claimIds: readonly string[] = []
): KvorumGateResult {
  return {
    gate,
    verdict: failures.length === 0 ? "pass" : "fail",
    message: failures.length === 0 ? passMessage : failures.join(" ").slice(0, 800),
    claimIds: [...new Set(claimIds)].sort()
  };
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function includesPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalized(text)} `;
  const needle = normalized(phrase);
  return needle.length > 1 && haystack.includes(` ${needle} `);
}

function politicalTargets(lexicon: KvorumEntityLexicon): string[] {
  return lexicon.entities
    .filter((entity) => entity.kind === "party" || (entity.kind === "person" && entity.roles.includes("party-leader")))
    .flatMap((entity) => [entity.canonicalName, ...entity.aliases])
    .filter((phrase) => normalized(phrase).length > 3);
}

function voteGate(candidate: TribunPackage): KvorumGateResult {
  const failures = blocks(candidate).filter((block) => VOTE_RECOMMENDATION.test(block.text));
  return result(
    "vote-recommendation",
    failures.length > 0 ? ["The draft tells or recommends that a reader cast a vote."] : [],
    "The draft gives no voting instruction or recommendation.",
    failures.flatMap((block) => block.claimId ? [block.claimId] : [])
  );
}

function endorsementGate(candidate: TribunPackage, lexicon: KvorumEntityLexicon): KvorumGateResult {
  const targets = politicalTargets(lexicon);
  const failures = blocks(candidate).filter((block) =>
    ENDORSEMENT.test(block.text)
    && (
      /(?<![\p{L}\p{N}_])(?:stran(?:a|u)|hnutí|kandidát(?:a|ku)?|koalic(?:e|i))(?![\p{L}\p{N}_])/iu.test(block.text)
      || targets.some((target) => includesPhrase(block.text, target))
      || /je (?:(?:jediná )?(?:nejlepší|správná)|jediná) volba/iu.test(block.text)
    )
  );
  return result(
    "party-endorsement",
    failures.length > 0 ? ["The draft endorses or opposes a party, candidate or coalition."] : [],
    "The draft contains no party, candidate or coalition endorsement.",
    failures.flatMap((block) => block.claimId ? [block.claimId] : [])
  );
}

function eligibleEvidence(source: KvorumMonitorCluster["attributions"][number] | undefined): boolean {
  return Boolean(source && !source.discoveryOnly && source.sourceId !== "stit-demokracie-facebook");
}

function crimeGate(
  candidate: TribunPackage,
  cluster: KvorumMonitorCluster | undefined,
  items: ReadonlyMap<string, KvorumMonitorItem>
): KvorumGateResult {
  const crimeBlocks = blocks(candidate).filter((block) => CRIME.test(block.text));
  if (crimeBlocks.length === 0) {
    return result("crime-accusation", [], "The draft makes no crime accusation.");
  }
  const attributions = new Map(cluster?.attributions.map((source) => [source.itemRef, source]) ?? []);
  const crimeClaims = candidate.claims.filter((claim) => CRIME.test(claim.text));
  const failures: string[] = [];
  const claimIds = crimeClaims.map((claim) => claim.id);
  if (crimeClaims.length === 0) failures.push("Crime language appears outside the typed claims table.");
  const eligibleRefs = new Set<string>();
  for (const claim of crimeClaims) {
    if (claim.type === "commentary") {
      failures.push(`Crime accusation ${claim.id} is mislabeled as commentary.`);
      continue;
    }
    const supported = claim.refs.some((ref) => {
      const source = attributions.get(ref);
      const item = items.get(ref);
      if (!eligibleEvidence(source) || !item || !CRIME.test(item.text) || !ON_RECORD.test(item.text)) return false;
      eligibleRefs.add(ref);
      return true;
    });
    if (!supported) failures.push(`Crime accusation ${claim.id} has no on-record reporting ref.`);
    if (!ON_RECORD.test(claim.text) && !claim.refs.some((ref) => {
      const source = attributions.get(ref);
      return source ? includesPhrase(claim.text, source.sourceName) : false;
    })) {
      failures.push(`Crime accusation ${claim.id} is not visibly attributed.`);
    }
  }
  const sourceNames = [...eligibleRefs]
    .map((ref) => attributions.get(ref)?.sourceName)
    .filter((name): name is string => Boolean(name));
  for (const block of crimeBlocks.filter((entry) => entry.claimId === null)) {
    if (!ON_RECORD.test(block.text) && !sourceNames.some((name) => includesPhrase(block.text, name))) {
      failures.push("Crime language in public copy is not visibly attributed to its reporting source.");
    }
  }
  return result(
    "crime-accusation",
    failures,
    "Every crime accusation is typed, visibly attributed and backed by on-record reporting.",
    claimIds
  );
}

function stripKnownEntities(value: string, lexicon: KvorumEntityLexicon): string {
  const phrases = lexicon.entities
    .flatMap((entity) => [entity.canonicalName, ...entity.aliases])
    .filter((phrase) => phrase.trim().length >= 3)
    .sort((left, right) => right.length - left.length);
  let stripped = value;
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    stripped = stripped.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), " ");
  }
  return stripped;
}

function privateIndividualGate(candidate: TribunPackage, lexicon: KvorumEntityLexicon): KvorumGateResult {
  const failures: string[] = [];
  const claimIds: string[] = [];
  for (const block of blocks(candidate)) {
    const unknownNames = [...stripKnownEntities(block.text, lexicon).matchAll(UNKNOWN_FULL_NAME)];
    if (unknownNames.length > 0 || PRIVATE_CONTEXT.test(block.text)) {
      failures.push("The draft names or describes a private individual outside the owner-maintained public-entity lexicon.");
      if (block.claimId) claimIds.push(block.claimId);
    }
  }
  return result(
    "private-individual-scope",
    failures,
    "Every named person is in the owner-maintained public-entity lexicon and no private relation is introduced.",
    claimIds
  );
}

function alarmGate(candidate: TribunPackage): KvorumGateResult {
  const failures = blocks(candidate).filter((block) => ALARM_VOCABULARY.test(block.text) || block.text.includes("!"));
  return result(
    "alarm-vocabulary",
    failures.length > 0 ? ["The draft uses siren vocabulary or an exclamation mark to manufacture urgency."] : [],
    "The draft uses no siren vocabulary or exclamation-mark urgency.",
    failures.flatMap((block) => block.claimId ? [block.claimId] : [])
  );
}

function voterRespectGate(candidate: TribunPackage): KvorumGateResult {
  const failures = blocks(candidate).filter((block) => VOTER_MOCKERY.test(block.text));
  return result(
    "voter-respect",
    failures.length > 0 ? ["The draft mocks or attacks voters rather than a documented decision or act."] : [],
    "The draft critiques no voter group or voter intelligence.",
    failures.flatMap((block) => block.claimId ? [block.claimId] : [])
  );
}

function stopSlopGate(candidate: TribunPackage): KvorumGateResult {
  const violations = reviewArticleText(blocks(candidate).map((block) => block.text).join("\n"), "cs");
  return result(
    "stop-slop",
    violations.length > 0
      ? [`The Czech house lint found ${violations.length} blocked pattern${violations.length === 1 ? "" : "s"}: ${[...new Set(violations.map((violation) => violation.code))].join(", ")}.`]
      : [],
    "The Czech copy passes the shared deterministic stop-slop lint."
  );
}

function singleSourceLabelGate(candidate: TribunPackage): KvorumGateResult {
  const failures = candidate.claims.filter((claim) => claim.type === "fact-single" && !SINGLE_SOURCE_LABEL.test(claim.text));
  return result(
    "single-source-label",
    failures.length > 0 ? ["Every fact-single claim must visibly say that it rests on one source."] : [],
    "Every fact-single claim carries an explicit Czech single-source label.",
    failures.map((claim) => claim.id)
  );
}

function forbiddenActionGate(candidate: TribunPackage): KvorumGateResult {
  const failures = blocks(candidate).filter((block) => FORBIDDEN_ACTION.test(block.text));
  return result(
    "forbidden-action-proposal",
    failures.length > 0 ? ["The draft proposes publishing, account, channel, paid-amplification or fundraising action."] : [],
    "The draft proposes no publishing, account, channel, paid-amplification or fundraising action.",
    failures.flatMap((block) => block.claimId ? [block.claimId] : [])
  );
}

export function evaluateKvorumContentGates(input: {
  candidate: TribunPackage;
  cluster: KvorumMonitorCluster | undefined;
  items: ReadonlyMap<string, KvorumMonitorItem>;
  lexicon: KvorumEntityLexicon;
}): KvorumGateResult[] {
  return [
    singleSourceLabelGate(input.candidate),
    voteGate(input.candidate),
    endorsementGate(input.candidate, input.lexicon),
    crimeGate(input.candidate, input.cluster, input.items),
    privateIndividualGate(input.candidate, input.lexicon),
    alarmGate(input.candidate),
    voterRespectGate(input.candidate),
    stopSlopGate(input.candidate),
    forbiddenActionGate(input.candidate)
  ];
}
