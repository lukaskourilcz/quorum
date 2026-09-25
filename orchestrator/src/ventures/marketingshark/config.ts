import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../../paths.js";
import { HOOK_PATTERN_SLOTS, ROTATION_KINDS, weekdayOf, WEEKDAYS, type RotationKind, type Weekday } from "./kinds.js";

/**
 * Hook copy is no longer configuration.
 *
 * This file used to carry a sixteen-pattern `hookLibrary` inline. It now lives at
 * `studio/hooks/quiz.hooks.json`, beside the Carousel Studio engine, because the studio is the
 * assignment brain for every surface and the quiz apps receive the same library as a bounded
 * delivery. Two copies of one playbook drift within weeks — `docs/hooks/README.md` says so, and the
 * two libraries had already diverged: the inline one still shipped `speed-run` ("You have 10
 * seconds. Go.") against a card with no timer, which `docs/hooks/02-hook-craft-rules.md` bans
 * outright, and `looks-easy`, which was retired for warning readers off the intuitive answer.
 *
 * What stays here is what is genuinely per brand: the category lists a `categoryIn` gate resolves
 * against, the slide-5 line, the templates and the hashtags.
 */
/**
 * What is true about the product beyond its name and address, in the owner's words.
 *
 * CHUM used to see only the brand block, and every shipped string spoke of a live product. The
 * owner said on 2026-09-15 that devShark is nearly finished and in testing, so the packet has to
 * say what the product is today and what may never be claimed about it. The gates cannot catch a
 * false premise handed in as config; this is where the premise is kept true.
 */
export const FactSheet = z.object({
  /**
   * The first run date these facts govern. The sheet is a list of dated blocks, so a change to the
   * product's facts is one new block rather than edits scattered through one: the owner appends the
   * block, dated the day it becomes true, and the room reads the newest block in effect.
   */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  source: z.string().min(1).max(240),
  maturity: z.string().min(1).max(240),
  whatVisitorsCanDo: z.string().min(1).max(400),
  callToAction: z.string().min(1).max(200),
  allowedClaims: z.array(z.string().min(1).max(200)).min(1).max(8),
  neverClaim: z.array(z.string().min(1).max(200)).min(1).max(10)
});
export type FactSheet = z.infer<typeof FactSheet>;

/**
 * The one rule no fact sheet can change: Meta's spam standards forbid "offering to provide anything
 * of monetary value in exchange for engagement" and LinkedIn forbids artificial engagement (second
 * handoff, finding 5). The packet states it whatever block is in effect, and a gate enforces it.
 */
export const ENGAGEMENT_NEVER_CLAIM =
  "Coins, discounts, access or any other reward for following, liking, sharing or commenting: no slide, caption or hashtag may promise one.";

/**
 * The languages a brand's carousel can be written in, in the order the room renders them.
 *
 * The room was bilingual from its founding. devShark ships English only since the product dropped
 * Czech (quorum#568, finding 6 of the second handoff), so the language set is now the brand's to
 * state rather than the room's to assume. The Czech path stays whole for a brand that names it.
 */
export const MARKETINGSHARK_LOCALES = ["cs", "en"] as const;
export const MarketingSharkLocaleSchema = z.enum(MARKETINGSHARK_LOCALES);
export type MarketingSharkLocale = z.infer<typeof MarketingSharkLocaleSchema>;

const TemplateId = z.string().min(1).max(80);
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(60);

/** A slide-1 line code fills from facts it holds. English only: the kinds beyond the quiz are. */
const PatternHook = z.object({ source: z.literal("pattern"), id: Slug, en: z.string().min(1).max(80) });

/** A code-owned closing line, copied verbatim like the quiz's slide-5 line. */
const FooterLine = z.object({ en: z.string().min(1).max(100) });

