import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { AudienceSpecSchema } from "../src/contracts/audience-spec.js";
import { ContractSchemas, jsonSchemaText, type ContractName } from "../src/contracts/json-schema.js";
import { MarketingPlanSchema } from "../src/contracts/marketing-plan.js";
import { NicheProposalSchema } from "../src/contracts/niche-proposal.js";
import { SeasonFileSchema } from "../src/contracts/season.js";

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
