import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  MARKETING_CALENDAR_HOOK_TYPES,
  MARKETING_CALENDAR_KINDS,
  MARKETING_CALENDAR_OWNER_STATUSES,
  MARKETING_CALENDAR_PLATFORMS,
  MARKETING_CALENDAR_PRODUCERS,
  MARKETING_CALENDAR_STATUSES,
  MarketingCalendarSchema
} from "../src/contracts/marketing-calendar.js";

/*
 * The site cannot import this package, so `site/src/lib/marketing-calendar-model.ts` repeats the
 * contract's enumerations. Two copies of one list drift unless something fails when they do.
 */
async function siteList(name: string): Promise<string[]> {
  const source = await readFile(path.join(repoRoot, "site", "src", "lib", "marketing-calendar-model.ts"), "utf8");
  const literal = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const;`, "u").exec(source)?.[1];
  if (literal === undefined) throw new Error(`${name} is not declared as a literal list`);
  return [...literal.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!);
}

describe("marketing-calendar/1 site parity", () => {
  it.each([
    ["CALENDAR_PLATFORMS", MARKETING_CALENDAR_PLATFORMS],
    ["CALENDAR_KINDS", MARKETING_CALENDAR_KINDS],
    ["CALENDAR_STATUSES", MARKETING_CALENDAR_STATUSES],
    ["CALENDAR_OWNER_STATUSES", MARKETING_CALENDAR_OWNER_STATUSES],
    ["CALENDAR_PRODUCERS", MARKETING_CALENDAR_PRODUCERS],
    ["CALENDAR_HOOK_TYPES", MARKETING_CALENDAR_HOOK_TYPES]
  ] as const)("keeps %s in step with the contract", async (name, contract) => {
    expect(await siteList(name)).toEqual([...contract]);
  });

  it.each(["marketingshark", "caught-up"])("accepts the committed %s plan", async (venture) => {
    const plan = JSON.parse(await readFile(path.join(repoRoot, "state", "marketing-calendar", `${venture}.json`), "utf8"));
    const result = MarketingCalendarSchema.safeParse(plan);
    expect(result.success ? [] : result.error.issues.slice(0, 5)).toEqual([]);
  });
});
