import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminLaunchBinder, readAdminPortfolio } from "./admin-portfolio";

describe("admin portfolio projection", () => {
  it("projects all review card kinds and a Perfect owner-rated binder plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-admin-portfolio-"));
    const directories = [
      "config",
      "state/ideas/caught-up",
      "state/ratings/caught-up",
      "state/ventures/caught-up/plans",
      "state/ventures/caught-up/niche-proposals"
    ];
    await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "caught-up",
        name: "Caught Up",
        status: "operating",
        ledgerNamespace: "caught-up",
        adminTabs: ["ideas", "plans", "visuals", "niche-proposals"]
      }]
    }));
    const idea = {
      schemaVersion: "idea-ledger/1",
      id: "idea-2026-08-04-abcd",
      fingerprint: `sha256:${"a".repeat(64)}`,
      title: "Source cue",
      summary: "Show source context.",
      origin: { agent: "SPARK", meetingRef: "standups/2026-08-04-morning" },
      status: "proposed",
      statusHistory: [{ status: "proposed", at: "2026-08-04T04:00:00.000Z", meetingRef: "standups/2026-08-04-morning", reason: "Novel." }],
      similarTo: []
    };
    await writeFile(path.join(root, "state", "ideas", "caught-up", "ledger.jsonl"), `${JSON.stringify(idea)}\n`);
    const plan = {
      schemaVersion: "marketing-plan/1",
      id: "plan-001",
      ventureId: "caught-up",
      seasonId: "season-001",
      title: "Reader launch",
      objective: "Make the new source cue legible.",
      tactics: [{ type: "content", description: "Explain it.", assetsNeeded: [], platformPolicyNote: "No policy risk." }],
      calendar: [{ week: 1, focus: "Publish the explanation." }],
      audienceRefs: ["audience-001"],
      kpis: ["reader comprehension"],
      status: "owner_rated",
      originMeetingRef: "meetings/2026-08-04-cu-product"
    };
    await writeFile(path.join(root, "state", "ventures", "caught-up", "plans", "plan-001.json"), JSON.stringify(plan));
    await writeFile(path.join(root, "state", "ventures", "caught-up", "niche-proposals", "niche-001.json"), JSON.stringify({
      schemaVersion: "niche-proposal/1",
      id: "niche-2026-08-04-abcd",
      domain: "Repair logs",
      oneLiner: "A daily repair-log publication.",
      whyPeopleCareDaily: "Readers want a concise record of what changed.",
      audienceHypothesis: {
        regions: ["CZ"],
        ageRange: { min: 18, max: 65 },
        genders: ["all"],
        interests: ["technology"],
        platforms: ["web"],
        adTargetingNotes: "Public interest categories only."
      },
      contentShape: {
        cadence: "daily",
        formats: ["brief"],
        caughtUpReuseNotes: "Reuse the bilingual edition pipeline."
      },
      competitionNotes: [],
      risks: [],
      evidenceRefs: [],
      status: "proposed",
      originMeetingRef: "meetings/2026-08-04-incubator-synthesis"
    }));
    const planRating = JSON.stringify({
      schemaVersion: "rating/1",
      id: "r-2026-08-04-abcd",
      ventureId: "caught-up",
      objectKind: "plan",
      objectRef: { id: "plan-001", contentHash: "sha256:abcdef123456" },
      rating: "perfect",
      ratedAt: "2026-08-04T10:00:00.000Z"
    });
    const proposalRating = JSON.stringify({
      schemaVersion: "rating/1",
      id: "r-2026-08-04-cdef",
      ventureId: "caught-up",
      objectKind: "niche-proposal",
      objectRef: { id: "niche-2026-08-04-abcd", contentHash: "sha256:123456abcdef" },
      rating: "perfect",
      ratedAt: "2026-08-04T11:00:00.000Z"
    });
    await writeFile(path.join(root, "state", "ratings", "caught-up", "ledger.jsonl"), `${planRating}\n${proposalRating}\n`);

    const portfolio = await readAdminPortfolio(root);
    expect(portfolio.ventures[0]?.cards.map((card) => card.kind).sort()).toEqual([
      "idea",
      "niche-proposal",
      "plan"
    ]);
    expect(portfolio.ventures[0]?.cards.find((card) => card.kind === "niche-proposal")?.status).toBe("shortlist");
    await expect(readAdminLaunchBinder("caught-up", root)).resolves.toMatchObject({
      plans: [{ id: "plan-001", rating: { rating: "perfect" } }]
    });
  });
});
