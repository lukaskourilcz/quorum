import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IdeaLedgerEntrySchema, type IdeaLedgerEntry } from "../src/contracts/idea-ledger.js";
import { DEFAULT_BUDGET_LIMITS } from "../src/budget.js";
import type { Evidence } from "../src/research/evidence.js";
import { atomicWriteText } from "../src/state.js";
import {
  GLOBAL_IDEA_NAMESPACE,
  IDEA_STOPWORDS,
  MAX_IDEA_INDEX_CHARS,
  applyIdeaRoomVerdict,
  canonicalIdeaTokens,
  currentIdeaEntries,
  deterministicVaultAdjudicator,
  ideaDetailPath,
  ideaIndexPath,
  ideaLedgerPath,
  ideaFingerprint,
  prefilterIdeaCandidates,
  readIdeaLedger,
  readIdeaLedgerScope,
  regenerateIdeaIndex,
  renderIdeaIndex,
  screenAndRecordIdea,
  type VaultAdjudicator
} from "../src/ideas/ledger.js";
import { decideLiveProductRoom } from "../src/ideas/live.js";

function entry(input: {
  id: string;
  title: string;
  summary: string;
  status?: IdeaLedgerEntry["status"];
  at?: string;
}): IdeaLedgerEntry {
  const status = input.status ?? "proposed";
  const at = input.at ?? "2026-08-01T04:00:00.000Z";
  return IdeaLedgerEntrySchema.parse({
    schemaVersion: "idea-ledger/1",
    id: input.id,
    fingerprint: ideaFingerprint(input.title, input.summary),
    title: input.title,
    summary: input.summary,
    origin: { agent: "SPARK", meetingRef: "standups/2026-08-01-morning" },
    status,
    statusHistory: [{ status, at, meetingRef: "standups/2026-08-01-morning", reason: "Fixture state." }],
    similarTo: []
  });
}

async function rootWith(entries: readonly IdeaLedgerEntry[] = []): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "boardless-ideas-"));
  await atomicWriteText(
    root,
    ideaLedgerPath(GLOBAL_IDEA_NAMESPACE),
    entries.length ? `${entries.map((value) => JSON.stringify(value)).join("\n")}\n` : ""
  );
  return root;
}

function proposal(title: string, summary: string, evidenceRef?: string) {
  return {
    title,
    summary,
    origin: { agent: "SPARK" as const, meetingRef: "standups/2026-08-04-morning" },
    proposedAt: "2026-08-04T04:10:00.000Z",
    ...(evidenceRef ? { evidenceRef } : {})
  };
}

describe("idea canonicalization", () => {
  it("commits exactly forty stopwords and a stable canonical fingerprint", () => {
    expect(IDEA_STOPWORDS).toHaveLength(40);
    expect(new Set(IDEA_STOPWORDS).size).toBe(40);
    expect(canonicalIdeaTokens("The Developers Newsletters", "A digest for developers")).toEqual([
      "developer",
      "newsletter",
      "digest",
      "developer"
    ]);
    expect(ideaFingerprint("ＦＯＯ!", "Bars")).toBe(ideaFingerprint("foo", "bar"));
  });

  it("puts the required paraphrase into VAULT's bounded candidate set", () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "A newsletter for developers",
      summary: "A concise publication for working developers."
    });
    const matches = prefilterIdeaCandidates(
      proposal("Dev-focused email digest", "A concise email digest for working devs."),
      [prior]
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.entry.id).toBe(prior.id);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(0.18);
    expect(prefilterIdeaCandidates(
      proposal("Reader referral rewards", "Track invitations and reward subscribers."),
      [entry({
        id: "idea-2026-08-01-b4e0",
        title: "Source reliability dashboard",
        summary: "Show correction history and source independence."
      })]
    )).toEqual([]);
  });
});

