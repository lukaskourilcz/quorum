import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { slotRecordPath } from "../src/meetings/slot-record.js";

const guard = await import(path.join(repoRoot, "scripts", "slot-guard.mjs")) as {
  slotRecordPath: (phase: string, date: string) => string;
  slotGuardVerdict: (input: {
    eventName: string;
    trigger: string;
    phase: string;
    deliveryOnly: string;
    stateRoot: string;
    now: Date;
  }) => { proceed: boolean; reason: string };
};

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "slot-guard-"));
}

async function write(root: string, relative: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "{}", "utf8");
}

const vercelCron = {
  eventName: "workflow_dispatch",
  trigger: "vercel-cron",
  deliveryOnly: "false",
  now: new Date("2026-08-10T09:00:00.000Z")
};

/**
 * A dispatch run averages 5.8 billable minutes, and a large share of them are firings whose
 * answer was already on disk when the runner started. Every one of those paid for checkout,
 * pnpm and a full workspace install to reach an in-process guard that said no.
 */
describe("the cheap slot pre-check", () => {
  it("stops a firing whose slot already has a record today", async () => {
    const root = await stateRoot();
    await write(root, "meetings/2026-08-10-tt-marketing.json");

    expect(guard.slotGuardVerdict({ ...vercelCron, phase: "tt-marketing", stateRoot: root }))
      .toMatchObject({ proceed: false });
  });

  it("stops a gated slot whose skip record the first firing already wrote", async () => {
    const root = await stateRoot();
    await write(root, "meetings/skips/2026-08-10-mma-intake.json");

    expect(guard.slotGuardVerdict({ ...vercelCron, phase: "mma-intake", stateRoot: root }))
      .toMatchObject({ proceed: false });
  });

  it.each([
    ["a slot with nothing on disk", "mag-desk"],
    ["a company shift with nothing on disk", "morning"]
  ])("proceeds for %s", async (_name, phase) => {
    const root = await stateRoot();

    expect(guard.slotGuardVerdict({ ...vercelCron, phase, stateRoot: root })).toMatchObject({ proceed: true });
  });

  it("never stops the edition retry, whose whole job is a second firing", async () => {
    const root = await stateRoot();
    await write(root, "meetings/2026-08-10-cu-edition.json");

    // 09:00 Prague in August is 07:00Z.
    expect(guard.slotGuardVerdict({
      ...vercelCron,
      phase: "cu-edition",
      stateRoot: root,
      now: new Date("2026-08-10T07:00:00.000Z")
    })).toMatchObject({ proceed: true });
    // The 05:00 firing on a day that already has the record is a duplicate and does stop.
    expect(guard.slotGuardVerdict({
      ...vercelCron,
      phase: "cu-edition",
      stateRoot: root,
      now: new Date("2026-08-10T03:00:00.000Z")
    })).toMatchObject({ proceed: false });
  });

  it.each([
    ["a manual dispatch", { eventName: "workflow_dispatch", trigger: "manual" }],
    ["a delivery-only run", { eventName: "workflow_dispatch", trigger: "vercel-cron", deliveryOnly: "true" }],
    ["a backstop sweep, which names no single slot", { eventName: "schedule", trigger: "" }]
  ])("never answers for %s", async (_name, overrides) => {
    const root = await stateRoot();
    await write(root, "meetings/2026-08-10-tt-marketing.json");

    expect(guard.slotGuardVerdict({
      ...vercelCron,
      phase: "tt-marketing",
      stateRoot: root,
      ...overrides
    })).toMatchObject({ proceed: true });
  });

  // The script imports nothing from the workspace, so its copy of this mapping cannot drift by
  // being type-checked. It drifts silently, and the guard would then look for a record under a
  // path nothing writes and let every firing through.
  it("resolves the same record path the orchestrator does", () => {
    for (const phase of ["morning", "afternoon", "night", "article-am", "article-pm", "mag-desk", "cu-edition", "tt-marketing", "mma-intake", "mma-analysis", "mag-editorial", "cu-product"] as const) {
      expect(guard.slotRecordPath(phase, "2026-08-10"), phase).toBe(slotRecordPath(phase, "2026-08-10"));
    }
  });

  it("imports nothing that a workspace install has to provide", async () => {
    const source = await readFile(path.join(repoRoot, "scripts", "slot-guard.mjs"), "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]!);
    expect(imports.every((specifier) => specifier.startsWith("node:")), imports.join(", ")).toBe(true);
  });
});

/**
 * An output the mode step never produced is the empty string, and empty is not 'true' — so every
 * condition written as `steps.mode.outputs.x != 'true'` reads as satisfied when the pre-check
 * stopped the run before the mode step. Each of those steps has to name the pre-check too, or a
 * stopped run walks straight into the release gate with no dependencies installed.
 */
describe("the workflow cannot run a heavy step past a stopped pre-check", () => {
  it("names the pre-check in every condition that negates a mode output", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "cycle.yml"), "utf8");
    const unguarded = workflow
      .split("\n")
      .filter((line) => line.includes("steps.mode.outputs") && /steps\.mode\.outputs\.[a-z_]+ != '/u.test(line))
      .filter((line) => !line.includes("steps.guard.outputs.proceed == 'true'"));

    expect(unguarded, unguarded.join("\n")).toEqual([]);
  });

  it("keeps the pre-check ahead of every install", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "cycle.yml"), "utf8");
    const check = workflow.indexOf("- name: Cheap slot pre-check");
    expect(check).toBeGreaterThan(-1);
    for (const step of ["- name: Install pnpm", "- name: Install Node.js", "- name: Install locked dependencies"]) {
      expect(workflow.indexOf(step), step).toBeGreaterThan(check);
    }
    // And the pre-check itself needs no install: it runs plain node.
    expect(workflow).toContain("run: node scripts/slot-guard.mjs");
  });
});
