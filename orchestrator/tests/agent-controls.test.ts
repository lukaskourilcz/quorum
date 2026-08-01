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
  it("starts with social production off while preserving the bilingual article desk", async () => {
    const controls = await loadVentureAgentControls();
    expect(caughtUpSocialProductionEnabled(controls)).toBe(false);
    expect([...disabledAgentsForVenture(controls, "caught-up")]).toEqual(["THREADS", "INSTAGRAM", "FRAME"]);
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
      objective: "Review one draft",
      evidenceRefs: [],
      decisionNeeded: "PLAN",
      riskTags: ["social:threads"],
      budgetImpactUsd: 0,
      ventureId: "caught-up",
      owner: "PULSE",
      disabledParticipants: [...disabledAgentsForVenture(controls, "caught-up")]
    });
    expect(room.selectedParticipants.some(({ agent }) => agent === "THREADS")).toBe(false);
    expect(room.skippedParticipants.find(({ agent }) => agent === "THREADS")?.reason).toContain("switched off");
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
