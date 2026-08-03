import { readFile } from "node:fs/promises";
import path from "node:path";
import { EditorialSlateSchema } from "../contracts/mma-files.js";
import { pragueClockParts } from "../meetings/clock.js";
import { pragueSlotInstant } from "../meetings/calendar.js";
import { repoRoot } from "../paths.js";
import { produceMmaFilesArticle, type MmaFilesEditorialGateway } from "./pipeline.js";

const dryGateway: MmaFilesEditorialGateway = {
  async writeCzech({ slot }) {
    return slot === "am" ? {
      title: "Alex Example se na zkušební kartě utká se Samem Examplem",
      dek: "Suchý běh kontroluje článek a netvrdí, že skutečný turnaj existuje.",
      // Long enough to build a real deck. A dry run that skips the carousel proves the article
      // path and leaves the part most likely to break untested.
      bodyMDX: [
        "## Zkušební zápas",
        "",
        "[Alex Example](/fighters/ufc/alex-example) má zkušební bilanci 12-2. [^source-1]",
        "",
        "[Sam Example](/fighters/ufc/sam-example) má zkušební bilanci 10-3. [^source-1]",
        "",
        "Oba zápasníci se v hlavním zápase potkávají poprvé a soubor u obou uvádí shodně vedenou bilanci. [^source-1]",
        "",
        "Rozdíl je v cestě k výsledku: jeden vítězí častěji v postoji, druhý se opírá o zemní práci. [^source-1]",
        "",
        "Ověřená data neuvádějí u žádného z nich zranění, které by kartu ohrozilo. [^source-1]",
        "",
        "Karta se koná v Praze a je to teprve druhý zkušební turnaj v tomto městě. [^source-1]"
      ].join("\n"),
      imageAlt: "Typografická zkušební karta pro Alexe Examplea a Sama Examplea"
    } : {
      title: "Eva Example vstupuje do zkušebního profilu bojovnice",
      dek: "Suchý profil hlídá stejná pravidla pro zdroje jako živá redakce.",
      bodyMDX: [
        "## Zkušební profil",
        "",
        "[Eva Example](/fighters/oktagon/eva-example) má zkušební bilanci 8-1. [^source-1]",
        "",
        "[Anna Example](/fighters/oktagon/anna-example) má zkušební bilanci 7-2. [^source-1]",
        "",
        "Profil sleduje pět posledních zápasů a u každého uvádí způsob ukončení i délku trvání. [^source-1]",
        "",
        "Soubor upozorňuje na jeden nesoulad v bilanci, který zatím nebyl vyřešen. [^source-1]",
        "",
        "Zkušební data neobsahují žádnou informaci o nadcházejícím soupeři. [^source-1]",
        "",
        "Profil zůstává otevřený, dokud se nepotvrdí zařazení na některou z karet. [^source-1]"
      ].join("\n"),
      imageAlt: "Typografický zkušební profil Evy Example"
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
  const publishAt = pragueSlotInstant(pragueClockParts(input.now).date, morning ? 10 : 18);
  return produceMmaFilesArticle({
    root: input.root,
    slate,
    slot: input.slot,
    slug: morning ? "fixture-fight-preview" : "fixture-fighter-profile",
    publishAt,
    mode: "live-analysis",
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
