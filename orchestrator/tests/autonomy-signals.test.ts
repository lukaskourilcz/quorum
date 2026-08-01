import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeAutonomySnapshot } from "../src/autonomy/signals.js";
import { repoRoot } from "../src/paths.js";

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("zero-model operating signals", () => {
  it("treats NO_EDITION as neutral and never exposes audience metrics", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-signals-"));
    await json(path.join(stateRoot, "edition/deliveries/one.json"), { status: "delivered", editionStatus: "edition" });
    await json(path.join(stateRoot, "edition/deliveries/two.json"), { status: "delivered", editionStatus: "no_edition" });
    await json(path.join(stateRoot, "edition/deliveries/three.json"), { status: "needs_reconciliation", editionStatus: "edition" });
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-01T04:00:00.000Z") });
    const caughtUp = snapshot.growth.find((venture) => venture.venture === "caught-up");
    expect(caughtUp?.signals.find((entry) => entry.id === "edition-cadence")?.value).toBe(0.5);
    expect(snapshot.metricsIngestionEnabled).toBe(false);
    expect(JSON.stringify(snapshot)).not.toMatch(/visitor|reader|views|likes|engagement/i);
  });
});
