import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { NicheProposalSchema } from "../src/contracts/niche-proposal.js";
import { RatingRecordSchema } from "../src/contracts/rating.js";
import { VisualWeightsSchema } from "../src/contracts/visual-weights.js";
import {
  applyNicheProposalRating,
  createFoundingBriefDraft,
  createIncubatorDryMeetings,
  INCUBATOR_SCAN_SEATS,
  INCUBATOR_SYNTHESIS_SEATS
} from "../src/incubator/process.js";
import { repoRoot } from "../src/paths.js";
import { parseTasteDocument } from "../src/taste/model.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

async function proposalFixture() {
  return NicheProposalSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts", "fixtures", "niche-proposal.valid.json"),
    "utf8"
  )));
}

function rating(proposalId: string, value: "perfect" | "good" | "bad") {
  return RatingRecordSchema.parse({
    schemaVersion: "rating/1",
    id: `r-2026-08-04-${value === "perfect" ? "a1b2" : value === "good" ? "c3d4" : "e5f6"}`,
    ventureId: "incubator",
    objectKind: "niche-proposal",
    objectRef: { id: proposalId, contentHash: "sha256:abcdef123456" },
    rating: value,
    ratedAt: `2026-08-04T1${value === "perfect" ? "0" : value === "good" ? "1" : "2"}:00:00.000Z`
  });
}

describe("magazine incubator", () => {
  it("registers a taste-enabled exploration workspace on the resolved research schedule", async () => {
    const venture = (await loadVentureRegistry()).ventures.find((entry) => entry.id === "incubator");
    expect(venture).toMatchObject({
      name: "Magazine Incubator",
      status: "exploration",
      taste: true,
      ledgerNamespace: "incubator",
      adminTabs: ["niche-proposals"],
      pendingApproval: "budget-2026-08d"
    });
    expect(venture?.meetings.map(({ kind, cadence }) => ({ kind, cadence }))).toEqual([
      { kind: "incubator-scan", cadence: "daily@07:00" },
      { kind: "incubator-synthesis", cadence: "daily@21:00" }
    ]);
  });

  it("reproduces both committed zero-cost dry meetings with the required squads", async () => {
    const generated = createIncubatorDryMeetings();
    const committed = await Promise.all(generated.map(async (meeting) => MeetingRecordSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "state", "meetings", `${meeting.date}-${meeting.kind}.json`),
      "utf8"
    )))));
    expect(committed).toEqual(generated);
    expect(generated[0].participantReasons.map(({ agent }) => agent)).toEqual(INCUBATOR_SCAN_SEATS);
    expect(generated[1].participantReasons.map(({ agent }) => agent)).toEqual(INCUBATOR_SYNTHESIS_SEATS);
    expect(generated.every((meeting) => meeting.fixture && meeting.ledger.actualCycleUsd === 0 && meeting.proposals.length === 0)).toBe(true);
  });

  it("enforces the scan and synthesis transcript ceilings", () => {
    const [scan, synthesis] = createIncubatorDryMeetings();
    const scanOverflow = { ...scan, roomTranscript: { ...scan.roomTranscript, turns: Array(13).fill(scan.roomTranscript.turns[0]) } };
    const synthesisOverflow = { ...synthesis, roomTranscript: { ...synthesis.roomTranscript, turns: Array(19).fill(synthesis.roomTranscript.turns[0]) } };
    expect(MeetingRecordSchema.safeParse(scanOverflow).success).toBe(false);
    expect(MeetingRecordSchema.safeParse(synthesisOverflow).success).toBe(false);
  });

  it("derives the complete proposal lifecycle from the latest owner rating", async () => {
    const proposal = await proposalFixture();
    expect(applyNicheProposalRating(proposal, rating(proposal.id, "good")).status).toBe("rated");
    expect(applyNicheProposalRating(proposal, rating(proposal.id, "perfect")).status).toBe("shortlist");
    expect(applyNicheProposalRating(proposal, rating(proposal.id, "bad")).status).toBe("archived");
    expect(() => applyNicheProposalRating(proposal, {
      ...rating(proposal.id, "good"),
      ventureId: "titty-tuesdays"
    })).toThrow("does not address");
  });

  it("can draft an owner inbox brief but never authorizes a registry mutation", async () => {
    const proposal = applyNicheProposalRating(
      await proposalFixture(),
      rating((await proposalFixture()).id, "perfect")
    );
    expect(createFoundingBriefDraft(proposal, false)).toBeNull();
    expect(createFoundingBriefDraft(proposal, true)).toMatchObject({
      destination: "state/INBOX.md",
      type: "HUMAN_APPROVAL",
      registryMutationAuthorized: false
    });
    expect(() => createFoundingBriefDraft({ ...proposal, status: "rated" }, true)).toThrow("shortlisted");
  });

  it("starts without invented preferences, proposals or visual adjustments", async () => {
    const [tasteRaw, weightsRaw, proposalNames, prompt] = await Promise.all([
      readFile(path.join(repoRoot, "state", "taste", "incubator", "TASTE.md"), "utf8"),
      readFile(path.join(repoRoot, "config", "visual-weights", "incubator.json"), "utf8"),
      readdir(path.join(repoRoot, "state", "ventures", "incubator", "niche-proposals")),
      readFile(path.join(repoRoot, "orchestrator", "prompts", "incubator.md"), "utf8")
    ]);
    expect(parseTasteDocument(tasteRaw)).toMatchObject({ watermark: null, pursue: [], avoid: [], open: [] });
    expect(VisualWeightsSchema.parse(JSON.parse(weightsRaw)).adjustments).toEqual([]);
    expect(proposalNames.filter((name) => name.endsWith(".json"))).toEqual([]);
    expect(prompt).toContain("Zero is a valid and preferred result");
    expect(prompt).toContain("Only an owner-countersigned founding record");
  });
});
