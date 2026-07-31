import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getIncubatorSnapshot } from "./incubator-records";

describe("public incubator projection", () => {
  it("derives a public shortlist from the latest owner rating and hides malformed files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-incubator-"));
    await Promise.all([
      mkdir(path.join(root, "state", "meetings"), { recursive: true }),
      mkdir(path.join(root, "state", "ratings", "incubator"), { recursive: true }),
      mkdir(path.join(root, "state", "ventures", "incubator", "niche-proposals"), { recursive: true })
    ]);
    const repositoryRoot = path.resolve(process.cwd(), "..");
    await Promise.all(["scan", "synthesis"].map(async (kind) => {
      const name = `2026-08-01-incubator-${kind}.json`;
      await writeFile(
        path.join(root, "state", "meetings", name),
        await readFile(path.join(repositoryRoot, "state", "meetings", name), "utf8")
      );
    }));
    const proposal = {
      schemaVersion: "niche-proposal/1",
      id: "niche-2026-08-04-a1b2",
      domain: "Independent tool repair",
      oneLiner: "A daily briefing for people who keep old tools working.",
      whyPeopleCareDaily: "Repair decisions change when parts, manuals and workshop knowledge surface.",
      audienceHypothesis: {
        regions: ["Europe"],
        ageRange: { min: 25, max: 60 },
        genders: ["all"],
        interests: ["technology"],
        platforms: ["web", "newsletter"],
        adTargetingNotes: "Use public interests only."
      },
      contentShape: {
        cadence: "One weekday edition",
        formats: ["briefing", "source index"],
        caughtUpReuseNotes: "Reuse source collection and edition production."
      },
      competitionNotes: [{ note: "A repair bulletin exists.", evidenceRef: "https://example.com/evidence" }],
      risks: ["Source coverage may be too narrow."],
      evidenceRefs: ["https://example.com/evidence"],
      status: "proposed",
      originMeetingRef: "meetings/2026-08-01-incubator-synthesis"
    };
    await writeFile(path.join(root, "state", "ventures", "incubator", "niche-proposals", "tool-repair.json"), JSON.stringify(proposal));
    await writeFile(path.join(root, "state", "ventures", "incubator", "niche-proposals", "malformed.json"), "not-json");
    await writeFile(path.join(root, "state", "ratings", "incubator", "ledger.jsonl"), `${JSON.stringify({
      schemaVersion: "rating/1",
      id: "r-2026-08-04-a1b2",
      ventureId: "incubator",
      objectKind: "niche-proposal",
      objectRef: { id: proposal.id, contentHash: "sha256:abcdef123456" },
      rating: "perfect",
      ratedAt: "2026-08-04T10:00:00.000Z"
    })}\n`);

    const snapshot = await getIncubatorSnapshot(root);
    expect(snapshot.proposals).toHaveLength(1);
    expect(snapshot.shortlist).toMatchObject([{ id: proposal.id, status: "shortlist", rating: { value: "perfect" } }]);
    expect(snapshot.meetingIds).toEqual([
      "2026-08-01-incubator-scan",
      "2026-08-01-incubator-synthesis"
    ]);
    expect(snapshot.unreadableFiles).toEqual(["malformed.json"]);
    expect(snapshot.apiSpendUsd).toBe(0);
  });
});
