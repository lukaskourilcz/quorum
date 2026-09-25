import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../../paths.js";

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
 * The languages a brand's carousel can be written in, in the order the room renders them.
 *
 * The room was bilingual from its founding. devShark ships English only since the product dropped
 * Czech (quorum#568, finding 6 of the second handoff), so the language set is now the brand's to
 * state rather than the room's to assume. The Czech path stays whole for a brand that names it.
 */
export const MARKETINGSHARK_LOCALES = ["cs", "en"] as const;
export const MarketingSharkLocaleSchema = z.enum(MARKETINGSHARK_LOCALES);
export type MarketingSharkLocale = z.infer<typeof MarketingSharkLocaleSchema>;

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
  templateMap: z.object({
    hook: z.string(),
    context: z.string(),
    reveal: z.string(),
    why: z.string(),
    footer: z.string()
  }),
  hashtags: z.object({
    instagram: z.object({ en: z.array(z.string()).max(4), cs: z.array(z.string()).max(4) }),
    threadsTopic: z.object({ en: z.string(), cs: z.string() })
  }),
  banner: z.boolean(),
  /** Absent for a brand nobody has described yet; the packet then carries the brand block alone. */
  factSheet: FactSheet.optional()
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
