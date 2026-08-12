import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import { DoorMoneyRecommendationsPanel } from "./door-money-recommendations-panel";
import type { AdminDoorMoneyRecommendation } from "@/lib/admin-door-money";

const recommendation: AdminDoorMoneyRecommendation = {
  id: "fixture-night-bus-carousel",
  date: "2026-08-12",
  status: "approved",
  hook: "The last bus carried one unfinished promise.",
  formats: ["carousel"],
  platforms: ["instagram", "threads"],
  copyBlocks: [{ kind: "cover", ordinal: 1, text: "The first synthetic cover." }],
  rationale: "The invented night-bus errand has a clear turn and a concrete object.",
  curiosityBridge: "The fictional chapter follows the route after midnight.",
  cta: { mode: "soft-curiosity", text: null },
  evidence: {
    manuscriptHash: `sha256:${"a".repeat(64)}`,
    chunkIds: ["ch01-s01-c001"],
    excerptChunkId: "ch01-s01-c001",
    excerpt: "The paper ticket was fictional, creased twice, and still worth keeping.",
    privateStoreLink: `private-book://sha256/${"a".repeat(64)}/chunks/ch01-s01-c001.json`
  },
  gateResults: [{ gate: "voice", passed: true, detail: "The synthetic copy keeps its plain landing." }],
  designLab: { eligible: true, readyAt: "2026-08-12T11:00:00.000Z" },
  owner: {
    editedCopyBlocks: [{ kind: "cover", ordinal: 1, text: "The owner-edited synthetic cover." }],
    approvalNote: "Keep the last line.",
    rejectionReason: null,
    approvedAt: "2026-08-12T11:00:00.000Z",
    rejectedAt: null,
    postedAt: null,
    archivedAt: null,
    postedUrl: null,
    resultIds: ["fixture-owner-result"],
  },
  statusHistory: [
    { from: null, to: "draft", at: "2026-08-12T10:00:00.000Z", actor: "system", reason: null },
    { from: "draft", to: "approved", at: "2026-08-12T11:00:00.000Z", actor: "owner", reason: null }
  ],
  generatedAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T11:00:00.000Z",
  contentHash: "sha256:123456abcdef",
  ratings: [{
    schemaVersion: "rating/1",
    id: "r-2026-08-12-abcd",
    ventureId: "door-money",
    objectKind: "recommendation",
    objectRef: { id: "fixture-night-bus-carousel", contentHash: "sha256:123456abcdef" },
    rating: "good",
    ratedAt: "2026-08-12T11:10:00.000Z"
  }]
};

describe("Door Money recommendation review", () => {
  it("renders the effective copy, bounded source proof, gates, results and rating", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <DoorMoneyRecommendationsPanel recommendations={{ state: "present", items: [recommendation], unreadable: 0 }} />
      </AdminWriteProvider>
    );

    expect(html).toContain("The owner-edited synthetic cover.");
    expect(html).not.toContain("The first synthetic cover.");
    expect(html).toContain("ch01-s01-c001");
    expect(html).toContain("The paper ticket was fictional");
    expect(html).toContain("private-book://sha256/");
    expect(html).not.toContain('href="private-book:');
    expect(html).toContain("Passed · voice");
    expect(html).toContain("fixture-owner-result");
    expect(html).toContain("Your rating");
    expect(html).toContain("Record posted URL");
    expect(html).toContain('type="url"');
  });

  it("shows draft review controls but disables every write on a read-only deployment", () => {
    const draft = {
      ...recommendation,
      status: "draft" as const,
      owner: {
        ...recommendation.owner,
        editedCopyBlocks: null,
        approvalNote: null,
        approvedAt: null,
        resultIds: []
      },
      statusHistory: [recommendation.statusHistory[0]!]
    };
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <DoorMoneyRecommendationsPanel recommendations={{ state: "present", items: [draft], unreadable: 0 }} />
      </AdminWriteProvider>
    );

    expect(html).toContain("Approve for manual posting");
    expect(html).toContain("Edit and approve");
    expect(html).toContain("Reject");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("names an absent queue instead of inventing examples", () => {
    const html = renderToStaticMarkup(
      <DoorMoneyRecommendationsPanel recommendations={{ state: "missing", items: [], unreadable: 0 }} />
    );
    expect(html).toContain("No Door Money recommendation store exists yet.");
  });
});
