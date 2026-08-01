import { describe, expect, it, vi } from "vitest";
import liveNightCheckpoint from "../../../state/standups/2026-08-01-night.json";

vi.mock("server-only", () => ({}));

import { parsePublicStandupRecord } from "./standup-records";

describe("public standup record boundary", () => {
  it("accepts a genuine idle checkpoint with no fabricated council vote", () => {
    expect(parsePublicStandupRecord(liveNightCheckpoint)).toMatchObject({
      id: "20260801201444-night",
      phase: "night",
      fixture: false,
      status: "NO_ACTION",
      proposals: [],
      voteMatrix: []
    });
  });

  it("rejects an empty active room", () => {
    const malformed = structuredClone(liveNightCheckpoint);
    malformed.status = "PLAN";
    expect(parsePublicStandupRecord(malformed)).toBeNull();
  });
});
