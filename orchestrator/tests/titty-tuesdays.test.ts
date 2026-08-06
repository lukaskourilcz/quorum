import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { VisualWeightsSchema } from "../src/contracts/visual-weights.js";
import { loadMeetingPolicy, phaseHasStandingAgenda, phaseNeedsAgenda } from "../src/meetings/agenda.js";
import { repoRoot } from "../src/paths.js";
import {
  assertTittyTuesdaysIdeaOutput,
  parsePortfolioContribution,
  portfolioIdeaInstruction,
  portfolioMaxOutputTokens,
  seasonExpiryWarning,
  seasonProducts,
  tittyTuesdaysDailyFocus
} from "../src/portfolio/run.js";
import { parseTasteDocument } from "../src/taste/model.js";
import {
  createTittyTuesdaysBootstrapMeeting,
  loadSeasonFile
} from "../src/titty-tuesdays/bootstrap.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

describe("Titty Tuesdays bootstrap", () => {
  it("registers venture 002 on the resolved 11:00 Prague schedule", async () => {
    const registry = await loadVentureRegistry();
    const venture = registry.ventures.find((candidate) => candidate.id === "titty-tuesdays");
    expect(venture).toMatchObject({
      status: "operating",
      taste: true,
      ledgerNamespace: "titty-tuesdays",
      // No "visuals": visualCards() hardcodes caught-up, so the tab was permanently empty.
      adminTabs: ["plans", "ideas"],
      meetings: [expect.objectContaining({ kind: "tt-marketing", cadence: "daily@11:00", envelopeUsd: 0.08 })]
    });
    expect(venture?.meetings[0]?.packet.objectives.live).toContain("Generate and record concrete marketing ideas");
    const policy = await loadMeetingPolicy();
    expect(phaseNeedsAgenda(policy, "tt-marketing")).toBe(false);
    expect(phaseHasStandingAgenda(policy, "tt-marketing")).toBe(true);
  });

  it("requires a core seat to produce a ledger-ready marketing idea", () => {
    const contribution = {
      stance: "plan",
      summary: "Build a type-led concept for an adult audience.",
      evidenceRefs: [],
      task: null,
      nicheProposals: [],
      editorialSlate: null,
      marketingPlan: null,
      templateProposal: null,
      inspirationObservations: [],
      idea: {
        title: "Tuesday Care Label",
        summary: "Turn the TITTY TUESDAYS care label into a restrained campaign device for the current crop-top concepts. Planning only; no stock, price or purchase claim."
      },
      followUpRequest: null
    };
    const parsed = parsePortfolioContribution({
      phase: "tt-marketing",
      agent: "PULSE",
      text: JSON.stringify(contribution)
    });
    expect(parsed.idea?.title).toBe("Tuesday Care Label");
    const recoveredCoreIdea = parsePortfolioContribution({
      phase: "tt-marketing",
      agent: "ANGLE",
      text: JSON.stringify({
        ...contribution,
        idea: null,
        nicheProposals: [{}, {}, {}],
        editorialSlate: { wrongRoom: true },
        templateProposal: { wrongRoom: true },
        inspirationObservations: [{}, {}, {}, {}, {}]
      })
    });
    expect(recoveredCoreIdea.idea).toEqual({
      title: contribution.summary,
      summary: contribution.summary
    });
    expect(recoveredCoreIdea).toMatchObject({
      nicheProposals: [],
      editorialSlate: null,
      templateProposal: null,
      inspirationObservations: []
    });
    expect(() => assertTittyTuesdaysIdeaOutput("tt-marketing", [
      { agent: "AUDIT", idea: null }
    ])).toThrow(/produced no core marketing idea/);
    expect(() => assertTittyTuesdaysIdeaOutput("tt-marketing", [
      { agent: "PULSE", idea: contribution.idea },
      { agent: "AUDIT", idea: null }
    ])).not.toThrow();

    const repaired = parsePortfolioContribution({
      phase: "tt-marketing",
      agent: "ANGLE",
      text: JSON.stringify({
        ...contribution,
        idea: { campaignConcept: "Care-label typography for the current crop-top season. ".repeat(8) }
      })
    });
    expect(repaired.idea?.title.length).toBeLessThanOrEqual(80);
    expect(repaired.idea?.summary.length).toBe(280);
    expect(repaired.idea?.summary).toContain("Care-label typography");

    const numericConcept = {
      ...contribution,
      summary: "Compare 4 internal crop-top directions before any public action."
    };
    expect(() => parsePortfolioContribution({
      phase: "tt-marketing",
      agent: "PULSE",
      text: JSON.stringify(numericConcept)
    })).not.toThrow();
    expect(() => parsePortfolioContribution({
      phase: "incubator-scan",
      agent: "PULSE",
      text: JSON.stringify(numericConcept)
    })).toThrow(/Numeric contribution claims require evidenceRefs/);
  });

  it("puts the pre-commerce brand floor in the standing idea contract", () => {
    const instruction = portfolioIdeaInstruction("tt-marketing");
    expect(instruction).toContain("future Titty Tuesdays eshop");
    expect(instruction).toContain("PULSE and ANGLE must each set idea exactly");
    expect(instruction).toContain("target adults");
    expect(instruction).toContain("do not claim stock, price, availability or a purchase path");
    expect(instruction).toContain("human imagery");
    expect(portfolioMaxOutputTokens("ANGLE", 1_600)).toBe(1_600);
    expect(portfolioMaxOutputTokens("COHORT", 1_600)).toBe(900);
  });

  it("stores exactly four non-purchasable crop-top concepts", async () => {
    const season = await loadSeasonFile(repoRoot);
    expect(season.products).toHaveLength(4);
    expect(season.products.every((product) => product.status === "concept")).toBe(true);
    expect(season.products.every((product) => product.concept.includes("TITTY TUESDAYS"))).toBe(true);
    expect(season.campaignArc).toContain("never imply stock or a release");
  });

  it("reproduces the committed dry bootstrap meeting", async () => {
    const season = await loadSeasonFile(repoRoot);
    const committed = MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "state", "meetings", "2026-08-01-tt-marketing.json"),
      "utf8"
    )));
    expect(committed).toEqual(createTittyTuesdaysBootstrapMeeting(season));
    expect(committed.fixture).toBe(true);
    expect(committed.ledger.actualCycleUsd).toBe(0);
    expect(committed.growthPlan).toContain("NO_POST");
  });

  it("starts taste and visual memory without inventing owner preferences", async () => {
    const taste = parseTasteDocument(await readFile(
      path.join(repoRoot, "state", "taste", "titty-tuesdays", "TASTE.md"),
      "utf8"
    ));
    expect(taste).toMatchObject({ watermark: null, pursue: [], avoid: [], open: [] });
    const weights = VisualWeightsSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "config", "visual-weights", "titty-tuesdays.json"),
      "utf8"
    )));
    expect(Object.values(weights.weights).every((weight) => weight >= 0.1)).toBe(true);
    expect(weights.adjustments).toEqual([]);
  });

  it("records the founding approval while keeping budget, commerce and platform actions pending", async () => {
    const [brand, founding, budget, platform] = await Promise.all([
      readFile(path.join(repoRoot, "state", "ventures", "titty-tuesdays", "BRAND.md"), "utf8"),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-titty-tuesdays-founding.md"), "utf8"),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-budget-raise.md"), "utf8"),
      readFile(path.join(repoRoot, ".claude", "skills", "titty-tuesdays-brandbook", "references", "platform-policy.md"), "utf8")
    ]);
    expect(brand).toContain("No commerce, payment, inventory or availability claims");
    expect(founding).toContain("Status: countersigned");
    expect(budget).toContain("Automatic fallback shape B");
    expect(platform).toContain("No primary source found");
  });
});

