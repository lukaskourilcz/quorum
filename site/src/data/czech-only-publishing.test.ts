import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agents } from "@/data/agents";
import { publicAgentMandate, publicAgentTitle } from "@/components/agent-language";
import { calendarCostContexts } from "@/lib/calendar-cost";

/**
 * Both magazines publish in Czech only.
 *
 * MMA Files makes one writing call per slot, `writeCzech`, and stores `localizations: { cs }`
 * (orchestrator/src/mma-files/pipeline.ts). DNESKAi keeps `byLocale: { cs }` and deleted the
 * second call that used to rebuild the article in Czech (orchestrator/src/edition/localize.ts,
 * production.ts). Nothing produces an English article any more, so no public page may promise
 * one — not in prose, and not by linking a locale route the reader gets redirected out of.
 */
const forbiddenCopy: ReadonlyArray<readonly [RegExp, string]> = [
  [/bilingual/i, "no magazine is bilingual"],
  [/both languages/i, "there is only one published language"],
  [/English and Czech/i, "nothing is published in English"],
  [/Czech and English/i, "nothing is published in English"],
  [/English (?:edition|article|draft|localization|localisation)/i, "no English copy is written"],
  [/mma-files\.vercel\.app\/en\b/i, "the magazine redirects /en to /cs"]
];

function assertCzechOnly(source: string, where: string): void {
  for (const [pattern, reason] of forbiddenCopy) {
    const match = source.match(pattern);
    expect(match?.[0] ?? null, `${where} claims "${match?.[0]}" — ${reason}`).toBeNull();
  }
}

/**
 * Door Money markets an English-language book, so its owner-review recommendations are English
 * drafts by contract. Remove only those three approved phrases; English article, edition or
 * localization claims still fail this Czech-magazine guard even when they appear on GHOST.
 */
function withoutDoorMoneyDraftPhrases(source: string): string {
  return source
    .replaceAll("English draft recommendations", "draft recommendations")
    .replaceAll("English recommendation draft", "recommendation draft")
    .replaceAll("English drafts", "drafts");
}

/**
 * Comments are allowed to name the English edition — explaining why it is gone is the point of
 * them. Only shipped strings are checked, so both comment forms come out first. The line-comment
 * pattern refuses a `//` preceded by a colon, or it would swallow the rest of every `https://`
 * URL on its line and hide the magazine links this file exists to check.
 */
function shippedSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

const sourceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every reader-facing source file. `lib/` is in the list because that is where the public pages
 * get their data and their links: `/metrics` reads FightAIQ records straight out of
 * `lib/fightaiq-records.ts`, and that file built a `mma-files.vercel.app/en/fighters/...` URL
 * this check was written to forbid. Walking only `app`, `components` and `data` never saw it.
 *
 * Directories named `admin` are skipped on purpose: that area is password-protected and still
 * reads the optional `en` locale that older stored articles and social packs carry. The
 * `admin-*.ts` readers that sit directly in `lib/` are scanned like anything else and pass:
 * they touch that locale as data — type unions and object keys — never as prose or a link
 * promising an English edition, which is all these patterns look for.
 */
function readerFacingFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "admin") walk(full);
      } else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) {
        found.push(full);
      }
    }
  };
  for (const top of ["app", "components", "data", "lib"]) walk(path.join(sourceRoot, top));
  return found;
}

describe("Czech-only publishing", () => {
  /**
   * The first five fields are hand-written site copy. The rest reach the reader straight out of
   * `config/agents.json` through `data/agents.ts`: the agent page prints `responsibilities` and
   * `notResponsibleFor`, the agent card prints the first three responsibilities, and the council
   * simulator prints `capabilityTags`. Only the hand-written five used to be checked, so the
   * registry kept publishing the old two-language newsroom on those pages — JAB drafting "both
   * daily English articles", REACH queueing "four bilingual draft renders" — while every string
   * this file did cover already said Czech. The registry is the council's org record and could
   * not be edited from here, which is the only reason it was carved out; now that it is
   * corrected, the guard covers it and a rewritten role cannot reintroduce the claim.
   */
  it("keeps every agent's public description free of English publishing claims", () => {
    for (const agent of agents) {
      const description = [
        publicAgentTitle(agent),
        publicAgentMandate(agent),
        agent.output,
        agent.currentFocus ?? "",
        agent.operatingPrinciple,
        agent.title,
        agent.mission,
        ...agent.responsibilities,
        ...agent.notResponsibleFor,
        ...agent.decisionRights,
        ...agent.successChecks,
        ...agent.capabilityTags
      ].join(" | ");
      assertCzechOnly(
        agent.id === "GHOST" ? withoutDoorMoneyDraftPhrases(description) : description,
        `agent ${agent.id}`
      );
    }
  });

  it("keeps reader-facing copy and magazine links free of English publishing claims", () => {
    const files = readerFacingFiles();
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const relative = path.relative(sourceRoot, file);
      const source = shippedSource(file);
      assertCzechOnly(
        relative === path.join("components", "agent-language.ts")
          ? withoutDoorMoneyDraftPhrases(source)
          : source,
        relative
      );
    }
  });

  /**
   * The calendar's cost estimate resolves an agent's priced call by an exact `context` string.
   * A miss does not throw — it charges that agent's cheapest priced call — so a stale label just
   * understates the slot on the public homepage. "DNESKAi English edition" did exactly that:
   * STET's real call is the $0.0437 Czech edition, and the homepage advertised $0.0036.
   */
  it("points every calendar slot at a priced call the agent actually has", () => {
    const contextsById = new Map(
      agents.map((agent) => [agent.id as string, agent.apiModels.map((model) => model.context)])
    );
    for (const [kind, byAgent] of Object.entries(calendarCostContexts)) {
      for (const [agentId, context] of Object.entries(byAgent ?? {})) {
        expect(
          contextsById.get(agentId) ?? [],
          `${kind} bills ${agentId} for "${context}", which is not one of its priced calls`
        ).toContain(context);
      }
    }
  });
});
