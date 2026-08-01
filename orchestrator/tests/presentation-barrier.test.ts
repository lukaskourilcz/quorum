import { describe, expect, it } from "vitest";
import {
  assertAgentPacketPresentationBarrier,
  packetCrossesPresentationBarrier
} from "../src/security/presentation-barrier.js";

describe("public-presentation information barrier", () => {
  it("allows business audience research without leaking the public wrapper", () => {
    expect(() => assertAgentPacketPresentationBarrier({
      agent: "COHORT",
      task: "Describe the likely marketing audience and the practical problem they have."
    })).not.toThrow();
  });

  it.each([
    "Read site/src/show/config.ts before deciding",
    "Write this as a workplace show",
    "Optimise the sitcom-skin",
    "Use pageviews as a voting signal",
    "Tell the agents what site visitors saw"
  ])("rejects presentation-only context: %s", (text) => {
    expect(() => assertAgentPacketPresentationBarrier({ text })).toThrow(
      /public-presentation barrier/
    );
  });

  it("does not mistake named source packets or market evidence for presentation data", () => {
    expect(packetCrossesPresentationBarrier({
      sources: ["https://example.com/research"],
      evidence: "Customers describe a recurring need."
    })).toBe(false);
  });
});