describe("VAULT ledger adjudication", () => {
  it("dedupes within a venture plus global memory without copying global history", async () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "A newsletter for developers",
      summary: "A concise publication for working developers."
    });
    const root = await rootWith([prior]);
    const result = await screenAndRecordIdea({
      root,
      namespace: "incubator",
      proposal: proposal(prior.title, prior.summary),
      evidence: [],
      adjudicator: { async adjudicate() { throw new Error("exact matches do not call a model"); } }
    });
    expect(result).toMatchObject({ verdict: "duplicate_of", autoRejected: true });
    expect(await readIdeaLedger(root, GLOBAL_IDEA_NAMESPACE)).toHaveLength(1);
    expect(await readIdeaLedger(root, "incubator")).toHaveLength(1);
    expect(await readIdeaLedgerScope(root, "incubator")).toHaveLength(2);
  });

  it("hard-stops exact fingerprints without invoking a model", async () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "Source reliability card",
      summary: "Show source independence beside each edition."
    });
    const root = await rootWith([prior]);
    let calls = 0;
    const adjudicator: VaultAdjudicator = {
      async adjudicate() { calls += 1; return { verdict: "novel", reason: "No comparable idea." }; }
    };
    const result = await screenAndRecordIdea({
      root,
      proposal: proposal(prior.title, prior.summary),
      evidence: [],
      adjudicator
    });
    expect(result).toMatchObject({ verdict: "duplicate_of", modelCalled: false, autoRejected: true });
    expect(calls).toBe(0);
    expect(result.entry.status).toBe("vetoed");
  });

  it("feeds only the top lexical candidates to one adjudication call", async () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "A newsletter for developers",
      summary: "A concise publication for working developers."
    });
    const root = await rootWith([prior]);
    let candidateIds: string[] = [];
    const result = await screenAndRecordIdea({
      root,
      proposal: proposal("Dev-focused email digest", "A concise email digest for working devs."),
      evidence: [],
      adjudicator: {
        async adjudicate({ candidates }) {
          candidateIds = candidates.map((candidate) => candidate.entry.id);
          return { verdict: `duplicate_of:${prior.id}`, reason: "It is the same developer digest." };
        }
      }
    });
    expect(candidateIds).toEqual([prior.id]);
    expect(result).toMatchObject({ verdict: "duplicate_of", modelCalled: true, autoRejected: true });
  });

  it("records a material variant link in both ledger directions", async () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "A newsletter for developers",
      summary: "A concise publication for working developers."
    });
    const root = await rootWith([prior]);
    const result = await screenAndRecordIdea({
      root,
      proposal: proposal(
        "Dev-focused email digest with source notes",
        "A concise email digest for working devs that adds source notes."
      ),
      evidence: [],
      adjudicator: {
        async adjudicate() {
          return {
            verdict: `variant_of:${prior.id}`,
            reason: "It adds a distinct source-note review to the developer digest."
          };
        }
      }
    });
    expect(result.verdict).toBe("variant_of");
    const current = currentIdeaEntries(await readIdeaLedger(root));
    expect(current.find((candidate) => candidate.id === prior.id)?.similarTo)
      .toContainEqual(expect.objectContaining({ id: result.entry.id, verdict: "variant_of" }));
    expect(current.find((candidate) => candidate.id === result.entry.id)?.similarTo)
      .toContainEqual(expect.objectContaining({ id: prior.id, verdict: "variant_of" }));
  });

  it("rejects evidence-free dead-idea revival before the room", async () => {
    const killed = entry({
      id: "idea-2026-08-01-dead",
      title: "Daily reader streak",
      summary: "Reward readers for opening consecutive editions.",
      status: "killed",
      at: "2026-08-02T16:00:00.000Z"
    });
    const root = await rootWith([killed]);
    const result = await screenAndRecordIdea({
      root,
      proposal: proposal(killed.title, killed.summary),
      evidence: [],
      adjudicator: { async adjudicate() { throw new Error("must not call"); } }
    });
    expect(result).toMatchObject({ verdict: "duplicate_of", autoRejected: true, modelCalled: false });
  });

  it("admits a dead idea only with evidence newer than the kill", async () => {
    const killed = entry({
      id: "idea-2026-08-01-dead",
      title: "Daily reader streak",
      summary: "Reward readers for opening consecutive editions.",
      status: "killed",
      at: "2026-08-02T16:00:00.000Z"
    });
    const evidence = [{
      id: "REAL-E-010",
      ts: "2026-08-03T09:00:00.000Z",
      sourceUrl: "https://example.com/signal",
      sourceType: "reader_interview",
      claim: "A reader asked for continuity cues.",
      quoteOrSignal: "I lose track of which issue I last read.",
      capturedAt: "2026-08-03T09:00:00.000Z",
      confidence: 0.7,
      opportunityId: "CAUGHT-UP",
      direct: true,
      fixture: false
    }] satisfies Evidence[];
    const root = await rootWith([killed]);
    const result = await screenAndRecordIdea({
      root,
      proposal: proposal(killed.title, killed.summary, "EVIDENCE.jsonl:REAL-E-010"),
      evidence,
      adjudicator: { async adjudicate() { throw new Error("must not call"); } }
    });
    expect(result).toMatchObject({ verdict: "revived", autoRejected: false, modelCalled: false });
    expect(result.entry.revival).toEqual({
      from: killed.id,
      evidenceRef: "EVIDENCE.jsonl:REAL-E-010"
    });
  });

  it("writes verdict snapshots and a compact index instead of rewriting history", async () => {
    const prior = entry({
      id: "idea-2026-08-01-a3f9",
      title: "Source reliability card",
      summary: "Show source independence beside each edition."
    });
    const root = await rootWith([prior]);
    await applyIdeaRoomVerdict({
      root,
      ideaId: prior.id,
      verdict: {
        verdict: "defer",
        reason: "Wait for a complete week of correction records.",
        deferred: { condition: "A complete week of correction records exists." }
      },
      meetingRef: "meetings/2026-08-04-cu-product",
      at: "2026-08-04T15:04:00.000Z"
    });
    const snapshots = await readIdeaLedger(root);
    expect(snapshots).toHaveLength(2);
    expect(currentIdeaEntries(snapshots)[0]).toMatchObject({ status: "deferred" });
    await regenerateIdeaIndex(root);
    const index = await readFile(
      path.join(root, ideaIndexPath(GLOBAL_IDEA_NAMESPACE)),
      "utf8"
    );
    expect(index).toContain("The raw JSONL ledger is never injected into a meeting");
    expect(index).toContain("Source reliability card");
    expect(index).toContain("deferred");
    const detail = await readFile(
      path.join(root, ideaDetailPath(GLOBAL_IDEA_NAMESPACE, prior.id)),
      "utf8"
    );
    expect(detail).toContain("> Show source independence beside each edition.");
    expect(detail).toContain("## Decision history");
  });

  it("keeps every namespace index within the injection ceiling", () => {
    const entries = Array.from({ length: 220 }, (_, index) => entry({
      id: `idea-2026-08-01-${index.toString(16).padStart(4, "0")}`,
      title: `Bounded portfolio concept ${index}`,
      summary: `A distinct evidence-backed concept with enough detail to exercise the compact index row limit ${index}.`,
      status: index % 3 === 0 ? "killed" : "proposed",
      at: `2026-08-01T${String(index % 24).padStart(2, "0")}:00:00.000Z`
    }));
    const index = renderIdeaIndex(entries, "incubator");
    expect(index.length).toBeLessThanOrEqual(MAX_IDEA_INDEX_CHARS);
    expect(index).toContain("Omitted older");
  });

  it("turns a dead-idea hard stop into a deterministic product-room veto", async () => {
    const killed = entry({
      id: "idea-2026-08-01-dead",
      title: "Daily reader streak",
      summary: "Reward readers for opening consecutive editions.",
      status: "killed"
    });
    const response = await decideLiveProductRoom({
      context: {
        root: await rootWith([killed]),
        cycleId: "20260804-cu-product",
        stage: "VALIDATION",
        now: new Date("2026-08-04T15:00:00.000Z"),
        limits: DEFAULT_BUDGET_LIMITS,
        remainingScheduledCycles: 1
      },
      idea: killed,
      index: "# Idea ledger index",
      yesterdayOutcome: "No delivery receipt."
    });
    expect(response.verdict).toBe("veto");
    expect(response.votes.find((vote) => vote.agent === "AUDIT")?.veto).toBe(true);
  });
});