/**
 * Four of the seven ideas on the ledger are near-duplicates of one concept. The room had no
 * memory of its own back catalogue and no reason to move on from whatever it thought of first.
 */
describe("what stops the room repeating itself", () => {
  const SEASON = [
    "# Season 001",
    "",
    "```json",
    JSON.stringify({
      startsOn: "2026-08-01",
      endsOn: "2026-10-30",
      products: [
        { name: "Night Shift", concept: "A washed-black crop top." },
        { name: "Receipt", concept: "A bone crop top stacked like a receipt." },
        { name: "Third", concept: "A third concept." }
      ]
    }, null, 2),
    "```"
  ].join("\n");

  it("rotates one season concept per day, wrapping", () => {
    const { products, startsOn } = seasonProducts(SEASON);
    expect(products).toHaveLength(3);
    const focusOn = (date: string) => tittyTuesdaysDailyFocus({ products, startsOn, date });

    expect(focusOn("2026-08-01")).toContain("Night Shift");
    expect(focusOn("2026-08-02")).toContain("Receipt");
    expect(focusOn("2026-08-03")).toContain("Third");
    // Wraps rather than running out.
    expect(focusOn("2026-08-04")).toContain("Night Shift");
    // Deterministic: the same day always names the same concept.
    expect(focusOn("2026-08-02")).toBe(focusOn("2026-08-02"));
  });

  it("says nothing rather than guessing when the season cannot be read", () => {
    expect(seasonProducts("no json block here")).toEqual({ products: [], startsOn: "" });
    expect(tittyTuesdaysDailyFocus({ products: [], startsOn: "2026-08-01", date: "2026-08-02" }))
      .toBe("");
  });

  it("carries the focus and the no-duplicates rule into the room instruction", () => {
    const instruction = portfolioIdeaInstruction("tt-marketing", " Today's focus: Receipt — a bone crop top.");

    expect(instruction).toContain("Propose nothing whose title or summary restates an idea already in the index");
    expect(instruction).toContain("Today's focus: Receipt");
  });

  it("warns in the record once the season has ended, and not before", () => {
    // season-001 ends on 2026-10-30 and nothing creates season-002. From 31 October the room
    // would ideate against an expired season forever with nothing saying so.
    expect(seasonExpiryWarning(SEASON, "2026-10-30")).toBe("");
    expect(seasonExpiryWarning(SEASON, "2026-10-31")).toContain("ended on 2026-10-30");
    expect(seasonExpiryWarning(SEASON, "2026-10-31")).toContain("do not invent a new season");
    expect(seasonExpiryWarning("no json block here", "2026-12-01")).toBe("");
  });
});
