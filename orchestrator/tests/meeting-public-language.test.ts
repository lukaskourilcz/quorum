import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRoutingConfig, routeBoardroom } from "../src/boardroom/router.js";
import { EditionPackageSchema, type EditionPackage } from "../src/contracts/edition-package.js";
import type { MeetingRecord } from "../src/contracts/meeting-record.js";
import type { IdeaLedgerEntry } from "../src/contracts/idea-ledger.js";
import { loadEditionQualityConfig } from "../src/edition/config.js";
import { buildNoEditionPackage } from "../src/edition/package.js";
import {
  createLiveEditionMeeting,
  createLiveProductMeeting,
  createOfflineCaughtUpMeeting
} from "../src/meetings/record.js";
import { configRoot, repoRoot } from "../src/paths.js";

const AGENT_LANGUAGE_PATH = path.join(
  repoRoot,
  "site",
  "src",
  "components",
  "agent-language.ts"
);

/**
 * Loads the site's real plain-English filter and runs it, rather than re-implementing it.
 *
 * site/src/components/agent-language.ts belongs to the Next.js package. A static import would
 * put it in this package's tsconfig program, where its "@/data/agents" specifier has no path
 * alias and `tsc --noEmit` fails. The specifier is reached only by `import type`, so vitest's
 * transform erases it before anything resolves it, and a runtime import of the absolute path
 * never enters the type program. The test therefore exercises the function the meeting page
 * actually calls, including any edit made to the replacement table after this test was written.
 */
async function loadPublicAgentText(): Promise<(value: string) => string> {
  const loaded = await import(AGENT_LANGUAGE_PATH) as {
    publicAgentText: (value: string) => string;
  };
  return loaded.publicAgentText;
}

const EDITION_NOW = new Date("2026-08-04T03:00:00.000Z");
const PRODUCT_NOW = new Date("2026-08-04T15:00:00.000Z");

const IDEA: IdeaLedgerEntry = {
  schemaVersion: "idea-ledger/1",
  id: "idea-2026-08-04-a3f9",
  fingerprint: `sha256:${"a".repeat(64)}`,
  title: "Reader source-confidence cue",
  summary: "Show source independence beside each edition.",
  origin: { agent: "SPARK", meetingRef: "standups/2026-08-04-morning" },
  status: "proposed",
  statusHistory: [{
    status: "proposed",
    at: "2026-08-04T04:00:00.000Z",
    meetingRef: "standups/2026-08-04-morning",
    reason: "VAULT novel: no comparable idea."
  }],
  similarTo: []
};

async function room(preset: "edition-room" | "product-room", now: Date) {
  const routing = await loadRoutingConfig(path.join(configRoot, "agent-routing.json"));
  const edition = preset === "edition-room";
  return routeBoardroom(routing, {
    roomId: `ROOM-${preset.toUpperCase()}`,
    topicType: edition ? "edition" : "product",
    objective: edition ? "Select a story or NO_EDITION" : "Record an idea verdict",
    evidenceRefs: [],
    decisionNeeded: edition ? "EDITION" : "IDEA_VERDICT",
    riskTags: [],
    budgetImpactUsd: 0.08,
    preset,
    now
  });
}

async function editionPackage(status: EditionPackage["status"]): Promise<EditionPackage> {
  if (status === "edition") {
    return EditionPackageSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
      "utf8"
    )));
  }
  return buildNoEditionPackage({
    date: "2026-08-04",
    meetingRef: "meetings/2026-08-04-cu-edition",
    roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
    reason: "quality_block:source_diversity",
    config: await loadEditionQualityConfig()
  });
}