describe("deterministic idea capture from portfolio rooms", () => {
  it("records a novel idea with no model call and links a near-duplicate instead of dropping it", async () => {
    const prior = entry({
      id: "idea-2026-08-01-b7c2",
      title: "Weekly fight breakdown for casual fans",
      summary: "A short weekly breakdown of one fight, written for people who do not follow the sport closely."
    });
    const root = await rootWith([prior]);

    // Unrelated subject: the adjudicator should call it novel from token overlap alone.
    const novel = await screenAndRecordIdea({
      root,
      namespace: "titty-tuesdays",
      proposal: proposal("Crop top drop tied to a season finale", "Time a limited drop to the final episode of a season and let the story carry the launch."),
      evidence: [],
      adjudicator: deterministicVaultAdjudicator()
    });
    expect(novel.verdict).toBe("novel");
    // `modelCalled` records that the adjudicator was consulted, not that a provider was
    // billed. The deterministic adjudicator reads the prefilter's own overlap scores, so
    // this path costs $0 even though the flag is true.
    expect(novel.modelCalled).toBe(true);

    // An exact repeat is caught before the adjudicator is ever consulted.
    const repeat = await screenAndRecordIdea({
      root,
      namespace: GLOBAL_IDEA_NAMESPACE,
      proposal: proposal(prior.title, prior.summary),
      evidence: [],
      adjudicator: deterministicVaultAdjudicator()
    });
    expect(repeat.verdict).toBe("duplicate_of");
    expect(repeat.modelCalled).toBe(false);
  });

  it("decides duplicate or novel from the score, and never claims variant_of", async () => {
    // The rule is unit-tested against explicit scores rather than through the similarity
    // function, so a change to scoring cannot silently move the decision boundary.
    const adjudicator = deterministicVaultAdjudicator({ duplicateAtOrAbove: 0.8 });
    const candidate = (score: number) => ({
      entry: entry({ id: "idea-2026-08-01-c1d4", title: "Prior", summary: "Prior idea." }),
      score
    });
    const ask = (score?: number) => adjudicator.adjudicate({
      proposal: proposal("Anything", "Any summary."),
      candidates: score === undefined ? [] : [candidate(score)]
    });

    expect((await ask()).verdict).toBe("novel");
    expect((await ask(0.12)).verdict).toBe("novel");
    expect((await ask(0.79)).verdict).toBe("novel");
    expect((await ask(0.8)).verdict).toBe("duplicate_of:idea-2026-08-01-c1d4");
    expect((await ask(0.97)).verdict).toBe("duplicate_of:idea-2026-08-01-c1d4");

    // variant_of is guarded by a rule requiring the reason to name the material
    // difference. A similarity score cannot make that judgement, and a sentence written
    // only to satisfy the regex would defeat the guard rather than honour it.
    for (const score of [0, 0.3, 0.6, 0.79, 0.8, 1]) {
      expect((await ask(score)).verdict).not.toContain("variant_of");
    }
  });

  it("keeps a captured idea inside the ledger's own compact caps", async () => {
    // The room contract caps title at 80 and summary at 280 precisely so a room can never
    // mint an idea the ledger would reject, and an idea can never become a document.
    const root = await rootWith([]);
    const captured = await screenAndRecordIdea({
      root,
      namespace: "global",
      proposal: proposal("A".repeat(80), "B".repeat(280)),
      evidence: [],
      adjudicator: deterministicVaultAdjudicator()
    });
    expect(() => IdeaLedgerEntrySchema.parse(captured.entry)).not.toThrow();
    expect(captured.entry.title).toHaveLength(80);
    expect(captured.entry.summary).toHaveLength(280);

    await expect(screenAndRecordIdea({
      root,
      namespace: "global",
      proposal: proposal("C".repeat(81), "valid summary"),
      evidence: [],
      adjudicator: deterministicVaultAdjudicator()
    })).rejects.toThrow();
  });
});
