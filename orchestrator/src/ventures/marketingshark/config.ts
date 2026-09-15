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

export const Brand = z.object({
  id: z.enum(["devshark", "geoshark"]),
  enabled: z.boolean(),
  displayName: z.string(),
  productUrl: z.string().url(),
  tone: z.enum(["dev", "geo"]),
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
  brands: z.array(Brand).min(1)
}).superRefine((cfg, ctx) => {
  if (cfg.brands.some((b) => b.id === "geoshark" && b.banner))
    ctx.addIssue({ code: "custom", message: "geoShark never gets a banner" });
});
export type MarketingSharkConfig = z.infer<typeof MarketingSharkConfig>;

/**
 * The per-tone override that used to live here, and why it is gone.
 *
 * `requirementsForTone` rewrote `hasCode` to `optionsAtLeast:4` for the geo tone, so the geo
 * variant of a code-gated hook would not be permanently dead. Against the central library that
 * rewrite would publish a falsehood: the shipped geo line under `hasCode` reads "There's code on a
 * geography card. Start there.", and substituting the gate would render it on any four-option
 * geography question, where there is no code at all.
 *
 * `docs/hooks/04-schema-and-gates.md` calls this out as a known bug class and prescribes the other
 * handling — write the variant to be honest if it ever fires, and lint for the unreachability. The
 * `unreachable-variant` warning in `lint:hooks` is that check, and it names exactly these three
 * hooks. An honest silence beats a rendered falsehood.
 */
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
