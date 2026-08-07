import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../../paths.js";

/**
 * A hook pattern: one opening line per tone per language, with the conditions under which it is
 * allowed to be said at all.
 *
 * `truthRequires` is the honesty mechanism. "Two answers look right. One is." is a claim about the
 * question, not a slogan, so it may only front a question that actually has four options and is
 * not trivial. Every predicate is deterministic and evaluated in code against the NormalizedQuestion
 * -- a model never decides whether its own hook was true.
 *
 *  always                     -- no condition
 *  difficultyAtLeast:N        -- question.difficulty >= N
 *  optionsAtLeast:N           -- question.en.options.length >= N
 *  hasCode                    -- question.hasCode === true
 *  categoryIn:<listKey>       -- question.category is in brand.categoryLists[listKey]
 *  questionStartsWith:<word>  -- EN question text starts with <word>
 */
export const HookPattern = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  cooldownDays: z.number().int().min(1).max(30),
  truthRequires: z.array(z.string()).min(1),
  variants: z.record(
    z.enum(["dev", "geo"]),
    z.object({
      en: z.string().min(1),
      cs: z.string().min(1)
    })
  )
});
export type HookPattern = z.infer<typeof HookPattern>;

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
  banner: z.boolean()
});
export type Brand = z.infer<typeof Brand>;

export const MarketingSharkConfig = z.object({
  schemaVersion: z.literal("marketingshark-config/1"),
  meetingPhase: z.literal("ms-daily"),
  pragueHour: z.literal(7),
  abVariants: z.literal(2),
  minEligibleBeforeRelax: z.literal(2),
  brands: z.array(Brand).min(1),
  hookLibrary: z.array(HookPattern).min(15).max(20)
}).superRefine((cfg, ctx) => {
  if (cfg.brands.some((b) => b.id === "geoshark" && b.banner))
    ctx.addIssue({ code: "custom", message: "geoShark never gets a banner" });
});
export type MarketingSharkConfig = z.infer<typeof MarketingSharkConfig>;

/** What a truth predicate is evaluated against. Kept structural so tests need no full snapshot. */
export interface TruthSubject {
  difficulty: number;
  hasCode: boolean;
  category: string;
  optionCount: number;
  englishQuestion: string;
}

/**
 * The one per-tone override, and the reason it exists.
 *
 * `spot-it` reads "Spot it before the compiler does" for dev and "Spot the odd one out" for geo.
 * The dev line is only true of a question carrying code, so its predicate is `hasCode` -- but a
 * geography bank has no code at all, which would make the geo variant permanently ineligible
 * rather than differently conditioned. Substituting `optionsAtLeast:4` keeps the geo line
 * conditional on something real about the question instead of on something its bank can never
 * have. This is the only override, and adding a second one belongs in a decision record.
 */
export function requirementsForTone(pattern: HookPattern, tone: Brand["tone"]): string[] {
  if (tone !== "geo") return pattern.truthRequires;
  return pattern.truthRequires.map((requirement) =>
    requirement === "hasCode" ? "optionsAtLeast:4" : requirement
  );
}

export function evaluateTruthRequirement(
  requirement: string,
  subject: TruthSubject,
  categoryLists: Brand["categoryLists"]
): boolean {
  const [name, argument] = requirement.split(":", 2);
  switch (name) {
    case "always":
      return true;
    case "hasCode":
      return subject.hasCode;
    case "difficultyAtLeast":
      return subject.difficulty >= Number(argument);
    case "optionsAtLeast":
      return subject.optionCount >= Number(argument);
    case "categoryIn":
      return (categoryLists[argument ?? ""] ?? []).includes(subject.category);
    case "questionStartsWith":
      return subject.englishQuestion.trimStart().toLowerCase().startsWith((argument ?? "").toLowerCase());
    default:
      // An unknown predicate fails closed. Reading it as "no condition" would silently promote a
      // typo into an always-eligible hook, which is the one direction this must never fail in.
      return false;
  }
}

export function patternIsTruthful(
  pattern: HookPattern,
  tone: Brand["tone"],
  subject: TruthSubject,
  categoryLists: Brand["categoryLists"]
): boolean {
  return requirementsForTone(pattern, tone)
    .every((requirement) => evaluateTruthRequirement(requirement, subject, categoryLists));
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
