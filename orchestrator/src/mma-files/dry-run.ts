import { readFile } from "node:fs/promises";
import path from "node:path";
import { EditorialSlateSchema } from "../contracts/mma-files.js";
import { repoRoot } from "../paths.js";
import { produceMmaFilesArticle, type MmaFilesEditorialGateway } from "./pipeline.js";

const dryGateway: MmaFilesEditorialGateway = {
  async writeEnglish({ slot }) {
    return slot === "am" ? {
      title: "Alex Example meets Sam Example in the fixture card",
      dek: "The dry run checks a bilingual article without claiming a real event exists.",
      bodyMDX: "## Fixture matchup\n\n[Alex Example](/fighters/ufc/alex-example) carries a 12-2 fixture record. [^source-1]\n\n[Sam Example](/fighters/ufc/sam-example) carries a 10-3 fixture record. [^source-1]"
    } : {
      title: "Eva Example enters the fixture fighter file",
      dek: "This dry profile checks the same evidence rules as a live newsroom slot.",
      bodyMDX: "## Fixture profile\n\n[Eva Example](/fighters/oktagon/eva-example) carries an 8-1 fixture record. [^source-1]\n\n[Anna Example](/fighters/oktagon/anna-example) carries a 7-2 fixture record. [^source-1]"
    };
  },
  async localizeCzech({ slot }) {
    return slot === "am" ? {
      title: "Alex Example se na zkušební kartě utká se Samem Examplem",
      dek: "Suchý běh kontroluje dvojjazyčný článek a netvrdí, že skutečný turnaj existuje.",
      bodyMDX: "## Zkušební zápas\n\n[Alex Example](/fighters/ufc/alex-example) má zkušební bilanci 12-2. [^source-1]\n\n[Sam Example](/fighters/ufc/sam-example) má zkušební bilanci 10-3. [^source-1]"
    } : {
      title: "Eva Example vstupuje do zkušebního profilu bojovnice",
      dek: "Suchý profil hlídá stejná pravidla pro zdroje jako živá redakce.",
      bodyMDX: "## Zkušební profil\n\n[Eva Example](/fighters/oktagon/eva-example) má zkušební bilanci 8-1. [^source-1]\n\n[Anna Example](/fighters/oktagon/anna-example) má zkušební bilanci 7-2. [^source-1]"
    };
  }
};

export async function runDryArticleProduction(input: {
  root: string;
  slot: "am" | "pm";
  now: Date;
}) {
  const slate = EditorialSlateSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts", "fixtures", "editorial-slate.valid.json"),
    "utf8"
  )));
  const morning = input.slot === "am";
  return produceMmaFilesArticle({
    root: input.root,
    slate,
    slot: input.slot,
    slug: morning ? "fixture-fight-preview" : "fixture-fighter-profile",
    publishAt: input.now,
    mode: "data-only",
    evidence: {
      sources: [{ kind: "internal", ref: `FIXTURE:MMA-FILES:${input.slot}` }],
      fighterRefs: morning
        ? ["ufc:alex-example", "ufc:sam-example"]
        : ["oktagon:eva-example", "oktagon:anna-example"],
      ...(morning ? { eventRef: "ufc:event:fixture-prague" } : {}),
      heroSpec: {
        template: morning ? "tale-of-the-tape" : "fighter-file",
        bindings: {
          headline: morning ? "Alex Example vs Sam Example" : "Eva Example",
          fixture: true
        }
      },
      evidenceText: "Synthetic fixture only. No real fighter, event or result is represented."
    },
    gateway: dryGateway
  });
}
