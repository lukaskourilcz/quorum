import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BhDossierSchema } from "../src/contracts/bh-dossier.js";
import type { guardedJsonCall } from "../src/llm/call.js";
import { repoRoot } from "../src/paths.js";
import {
  produceBhTwinFeature,
  type BhLanguageCallConfig,
  type BhStoryBriefCallConfig
} from "../src/ventures/booksofhistory/produce.js";

function baseConfig(agent = "PLOT") {
  return {
    stateRoot: "/unused",
    cycleId: "bh-production",
    phase: "bh-desk",
    ventureId: "booksofhistory",
    agent,
    provider: "anthropic" as const,
    model: "claude-sonnet-5",
    system: "Write only the requested JSON.",
    maxOutputTokens: 3_000,
    budgetContext: {
      now: new Date("2026-08-14T10:00:00.000Z"),
      cycleId: "bh-production",
      stage: "VALIDATION" as const,
      ledger: [],
      allInNonApiSpentUsd: 0,
      allInCommittedUsd: 0,
      knownMonthlyForecastUsd: 0,
      remainingScheduledCycles: 1
    }
  };
}

describe("BOOKSOFHISTORY twin production", () => {
  it("writes one canonical brief then structurally parallel, independently native packages", async () => {
    const dossier = BhDossierSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
      "utf8"
    )));
    const story = dossier.storyCandidates[0]!;
    const claimId = story.claimRefs[0]!;
    const canonical = {
      schemaVersion: "bh-story-brief/1",
      bookId: dossier.bookId,
      dossierRef: `ventures/booksofhistory/dossiers/${dossier.bookId}/dossier.json`,
      storyId: story.storyId,
      openingTension: "A familiar book began through a less familiar publishing struggle.",
      arc: [
        { beat: "The archival record establishes the first publication context.", claimRefs: [claimId] },
        { beat: "Later scholarship explains how the format changed its reception.", claimRefs: [claimId] }
      ],
      turn: "The supposed obstacle became the mechanism by which readers found it.",
      turnClaimRefs: [claimId],
      ending: "The publication history changes how the finished book is understood.",
      endingClaimRefs: [claimId]
    };
    const language = (locale: "cs" | "en") => ({
      schemaVersion: "bh-language-feature/1",
      locale,
      headline: locale === "cs" ? "Kniha, kterou změnila cesta k vydání" : "The publishing path that changed the book",
      slides: [
        { role: "hook", text: locale === "cs" ? "Známý příběh začal nečekaně." : "The familiar story began somewhere unexpected.", factualSentences: [] },
        { role: "context", text: locale === "cs" ? "Archiv ukazuje cestu k vydání." : "The archive records a difficult route to publication.", factualSentences: [{ text: locale === "cs" ? "Knižní vydání vyšlo roku 1936." : "The book edition appeared in 1936.", claimRefs: [claimId] }] },
        { role: "turn", text: locale === "cs" ? "Překážka se změnila ve výhodu." : "The obstacle became an advantage.", factualSentences: [] },
        { role: "ending", text: locale === "cs" ? "Jiná cesta, jiný pohled na knihu." : "A different route changes how the book looks.", factualSentences: [] }
      ],
      caption: locale === "cs" ? "Příběh vydání, který stojí za přečtení." : "A publishing story worth reading in its own right.",
      quotes: []
    });
    const call = vi.fn(async (request: Parameters<typeof guardedJsonCall>[0]) => {
      const packet = JSON.parse(request.input) as { locale?: "cs" | "en" };
      const value = packet.locale ? language(packet.locale) : canonical;
      return { value: request.parse(JSON.stringify(value)), cached: false, usd: 0.02 };
    }) as unknown as typeof guardedJsonCall & ReturnType<typeof vi.fn>;

    const result = await produceBhTwinFeature({
      dossier,
      dossierRef: canonical.dossierRef,
      storyId: story.storyId,
      plotBriefCallConfig: baseConfig() as BhStoryBriefCallConfig,
      czechCallConfig: baseConfig() as BhLanguageCallConfig,
      englishCallConfig: baseConfig() as BhLanguageCallConfig,
      hacekRegisterRules: "Use idiomatic Czech syntax, sober register and Czech punctuation; avoid translated English calques.",
      call
    });

    expect(call).toHaveBeenCalledTimes(3);
    expect(result.canonicalBrief).toEqual(canonical);
    expect(result.cs.slides.map(({ role }) => role)).toEqual(result.en.slides.map(({ role }) => role));
    expect(result.cs.headline).not.toBe(result.en.headline);
    expect(result.cs.slides.map(({ text }) => text)).not.toEqual(result.en.slides.map(({ text }) => text));
    const csPacket = JSON.parse(call.mock.calls[1]![0].input);
    const enPacket = JSON.parse(call.mock.calls[2]![0].input);
    expect(csPacket.canonicalBrief).toEqual(enPacket.canonicalBrief);
    expect(csPacket.task).toContain("native Czech");
    expect(csPacket.hacekRegisterRules).toContain("idiomatic Czech");
    expect(enPacket.task).toContain("native English");
    expect(enPacket).not.toHaveProperty("hacekRegisterRules");

    const source = await readFile(
      path.join(repoRoot, "orchestrator/src/ventures/booksofhistory/produce.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/ResearchProvider|researchBook/u);
  });
});
