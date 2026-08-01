import { describe, expect, it } from "vitest";
import { parseAgentControlDocument } from "./agent-control-model";

describe("admin agent controls", () => {
  it("accepts switchable disabled roles and rejects locked disabled roles", () => {
    const valid = {
      schemaVersion: 1,
      ventures: {
        "caught-up": { lockedOn: ["STET"], switchable: ["THREADS"], disabled: ["THREADS"] }
      }
    };
    expect(parseAgentControlDocument(valid)).toEqual(valid);
    expect(parseAgentControlDocument({
      ...valid,
      ventures: { "caught-up": { lockedOn: ["STET"], switchable: ["THREADS"], disabled: ["STET"] } }
    })).toBeNull();
  });
});
