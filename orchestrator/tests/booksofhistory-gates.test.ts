import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BhDossierSchema, type BhDossier } from "../src/contracts/bh-dossier.js";
import { repoRoot } from "../src/paths.js";
import {
  BH_LEGEND_FRAMING,
  gateBhLanguageFeature,
  gateBhTwinFeature,
  type BhLanguageFeature,
  type BhProductionGateCode
} from "../src/ventures/booksofhistory/produce.js";

async function dossier(): Promise<BhDossier> {
  return BhDossierSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
    "utf8"
  )));
}

function feature(locale: "cs" | "en", claimRef: string): BhLanguageFeature {
  return {
    schemaVersion: "bh-language-feature/1",
    locale,
    headline: locale === "cs" ? "Příběh jedné cesty k vydání" : "A story about the route to publication",
    slides: [
      { role: "hook", text: locale === "cs" ? "Kniha začala jinak, než se zdá." : "The book began differently than it seems.", factualSentences: [] },
      {
        role: "context",
        text: locale === "cs" ? "Archiv zachycuje cestu knihy." : "The archive records the book's route.",
        factualSentences: [{
          text: locale === "cs" ? "Knižní vydání vyšlo roku 1936." : "The book edition appeared in 1936.",
          claimRefs: [claimRef]
        }]
      },
      { role: "turn", text: locale === "cs" ? "Překážka změnila jeho přijetí." : "The obstacle changed its reception.", factualSentences: [] },
      { role: "ending", text: locale === "cs" ? "Historie vydání mění pohled na dílo." : "Its publishing history changes the view of the work.", factualSentences: [] }
    ],
    caption: locale === "cs" ? "Doložený příběh vydání." : "A sourced publishing story.",
    quotes: []
  };
}

function codes(result: ReturnType<typeof gateBhLanguageFeature>): BhProductionGateCode[] {
  return result.violations.map(({ code }) => code);
}

describe("BOOKSOFHISTORY language production gates", () => {
  for (const locale of ["cs", "en"] as const) {
    it(`drops every poison class in the ${locale} lane`, async () => {
      const baseDossier = await dossier();
      const claimId = baseDossier.claims[0]!.claimId;
      const valid = feature(locale, claimId);
      expect(gateBhLanguageFeature({
        feature: valid,
        locale,
        dossier: baseDossier,
        priorFeatures: [],
        authorLiving: false
      }).status).toBe("accepted");

      const unknown = structuredClone(valid);
      unknown.slides[1]!.factualSentences[0]!.claimRefs = ["claim-does-not-exist"];
      expect(codes(gateBhLanguageFeature({ feature: unknown, locale, dossier: baseDossier, priorFeatures: [], authorLiving: false })))
        .toContain("unknown-claim");

      const rejectedDossier = BhDossierSchema.parse({
        ...baseDossier,
        claims: baseDossier.claims.map((claim) => ({ ...claim, verificationState: "rejected", publicationSuitable: false }))
      });
      expect(codes(gateBhLanguageFeature({ feature: valid, locale, dossier: rejectedDossier, priorFeatures: [], authorLiving: false })))
        .toContain("rejected-claim");

      const unsuitableDossier = BhDossierSchema.parse({
        ...baseDossier,
        claims: baseDossier.claims.map((claim) => ({ ...claim, publicationSuitable: false }))
      });
      expect(codes(gateBhLanguageFeature({ feature: valid, locale, dossier: unsuitableDossier, priorFeatures: [], authorLiving: false })))
        .toContain("unsuitable-claim");

      const legendDossier = BhDossierSchema.parse({
        ...baseDossier,
        claims: baseDossier.claims.map((claim) => ({ ...claim, verificationState: "legend", publicationSuitable: true }))
      });
      expect(codes(gateBhLanguageFeature({ feature: valid, locale, dossier: legendDossier, priorFeatures: [], authorLiving: false })))
        .toContain("legend-framing");
      const framed = structuredClone(valid);
      framed.slides[1]!.factualSentences[0]!.text = `${BH_LEGEND_FRAMING[locale]}, ${framed.slides[1]!.factualSentences[0]!.text}`;
      expect(gateBhLanguageFeature({ feature: framed, locale, dossier: legendDossier, priorFeatures: [], authorLiving: false }).status)
        .toBe("accepted");

      const longQuote = structuredClone(valid) as unknown as { quotes: Array<{ text: string; attribution: string; claimRef: string }> };
      longQuote.quotes = [{ text: "x".repeat(301), attribution: "Archive", claimRef: claimId }];
      expect(codes(gateBhLanguageFeature({ feature: longQuote, locale, dossier: baseDossier, priorFeatures: [], authorLiving: false })))
        .toContain("quote-cap");
      longQuote.quotes[0] = { text: "short", attribution: "", claimRef: claimId };
      expect(codes(gateBhLanguageFeature({ feature: longQuote, locale, dossier: baseDossier, priorFeatures: [], authorLiving: false })))
        .toContain("quote-attribution");

      expect(codes(gateBhLanguageFeature({ feature: valid, locale, dossier: baseDossier, priorFeatures: [valid], authorLiving: false })))
        .toContain("duplicate-feature");

      const privateLife = structuredClone(valid);
      privateLife.caption = locale === "cs" ? "Text rozebírá soukromý život žijícího autora." : "The text discusses the living author's private life.";
      expect(codes(gateBhLanguageFeature({ feature: privateLife, locale, dossier: baseDossier, priorFeatures: [], authorLiving: true })))
        .toContain("living-author-private-life");

      const slop = structuredClone(valid);
      slop.caption = locale === "cs" ? "Neuvěříte, jak fascinující cesta začala." : "You won't believe this fascinating journey.";
      expect(codes(gateBhLanguageFeature({ feature: slop, locale, dossier: baseDossier, priorFeatures: [], authorLiving: false })))
        .toContain("stop-slop");
    });
  }

  it("drops and counts failed lanes instead of forwarding them", async () => {
    const baseDossier = await dossier();
    const claimId = baseDossier.claims[0]!.claimId;
    const cs = feature("cs", claimId);
    const en = feature("en", claimId);
    en.slides[1]!.factualSentences[0]!.claimRefs = ["claim-missing"];
    const result = gateBhTwinFeature({
      cs,
      en,
      dossier: baseDossier,
      priorFeatures: { cs: [], en: [] },
      authorLiving: false
    });
    expect(result).toMatchObject({
      droppedCount: 1,
      acceptedCount: 1,
      lanes: { cs: { status: "accepted" }, en: { status: "dropped", feature: null } }
    });
  });
});
