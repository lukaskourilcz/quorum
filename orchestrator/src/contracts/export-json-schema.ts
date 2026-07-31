import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "../paths.js";
import { ContractSchemas, jsonSchemaText } from "./json-schema.js";

const outputRoot = path.join(repoRoot, "contracts");

await mkdir(outputRoot, { recursive: true });
await Promise.all(
  Object.keys(ContractSchemas).map(async (name) => {
    const contractName = name as keyof typeof ContractSchemas;
    await writeFile(path.join(outputRoot, `${name}.schema.json`), jsonSchemaText(contractName));
  })
);