/** Every branch of every meeting-record builder in src/meetings/record.ts. */
async function everyMeetingRecord(): Promise<Array<[string, MeetingRecord]>> {
  return [
    ["dry edition room", await createOfflineCaughtUpMeeting({
      cycleId: "20260804-cu-edition",
      phase: "cu-edition",
      stage: "VALIDATION",
      room: await room("edition-room", EDITION_NOW),
      now: EDITION_NOW,
      estimatedCycleUsd: 0.08
    })],
    ["dry product room, no idea", await createOfflineCaughtUpMeeting({
      cycleId: "20260804-cu-product",
      phase: "cu-product",
      stage: "VALIDATION",
      room: await room("product-room", PRODUCT_NOW),
      now: PRODUCT_NOW,
      estimatedCycleUsd: 0.08
    })],
    ["dry product room, vetoed idea", await createOfflineCaughtUpMeeting({
      cycleId: "20260804-cu-product",
      phase: "cu-product",
      stage: "VALIDATION",
      room: await room("product-room", PRODUCT_NOW),
      now: PRODUCT_NOW,
      estimatedCycleUsd: 0.08,
      idea: IDEA,
      verdict: "veto"
    })],
    ["live edition room, EDITION", await createLiveEditionMeeting({
      cycleId: "20260804030000-cu-edition",
      stage: "VALIDATION",
      room: await room("edition-room", EDITION_NOW),
      now: EDITION_NOW,
      estimatedCycleUsd: 0.35,
      monthAllInUsd: 1.2,
      editionPackage: await editionPackage("edition"),
      evidenceRefs: ["source:the-verge"]
    })],
    ["live edition room, NO_EDITION", await createLiveEditionMeeting({
      cycleId: "20260804030000-cu-edition",
      stage: "VALIDATION",
      room: await room("edition-room", EDITION_NOW),
      now: EDITION_NOW,
      estimatedCycleUsd: 0.35,
      monthAllInUsd: 1.2,
      editionPackage: await editionPackage("no_edition"),
      evidenceRefs: ["source:the-verge"]
    })],
    ["live product room, one idea", await createLiveProductMeeting({
      cycleId: "20260804150000-cu-product",
      stage: "VALIDATION",
      room: await room("product-room", PRODUCT_NOW),
      now: PRODUCT_NOW,
      estimatedCycleUsd: 0.03,
      actualCycleUsd: 0.004,
      monthAllInUsd: 1.2,
      idea: IDEA,
      response: {
        verdict: "defer",
        reason: "Wait for a measurable reader baseline.",
        deferred: { condition: "A measurable reader baseline exists." },
        supersedes: null,
        votes: ["HERALD", "SPARK", "VAULT", "AUDIT"].map((agent) => ({
          agent: agent as "HERALD" | "SPARK" | "VAULT" | "AUDIT",
          choice: "defer" as const,
          veto: false,
          reason: "A baseline is required."
        })),
        summary: "Defer until a measurable reader baseline exists.",
        bestExchange: { agent: "AUDIT", text: "A baseline must precede a growth claim." }
      },
      yesterdayOutcome: "Yesterday's delivery outcome is unavailable."
    })],
    ["live product room, no idea", await createLiveProductMeeting({
      cycleId: "20260804150000-cu-product",
      stage: "VALIDATION",
      room: await room("product-room", PRODUCT_NOW),
      now: PRODUCT_NOW,
      estimatedCycleUsd: 0.03,
      actualCycleUsd: 0.004,
      monthAllInUsd: 1.2,
      idea: null,
      response: null,
      yesterdayOutcome: "Yesterday's delivery outcome is unavailable."
    })]
  ];
}

// Split on a sentence terminator followed by whitespace, letting a closing quote or bracket ride
// along. A decimal point is never followed by whitespace, so "$0.35" stays one sentence.
const SENTENCE_BREAK = /(?<=[.!?])["'”’)\]]*\s+/;
const DOUBLED_ARTICLE = /\b(?:a|an|the)\s+(?:a|an|the)\b/i;

function lowercaseSentenceStarts(published: string): string[] {
  return published
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.replace(/^["'“‘(\[]+/u, "").trim())
    .filter((sentence) => /^\p{Ll}/u.test(sentence));
}

describe("the public meeting page prints the room in readable English", () => {
  /**
   * publicAgentText rewrites internal vocabulary into plain English before the meeting page
   * prints a turn, and several rules expand one word into a lowercase noun phrase. Two of them
   * used to break the sentences that carried them: "Distribution remains draft-locked until
   * RELAY confirms delivery." published as "ways to reach people remains draft-locked until
   * Delivery coordinator confirms delivery.", and "There is no distribution brief without an
   * edition." published as "There is no ways to reach people brief without an edition.".
   * "NO_EDITION recorded." published as "no edition recorded.". The transcript, not the filter,
   * is what these assertions constrain: a room turn has to survive the rewrite.
   */
  it("gives every transcript turn a capitalised sentence start and no broken noun phrase", async () => {
    const publicAgentText = await loadPublicAgentText();
    // Derived, not hard-coded, so a rename of the plain-English wording keeps this honest.
    const distributionPhrase = publicAgentText("distribution");
    const records = await everyMeetingRecord();
    expect(records).not.toHaveLength(0);

    for (const [label, record] of records) {
      expect(record.roomTranscript.turns.length).toBeGreaterThan(0);
      for (const [index, turn] of record.roomTranscript.turns.entries()) {
        const published = publicAgentText(turn.text);
        const where = `${label} turn ${index} (${turn.agent}): ${published}`;
        expect(lowercaseSentenceStarts(published), where).toEqual([]);
        expect(published, where).not.toMatch(DOUBLED_ARTICLE);
        // Every use of "distribution" in a room turn is singular and abstract, while the public
        // wording for it is a plural phrase, so it cannot survive the rewrite in any position.
        expect(published, where).not.toContain(distributionPhrase);
      }
    }
  });

  /**
   * growthPlan carries the NO_POST marker and is part of the published record model
   * (site/src/lib/meeting-record-model.ts), even though today's meeting page prints only the
   * brief, the decision summary and the turns. "NO_POST. A held edition cannot authorize
   * distribution." reduces to "do not publish. A held edition cannot authorize ways to reach
   * people." — the marker has to sit inside a sentence, not stand as one.
   */
  it("keeps the NO_POST marker inside a sentence that still reads", async () => {
    const publicAgentText = await loadPublicAgentText();
    const distributionPhrase = publicAgentText("distribution");
    for (const [label, record] of await everyMeetingRecord()) {
      const published = publicAgentText(record.growthPlan);
      expect(lowercaseSentenceStarts(published), `${label}: ${published}`).toEqual([]);
      expect(published, `${label}: ${published}`).not.toContain(distributionPhrase);
    }
  });
});
