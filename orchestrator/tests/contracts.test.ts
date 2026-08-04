import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { AudienceSpecSchema } from "../src/contracts/audience-spec.js";
import { ContractSchemas, jsonSchemaText, type ContractName } from "../src/contracts/json-schema.js";
import { MarketingPlanSchema } from "../src/contracts/marketing-plan.js";
import { NicheProposalSchema } from "../src/contracts/niche-proposal.js";
import { SeasonFileSchema } from "../src/contracts/season.js";
import { hasValidArticlePackageHash } from "../src/mma-files/hash.js";
import { ArticlePackageSchema } from "../src/contracts/mma-files.js";

const contractNames = Object.keys(ContractSchemas) as ContractName[];

async function fixture(name: ContractName, kind: "valid" | "poison") {
  const source = await readFile(path.join(repoRoot, "contracts", "fixtures", `${name}.${kind}.json`), "utf8");
  return JSON.parse(source) as unknown;
}

describe("published contracts", () => {
  it.each(contractNames)("accepts the %s golden fixture", async (name) => {
    expect(ContractSchemas[name].safeParse(await fixture(name, "valid")).success).toBe(true);
  });

  it.each(contractNames)("rejects the %s poison fixture", async (name) => {
    expect(ContractSchemas[name].safeParse(await fixture(name, "poison")).success).toBe(false);
  });

  it.each(contractNames)("keeps the committed %s JSON Schema current", async (name) => {
    const committed = await readFile(path.join(repoRoot, "contracts", `${name}.schema.json`), "utf8");
    expect(committed).toBe(jsonSchemaText(name));
  });

  // A dry mag-editorial room copies this fixture into the slate it writes, so any path the
  // fixture names is republished as the desk's own cited evidence. Both verdicts cited
  // state/ideas/mma-files/ledger.jsonl, a file this repository has never held, and the copy
  // reached state/ventures/mma-files/slates/2026-08-01.json. A verdict either names a file a
  // reviewer can open or does not look like a file at all.
  it("cites no missing file in the editorial-slate fixture", async () => {
    const slate = await fixture("editorial-slate", "valid") as {
      vaultVerdicts: ReadonlyArray<{ evidenceRef: string }>;
    };
    const repoPaths = slate.vaultVerdicts
      .map((verdict) => verdict.evidenceRef)
      .filter((reference) => /^(state|config|site|orchestrator|contracts)\//u.test(reference));
    expect(repoPaths.filter((reference) => !existsSync(path.join(repoRoot, reference.split("#")[0]!))))
      .toEqual([]);
  });
});

describe("portfolio contract boundaries", () => {
  it("enforces the adult audience floor and public interest list", async () => {
    const valid = await fixture("audience-spec", "valid") as Record<string, unknown>;
    expect(AudienceSpecSchema.safeParse(valid).success).toBe(true);

    const underage = structuredClone(valid) as { ageRange: { min: number } };
    underage.ageRange.min = 17;
    expect(AudienceSpecSchema.safeParse(underage).success).toBe(false);

    const unknownInterest = structuredClone(valid) as { interests: string[] };
    unknownInterest.interests = ["personal-uploaded-customer-list"];
    expect(AudienceSpecSchema.safeParse(unknownInterest).success).toBe(false);
  });

  it("requires exactly four season products", async () => {
    const valid = await fixture("season", "valid") as { products: unknown[] };
    expect(SeasonFileSchema.safeParse(valid).success).toBe(true);
    expect(SeasonFileSchema.safeParse({ ...valid, products: valid.products.slice(0, 3) }).success).toBe(false);
    expect(SeasonFileSchema.safeParse({ ...valid, products: [...valid.products, valid.products[0]] }).success).toBe(false);
  });

  it("labels every marketing cost as an estimate", async () => {
    const valid = await fixture("marketing-plan", "valid") as {
      tactics: Array<Record<string, unknown>>;
    };
    expect(MarketingPlanSchema.safeParse(valid).success).toBe(true);
    const unlabeled = structuredClone(valid);
    delete unlabeled.tactics[0]?.estimate;
    expect(MarketingPlanSchema.safeParse(unlabeled).success).toBe(false);
  });

  it("requires evidence for quantitative niche claims", async () => {
    const poison = await fixture("niche-proposal", "poison");
    expect(NicheProposalSchema.safeParse(poison).success).toBe(false);
  });
});

describe("Czech is the required locale and English is optional", () => {
  it("keeps the en key on a sealed bilingual package so its hash still matches", async () => {
    // The worst failure mode available here: if making en optional had switched these to a
    // stripping object, loading the one live article would drop its English half, the
    // recomputed hash would not match, and store.ts would throw on every future cycle —
    // wedging MMA delivery permanently. openObject is z.looseObject precisely to prevent that.
    const stored = JSON.parse(
      await readFile(path.join(repoRoot, "state/ventures/mma-files/articles/2026-08-02-am-ufc-valentina-shevchenko.json"), "utf8")
    ) as unknown;
    const parsed = ArticlePackageSchema.parse(stored);
    expect(parsed.localizations.en, "the sealed package keeps its English half").toBeDefined();
    expect(hasValidArticlePackageHash(parsed), "and still hashes to its stored value").toBe(true);
  });

  it("accepts an article with no English at all", async () => {
    const valid = await fixture("article", "valid") as { localizations: Record<string, unknown> };
    const czechOnly = { ...valid, localizations: { cs: valid.localizations.cs } };
    expect(ArticlePackageSchema.safeParse(czechOnly).success).toBe(true);
  });

  it("still refuses an article with no Czech, and for that reason alone", async () => {
    const poison = await fixture("article", "poison");
    const result = ArticlePackageSchema.safeParse(poison);
    expect(result.success).toBe(false);
    // The fixture used to be missing its image too, so it went on passing this test while no
    // longer testing the invariant its slug names.
    const reasons = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(reasons).toEqual(["localizations.cs"]);
  });
});
