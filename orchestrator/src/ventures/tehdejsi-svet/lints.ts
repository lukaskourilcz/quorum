import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../../paths.js";

/**
 * The craft rules, as functions rather than as advice in a prompt.
 *
 * A prompt asks. These refuse. Every rule here is one the founding decision made blocking, and
 * each costs a package rather than a run — a rejected draft is the system working, because
 * nothing here is published without the owner anyway.
 *
 * They are deterministic and free. None of them calls a model, so the safety spine keeps
 * working on a day the budget stopped every room.
 */
export const TerminologyEntrySchema = z.object({
  id: z.string().min(1),
  language: z.enum(["cs", "uk"]),
  forbidden: z.array(z.string().min(1)).min(1),
  replacement: z.string().min(1),
  reason: z.string().min(1)
}).strict();

export const TerminologyTableSchema = z.object({
  schemaVersion: z.literal("tehdejsi-terminology/1"),
  _comment: z.string().optional(),
  entries: z.array(TerminologyEntrySchema).min(1)
}).strict();
export type TerminologyTable = z.infer<typeof TerminologyTableSchema>;

export interface LintFinding {
  rule: string;
  detail: string;
}

export async function loadTerminologyTable(root = configRoot): Promise<TerminologyTable> {
  return TerminologyTableSchema.parse(
    JSON.parse(await readFile(path.join(root, "tehdejsi-terminology.json"), "utf8"))
  );
}

export function terminologyFindings(
  copy: string,
  language: "cs" | "uk",
  table: TerminologyTable
): LintFinding[] {
  const haystack = copy.toLowerCase();
  return table.entries
    .filter((entry) => entry.language === language)
    .flatMap((entry) => entry.forbidden
      .filter((phrase) => haystack.includes(phrase.toLowerCase()))
      .map((phrase) => ({
        rule: `terminology:${entry.id}`,
        detail: `"${phrase}" must be "${entry.replacement}" — ${entry.reason}`
      })));
}

/** Nostalgia belongs to kitchens and schoolyards, never to a system that surrounded them. */
const NOSTALGIA_FOR_THE_SYSTEM = [
  /lep[šs][íi] (?:doby|[čc]asy) za (?:komunismu|soci[áa]lismu)/iu,
  /za (?:komunismu|soci[áa]lismu) (?:bylo|bývalo) l[ée]pe/iu,
  /кращі часи за (?:срср|радянськ)/iu
];

/** A Ukrainian city under attack is remembrance, never a then-and-now contrast. */
const DESTRUCTION_CONTRAST = [
  /(?:tehdy a dnes|then and now|тоді і зараз|colour|dnes v troskách)/iu,
  /(?:před v[áa]lkou a po|до і після війни)/iu
];

const AI_IMAGERY = /(?:midjourney|dall[- ]?e|stable diffusion|ai[- ](?:generated|generov)|згенеровано (?:ші|ai))/iu;

const FLAG_AS_BRAND = /(?:\u{1F1E8}\u{1F1FF}|\u{1F1FA}\u{1F1E6})/u;

/**
 * Every blocking craft rule in one pass.
 *
 * `tier` raises the bar rather than changing which rules apply: at tier 2 a participation prompt
 * or a light format is itself a finding, because those subjects are remembrance and an
 * engagement ask on them is the failure mode the venture exists to avoid.
 */
export function craftFindings(input: {
  copy: string;
  language: "cs" | "uk";
  tier: 0 | 1 | 2;
  table: TerminologyTable;
  /** True when the feature is about a place currently under attack or occupation. */
  wartimeSubject?: boolean;
}): LintFinding[] {
  const findings = terminologyFindings(input.copy, input.language, input.table);
  for (const pattern of NOSTALGIA_FOR_THE_SYSTEM) {
    if (pattern.test(input.copy)) {
      findings.push({
        rule: "nostalgia:system",
        detail: "Nostalgia is allowed for the everyday detail, never for the system around it."
      });
      break;
    }
  }
  if (AI_IMAGERY.test(input.copy)) {
    findings.push({
      rule: "imagery:ai-generated",
      detail: "AI-generated historical imagery must never be presented as period material."
    });
  }
  if (FLAG_AS_BRAND.test(input.copy)) {
    findings.push({
      rule: "brand:national-flag",
      detail: "Flags are not brand elements. This is a project about people, time and memory."
    });
  }
  if (input.wartimeSubject) {
    for (const pattern of DESTRUCTION_CONTRAST) {
      if (pattern.test(input.copy)) {
        findings.push({
          rule: "wartime:destruction-contrast",
          detail: "A city under attack is remembrance, never a then-and-now contrast."
        });
        break;
      }
    }
  }
  if (input.tier === 2 && /\?\s*$/mu.test(input.copy.trim())) {
    findings.push({
      rule: "tier2:participation-prompt",
      detail: "A tier-2 feature carries no participation prompt and no tagging call."
    });
  }
  return findings;
}

/**
 * The one question the gate asks.
 *
 * A finding is blocking. There is no severity ladder here on purpose: a rule the room may ship
 * past is a rule that will be shipped past.
 */
export function craftGatePasses(findings: readonly LintFinding[]): boolean {
  return findings.length === 0;
}
