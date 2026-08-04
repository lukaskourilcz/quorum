import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminAutonomy } from "./admin-autonomy";


describe("a question a seat proposed", () => {
  it("does not make the whole queue unreadable", async () => {
    // Insisting requested_by === "VIZE" returned null for the entire queue, so one FORGE or
    // PULSE proposal stopped /admin rendering and blocked every add and archive until the file
    // was hand-edited. The quarterly collector has written AUDIT here since before proposals
    // existed, so the break was already latent.
    const root = await mkdtemp(path.join(os.tmpdir(), "admin-autonomy-proposed-"));
    await mkdir(path.join(root, "state"), { recursive: true });
    const item = {
      schemaVersion: "priority-item/1",
      id: "priority-1234567890abcdef",
      venture: "incubator",
      question: "Which niche has the clearest unmet need?",
      decision_at_stake: "Whether to open a research room for it.",
      evidence_needed: [],
      requested_by: "FORGE",
      created: "2026-08-04T20:00:00.000Z",
      expires: "2026-08-11T20:00:00.000Z",
      status: "open",
      why_not_reason: null,
      consumed_by: null
    };
    await writeFile(
      path.join(root, "state", "priority-queue.json"),
      JSON.stringify({ schemaVersion: "priority-queue/1", items: [item], updatedAt: "2026-08-04T20:00:00.000Z" })
    );
    const snapshot = await readAdminAutonomy(root);
    expect(snapshot.priorities.map((entry) => entry.question)).toEqual(["Which niche has the clearest unmet need?"]);
  });
});
