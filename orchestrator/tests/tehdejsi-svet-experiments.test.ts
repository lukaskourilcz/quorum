import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  TehdejsiExperimentRegisterSchema,
  activeTehdejsiExperiment,
  alternatingTehdejsiVariant,
  assertTehdejsiExperimentRegisterUpdate
} from "../src/ventures/tehdejsi-svet/experiments.js";

async function register() {
  return TehdejsiExperimentRegisterSchema.parse(JSON.parse(await readFile(path.join(
    repoRoot, "state/ventures/tehdejsi-svet/experiments.json"
  ), "utf8")) as unknown);
}

describe("Tehdejsi svet experiment ladder", () => {
  it("records the five strategy steps and alternates variants deterministically", async () => {
    const recorded = await register();
    expect(recorded.experiments.map(({ kind }) => kind)).toEqual([
      "hook-frame", "perspective", "cta-class", "slide-count", "language-order"
    ]);
    const first = recorded.experiments[0]!;
    expect([0, 1, 2, 3].map((ordinal) => alternatingTehdejsiVariant(first, ordinal)))
      .toEqual(["self-frame", "parent-frame", "self-frame", "parent-frame"]);
    expect(activeTehdejsiExperiment(recorded)).toBeNull();
  });

  it("allows one evidence-backed live step and freezes its hypothesis after start", async () => {
    const recorded = await register();
    const active = structuredClone(recorded);
    Object.assign(active.experiments[0]!, {
      status: "active",
      baseline: 10,
      target: 12,
      startedAtCycle: 1,
      evidenceRefs: ["state/ventures/tehdejsi-svet/results/result-1234567890abcdef1234.json"]
    });
    active.updatedAt = "2026-08-23T16:00:00.000Z";
    const checked = assertTehdejsiExperimentRegisterUpdate(recorded, active);
    expect(activeTehdejsiExperiment(checked)?.id).toBe("ts-hook-frame");

    const rewritten = structuredClone(active);
    rewritten.experiments[0]!.target = 20;
    expect(() => assertTehdejsiExperimentRegisterUpdate(active, rewritten)).toThrow(/immutable: target/u);

    const twoLive = structuredClone(active);
    Object.assign(twoLive.experiments[1]!, { status: "active", baseline: 1, target: 2, startedAtCycle: 2, evidenceRefs: ["synthetic-ref"] });
    expect(TehdejsiExperimentRegisterSchema.safeParse(twoLive).success).toBe(false);
  });
});