function onlySlots(kind: keyof typeof HOOK_PATTERN_SLOTS) {
  const allowed = new Set<string>(HOOK_PATTERN_SLOTS[kind]);
  return (hook: { en: string }) => [...hook.en.matchAll(/\{([a-zA-Z]+)\}/gu)].every((match) => allowed.has(match[1]!));
}

/**
 * The weekday rotation's kinds, each a slide-1 pattern and a template per slide (quorum#576).
 *
 * The quiz keeps the central hook library (`source: "library"`); the announcement's slide 1 is the
 * owner's (`source: "owner"`). The three others fill a fixed pattern with facts code holds, and a
 * pattern may name only its kind's slots, so no config edit can make slide 1 claim something new.
 */
export const PostKindsSchema = z.object({
  quiz: z.object({
    hookPattern: z.object({ source: z.literal("library") }),
    templateMap: z.object({ hook: TemplateId, context: TemplateId, reveal: TemplateId, why: TemplateId, footer: TemplateId })
  }),
  "feature-spotlight": z.object({
    hookPattern: PatternHook.refine(onlySlots("feature-spotlight"), { message: "the spotlight pattern may name {displayName} and {screen} only" }),
    templateMap: z.object({ hook: TemplateId, what: TemplateId, how: TemplateId, why: TemplateId, footer: TemplateId }),
    footer: FooterLine,
    /**
     * The screens a spotlight can show, in rotation order. `factTerm` has to appear in the fact
     * sheet in effect or the screen sits the week out: a screen the owner's facts do not name is
     * not one the room may describe.
     */
    screens: z.array(z.object({ id: Slug, name: z.string().min(1).max(40), factTerm: z.string().min(3).max(60) })).min(1).max(20)
  }).optional(),
  "challenge-teaser": z.object({
    hookPattern: PatternHook.refine(onlySlots("challenge-teaser"), { message: "the challenge pattern may name {difficulty} and {title} only" }),
    templateMap: z.object({ hook: TemplateId, prompt: TemplateId, hint: TemplateId, try: TemplateId, footer: TemplateId }),
    footer: FooterLine,
    /** The committed snapshot of devShark's coding challenges, and the one label a teaser draws from. */
    challengeBank: z.object({ snapshotPath: z.string().min(1), sourceRepo: z.string().min(1), difficulty: z.literal("easy") })
  }).optional(),
  "this-week": z.object({
    hookPattern: PatternHook.refine(onlySlots("this-week"), { message: "the week's pattern may name {displayName} only" }),
    templateMap: z.object({ hook: TemplateId, theme: TemplateId, recap: TemplateId, pick: TemplateId, footer: TemplateId }),
    footer: FooterLine,
    /** The theme when neither a trend hook nor the week's own questions name one. */
    themeFallback: z.string().min(1).max(18)
  }).optional(),
  announcement: z.object({
    hookPattern: z.object({ source: z.literal("owner") }),
    templateMap: z.object({ hook: TemplateId, news: TemplateId, detail: TemplateId, next: TemplateId, footer: TemplateId })
  }).optional()
});
export type PostKindsConfig = z.infer<typeof PostKindsSchema>;

const RotationSlot = z.enum(ROTATION_KINDS).nullable();

/** Which kind each weekday drafts; null is no room that day. */
export const RotationSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, RotationSlot])) as Record<Weekday, typeof RotationSlot>
).strict();
export type Rotation = z.infer<typeof RotationSchema>;

/**
 * devShark is the one brand.
 *
 * A second, disabled brand sat here from the founding, pointed at StudyShark's geography bank.
 * StudyShark moved out of react-express-app on 2026-09-24 and its deployment is paused, so there is
 * no product left for a second brand to promote. A schema that still accepted one would let a
 * config edit revive a retired product without any code noticing.
 */
