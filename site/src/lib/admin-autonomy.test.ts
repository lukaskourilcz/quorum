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
      venture: "goviral",
      question: "Which of this week's rising topics belongs to a magazine desk?",
      decision_at_stake: "Whether the desk gets an agenda for it tomorrow.",
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
    expect(snapshot.priorities.map((entry) => entry.question)).toEqual(["Which of this week's rising topics belongs to a magazine desk?"]);
  });
});

describe("quality rates with nothing behind them", () => {
  async function snapshotRoot(quality: unknown): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "admin-autonomy-rates-"));
    await mkdir(path.join(root, "state", "autonomy"), { recursive: true });
    await writeFile(
      path.join(root, "state", "autonomy", "latest.json"),
      JSON.stringify({ schemaVersion: "autonomy-snapshot/1", generatedAt: "2026-08-08T04:00:00.000Z", growth: [], quality })
    );
    return root;
  }

  it("reads a rate measured over nothing as no-data, not as zero", async () => {
    const { quality } = await readAdminAutonomy(await snapshotRoot({
      killedSlotReasons: {},
      vetoRate: 0.1087,
      firstPassRate: 0,
      retryRate: 0,
      sourceAgreementRate: 0.3721,
      verifierPassRate: 0,
      denominators: { meetings: 46, proofs: 0, fighterFields: 121 }
    }));
    expect(quality.vetoRate).toBe(0.1087);
    expect(quality.sourceAgreementRate).toBe(0.3721);
    // Nothing was released, so "0% passed" would be a claim about releases that never happened.
    expect(quality.verifierPassRate).toBeNull();
    expect(quality.firstPassRate).toBeNull();
    expect(quality.retryRate).toBeNull();
  });

  it("keeps a real zero when something was measured", async () => {
    const { quality } = await readAdminAutonomy(await snapshotRoot({
      killedSlotReasons: {},
      vetoRate: 0,
      firstPassRate: 0,
      retryRate: 0,
      sourceAgreementRate: 0,
      verifierPassRate: 0,
      denominators: { meetings: 12, proofs: 8, fighterFields: 40 }
    }));
    expect(quality.verifierPassRate).toBe(0);
    expect(quality.vetoRate).toBe(0);
  });

  it("refuses to read a snapshot written before the denominators existed", async () => {
    const { quality } = await readAdminAutonomy(await snapshotRoot({
      killedSlotReasons: {},
      vetoRate: 0.1087,
      firstPassRate: 0,
      retryRate: 0,
      sourceAgreementRate: 0.3721,
      verifierPassRate: 0
    }));
    expect(Object.values(quality).filter((value) => typeof value === "number")).toEqual([]);
  });
});
