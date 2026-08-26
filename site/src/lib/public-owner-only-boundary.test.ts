import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDailyResults } from "./daily-results";
import { getPublicIdeas } from "./idea-ledger";
import { getPublicMeetingRecords } from "./meeting-records";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

const idea = (id: string, title: string) => ({
  schemaVersion: "idea-ledger/1",
  id,
  fingerprint: `sha256:${"a".repeat(64)}`,
  title,
  summary: `${title} summary.`,
  origin: { agent: "SPARK", meetingRef: "standups/2026-08-26-morning" },
  status: "proposed",
  statusHistory: [{
    status: "proposed",
    at: "2026-08-26T06:00:00.000Z",
    meetingRef: "standups/2026-08-26-morning",
    reason: "Recorded for review."
  }],
  similarTo: []
});

describe("owner-only public boundary", () => {
  it("removes the workspace from public ideas, results and meeting fallbacks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "owner-only-boundary-"));
    await Promise.all([
      mkdir(path.join(root, "config"), { recursive: true }),
      mkdir(path.join(root, "state", "ideas", "caught-up"), { recursive: true }),
      mkdir(path.join(root, "state", "ideas", "personal-growth"), { recursive: true }),
      mkdir(path.join(root, "state", "notify", "digest"), { recursive: true }),
      mkdir(path.join(root, "state", "meetings"), { recursive: true })
    ]);
    await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({
      schemaVersion: "venture-registry/1",
      ventures: [{
        id: "caught-up",
        visibility: "public",
        meetings: []
      }, {
        id: "personal-growth",
        visibility: "owner-only",
        meetings: [
          { kind: "cu-edition", label: "Private morning", cadence: "daily@05:00", cast: [] },
          { kind: "cu-product", label: "Private evening", cadence: "daily@17:00", cast: [] }
        ]
      }]
    }));
    await writeFile(
      path.join(root, "state", "ideas", "caught-up", "ledger.jsonl"),
      `${JSON.stringify(idea("idea-2026-08-26-abcd", "Public cue"))}\n`
    );
    await writeFile(
      path.join(root, "state", "ideas", "personal-growth", "ledger.jsonl"),
      `${JSON.stringify(idea("idea-2026-08-26-ef01", "Private cue"))}\n`
    );
    await writeFile(path.join(root, "state", "notify", "digest", "2026-08-26.json"), JSON.stringify({
      digest: {
        date: "2026-08-26",
        portfolioLine: "Private progress was completed.",
        meetings: [{
          ventureId: "caught-up",
          kind: "cu-edition",
          held: true,
          bullets: [{ text: "Public edition review completed." }],
          costUsd: 0.01
        }, {
          ventureId: "personal-growth",
          kind: "pg-desk",
          held: true,
          bullets: [{ text: "Private planning completed." }],
          costUsd: 0.02
        }],
        operations: []
      }
    }));

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    await expect(getPublicIdeas()).resolves.toEqual([
      expect.objectContaining({ ventureId: "caught-up", title: "Public cue" })
    ]);
    await expect(getDailyResults(root)).resolves.toEqual([
      expect.objectContaining({
        portfolioLine: "",
        totalCostUsd: 0.01,
        rows: [expect.objectContaining({ ventureId: "caught-up" })]
      })
    ]);
    await expect(getPublicMeetingRecords()).resolves.toEqual([]);
  });
});
