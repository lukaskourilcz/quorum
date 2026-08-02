import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadRoutingConfig, routeBoardroom } from "../src/boardroom/router.js";
import { configRoot } from "../src/paths.js";
import {
  VentureAgentControlsSchema,
  caughtUpSocialProductionEnabled,
  disabledAgentsForVenture,
  enabledAgentsForVenture,
  loadVentureAgentControls
} from "../src/ventures/agent-controls.js";
import { composeArticleHero } from "../src/social/media/compose.js";
import path from "node:path";

describe("venture agent controls", () => {
  it("creates social drafts while the separate health gate controls publishing", async () => {
    const controls = await loadVentureAgentControls();
    expect(caughtUpSocialProductionEnabled(controls)).toBe(true);
    expect([...disabledAgentsForVenture(controls, "caught-up")]).toEqual(["THREADS", "INSTAGRAM"]);
    expect(enabledAgentsForVenture(controls, "caught-up", ["HERALD", "STET", "HACEK", "THREADS"]))
      .toEqual(["HERALD", "STET", "HACEK"]);
  });

  it("rejects attempts to disable a locked role", async () => {
    const controls = await loadVentureAgentControls();
    const invalid = structuredClone(controls);
    invalid.ventures["caught-up"]!.disabled.push("STET");
    expect(() => VentureAgentControlsSchema.parse(invalid)).toThrow(/not switchable/);
  });

  it("records a switched-off role in the routing explanation", async () => {
    const [controls, routing] = await Promise.all([
      loadVentureAgentControls(),
      loadRoutingConfig(path.join(configRoot, "agent-routing.json"))
    ]);
    const room = routeBoardroom(routing, {
      roomId: "ROOM-AGENT-CONTROLS",
      topicType: "social",
      objective: "Review a measurement request",
      evidenceRefs: [],
      decisionNeeded: "PLAN",
      riskTags: ["social:metrics"],
      budgetImpactUsd: 0,
      ventureId: "mma-files",
      owner: "PULSE",
      disabledParticipants: [...disabledAgentsForVenture(controls, "mma-files")]
    });
    expect(room.selectedParticipants.some(({ agent }) => agent === "SPLIT")).toBe(false);
    expect(room.skippedParticipants.find(({ agent }) => agent === "SPLIT")?.reason).toContain("switched off");
    expect(room.selectedParticipants.some(({ agent }) => agent === "REACH")).toBe(false);
    expect(room.skippedParticipants.find(({ agent }) => agent === "REACH")?.reason).toContain("switched off");
  });

  it("renders a small deterministic article hero", async () => {
    const first = await composeArticleHero({ date: "2026-08-01", title: "A useful AI change", dek: "The facts and the remaining uncertainty." });
    const second = await composeArticleHero({ date: "2026-08-01", title: "A useful AI change", dek: "The facts and the remaining uncertainty." });
    const metadata = await sharp(first).metadata();
    expect(first.equals(second)).toBe(true);
    expect(metadata).toMatchObject({ format: "webp", width: 1200, height: 630 });
    expect(first.byteLength).toBeLessThan(400_000);
  });
});