export const Brand = z.object({
  id: z.literal("devshark"),
  enabled: z.boolean(),
  displayName: z.string(),
  productUrl: z.string().url(),
  /** The hook vertical the studio serves this brand's slide-1 lines from. */
  tone: z.literal("dev"),
  /**
   * What the writer writes, the renderer draws and the queue carries. English is always one of
   * them: the LinkedIn caption and every channel's first item are English.
   */
  locales: z.array(MarketingSharkLocaleSchema).min(1).max(MARKETINGSHARK_LOCALES.length)
    .refine((locales) => new Set(locales).size === locales.length, { message: "a language may be named once" })
    .refine((locales) => locales.includes("en"), { message: "English is always written" }),
  questionBank: z.object({
    snapshotPath: z.string(),
    sourceRepo: z.string(),
    sourceSubject: z.string()
  }),
  categoryLists: z.record(z.string(), z.array(z.string())),
  slide5: z.object({ en: z.string(), cs: z.string() }),
  rotation: RotationSchema,
  postKinds: PostKindsSchema,
  hashtags: z.object({
    instagram: z.object({ en: z.array(z.string()).max(4), cs: z.array(z.string()).max(4) }),
    threadsTopic: z.object({ en: z.string(), cs: z.string() })
  }),
  banner: z.boolean(),
  /**
   * Absent for a brand nobody has described yet; the packet then carries the brand block alone.
   * Oldest first, one block per date.
   */
  factSheets: z.array(FactSheet).min(1).max(6)
    .refine((sheets) => sheets.every((sheet, index) => index === 0 || sheets[index - 1]!.effectiveFrom < sheet.effectiveFrom), {
      message: "fact sheet blocks run oldest first, one per effectiveFrom date"
    })
    .optional()
}).superRefine((brand, context) => {
  for (const weekday of WEEKDAYS) {
    const kind = brand.rotation[weekday];
    if (kind && !brand.postKinds[kind]) {
      context.addIssue({ code: "custom", message: `${weekday} names ${kind}, which postKinds does not configure`, path: ["rotation", weekday] });
    }
  }
});
export type Brand = z.infer<typeof Brand>;

export const MarketingSharkConfig = z.object({
  schemaVersion: z.literal("marketingshark-config/1"),
  meetingPhase: z.literal("ms-daily"),
  pragueHour: z.literal(7),
  abVariants: z.literal(2),
  minEligibleBeforeRelax: z.literal(2),
  brands: z.array(Brand).length(1)
});
export type MarketingSharkConfig = z.infer<typeof MarketingSharkConfig>;

/**
 * The facts in effect on a run date: the newest block whose `effectiveFrom` is not after it.
 *
 * A date before the first block reads the first block. Those are the oldest facts on record, and
 * the writer is never handed a described brand with no facts at all.
 */
export function factSheetFor(brand: Pick<Brand, "factSheets">, date: string): FactSheet | null {
  const sheets = brand.factSheets ?? [];
  return sheets.filter((sheet) => sheet.effectiveFrom <= date).at(-1) ?? sheets[0] ?? null;
}

/** The kind the rotation schedules for a run date, or null on a day with no room. */
export function scheduledKind(brand: Pick<Brand, "rotation">, date: string): RotationKind | null {
  return brand.rotation[weekdayOf(date)];
}

/** The brand's languages in the room's own order, so every loop over them agrees. */
export function brandLocales(brand: Pick<Brand, "locales">): MarketingSharkLocale[] {
  return MARKETINGSHARK_LOCALES.filter((locale) => brand.locales.includes(locale));
}

export function enabledBrands(config: MarketingSharkConfig): Brand[] {
  return config.brands.filter((brand) => brand.enabled);
}

export function parseMarketingSharkConfig(value: unknown): MarketingSharkConfig {
  return MarketingSharkConfig.parse(value);
}

export async function loadMarketingSharkConfig(
  filePath = path.join(configRoot, "marketingshark.json")
): Promise<MarketingSharkConfig> {
  return parseMarketingSharkConfig(JSON.parse(await readFile(filePath, "utf8")));
}
