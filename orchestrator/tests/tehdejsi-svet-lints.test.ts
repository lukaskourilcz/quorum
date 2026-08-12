import { describe, expect, it } from "vitest";
import {
  craftFindings,
  craftGatePasses,
  loadTerminologyTable,
  terminologyFindings
} from "../src/ventures/tehdejsi-svet/lints.js";

const table = await loadTerminologyTable();

function rules(findings: ReadonlyArray<{ rule: string }>): string[] {
  return findings.map((finding) => finding.rule).sort();
}

describe("Tehdejsi svet craft gate", () => {
  it("loads a terminology table whose entries all carry a reason a reviewer can check", () => {
    expect(table.entries.length).toBeGreaterThan(0);
    for (const entry of table.entries) {
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(entry.replacement.length).toBeGreaterThan(0);
      expect(entry.forbidden.every((phrase) => phrase.trim().length > 0)).toBe(true);
    }
  });

  it("catches the occupier's periodisation and the 1968 euphemism", () => {
    expect(rules(terminologyFindings("Це була велика вітчизняна війна.", "uk", table)))
      .toEqual(["terminology:great-patriotic-war"]);
    expect(rules(terminologyFindings("Přišla bratrská pomoc.", "cs", table)))
      .toEqual(["terminology:1968-liberation"]);
  });

  it("checks each language against its own entries and not the other's", () => {
    // A Czech package is not judged by the Ukrainian table, or every Czech text would trip
    // rules written for a language it is not in.
    expect(terminologyFindings("Киев", "cs", table)).toEqual([]);
    expect(rules(terminologyFindings("Киев", "uk", table))).toEqual(["terminology:kyiv-transliteration"]);
  });

  it("passes ordinary everyday copy", () => {
    const findings = craftFindings({
      copy: "Večerníček trval pár minut a jeho znělka končila den. Na co se dívala vaše máma?",
      language: "cs",
      tier: 0,
      table
    });
    expect(findings).toEqual([]);
    expect(craftGatePasses(findings)).toBe(true);
  });

  it("refuses nostalgia for the system while allowing it for the detail", () => {
    expect(rules(craftFindings({
      copy: "Za komunismu bylo lépe, říká se.", language: "cs", tier: 1, table
    }))).toEqual(["nostalgia:system"]);
    expect(craftFindings({
      copy: "Tramvaj stála korunu a jízdenka se cvakala ručně.", language: "cs", tier: 1, table
    })).toEqual([]);
  });

  it("refuses AI-generated period imagery and a flag used as branding", () => {
    expect(rules(craftFindings({
      copy: "Obrázek generovaný pomocí Midjourney.", language: "cs", tier: 0, table
    }))).toContain("imagery:ai-generated");
    expect(rules(craftFindings({
      copy: "Tehdejší svět \u{1F1E8}\u{1F1FF}", language: "cs", tier: 0, table
    }))).toContain("brand:national-flag");
  });

  it("refuses a then-and-now contrast only where the subject is a city under attack", () => {
    const copy = "Тоді і зараз: те саме місто.";
    expect(rules(craftFindings({ copy, language: "uk", tier: 2, table, wartimeSubject: true })))
      .toContain("wartime:destruction-contrast");
    // The same phrasing about an untouched place is ordinary editorial framing, not a violation.
    expect(rules(craftFindings({ copy, language: "uk", tier: 1, table })))
      .not.toContain("wartime:destruction-contrast");
  });

  it("refuses a participation prompt on a tier-2 feature", () => {
    expect(rules(craftFindings({
      copy: "Прип'ять евакуювали наступного дня. Кого ви про це запитаєте?",
      language: "uk",
      tier: 2,
      table
    }))).toContain("tier2:participation-prompt");
  });

  it("blocks on any finding, because a rule with a severity ladder is a rule shipped past", () => {
    expect(craftGatePasses([{ rule: "terminology:kyiv-transliteration", detail: "x" }])).toBe(false);
    expect(craftGatePasses([])).toBe(true);
  });
});
