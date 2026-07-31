import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { ContractSchemas, jsonSchemaText, type ContractName } from "../src/contracts/json-schema.js";

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
