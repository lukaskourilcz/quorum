import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RatingRecord } from "./rating-model";
import {
  appendRatingToFilesystem,
  RatingPersistenceError
} from "./rating-store";

const base: RatingRecord = {
  schemaVersion: "rating/1",
  id: "r-2026-08-04-a1b2c3d4",
  ventureId: "titty-tuesdays",
  objectKind: "plan",
  objectRef: { id: "plan-001", contentHash: "sha256:abcdef123456" },
  rating: "good",
  ratedAt: "2026-08-04T08:00:00.000Z"
};

describe("rating persistence", () => {
  it("appends immutable history and makes an exact retry a no-op", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-ratings-"));
    await expect(appendRatingToFilesystem(base, root)).resolves.toMatchObject({ idempotent: false });
    await expect(appendRatingToFilesystem(base, root)).resolves.toMatchObject({ idempotent: true });
    const next = {
      ...base,
      id: "r-2026-08-04-b2c3d4e5",
      rating: "perfect" as const,
      ratedAt: "2026-08-04T09:00:00.000Z"
    };
    await appendRatingToFilesystem(next, root);
    const raw = await readFile(path.join(root, "state", "ratings", "titty-tuesdays", "ledger.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(2);
  });

  it("rejects a conflicting replay key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-ratings-"));
    await appendRatingToFilesystem(base, root);
    await expect(appendRatingToFilesystem({ ...base, id: "r-2026-08-04-deadbeef", rating: "bad" }, root))
      .rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<RatingPersistenceError>);
  });
});
