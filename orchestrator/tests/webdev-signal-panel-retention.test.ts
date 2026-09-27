import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { WEBDEV_PANEL_RETENTION_DAYS, pruneWebDevSignalPanels } from "../src/ventures/webdev-signal/panel-retention.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "webdev-panel-retention-"));
  roots.push(root);
  return root;
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

const ASSETS = "ventures/webdev-signal/design-lab/assets";
const hashOf = (letter: string) => letter.repeat(64);

/** A schema-valid render receipt for one day, locale and payload hash, with four panels on disk. */
async function rendered(state: string, date: string, locale: "cs" | "en", payloadHash: string, name = `${payloadHash}-${locale}.json`): Promise<void> {
  const refs = [1, 2, 3, 4].map((panel) => `state/${ASSETS}/${payloadHash}/${locale}/0${panel}.png`);
  for (const ref of refs) {
    await mkdir(path.dirname(path.join(state, ref.replace(/^state\//u, ""))), { recursive: true });
    await writeFile(path.join(state, ref.replace(/^state\//u, "")), "png");
  }
  await mkdir(path.join(state, "ventures/webdev-signal/design-lab/receipts"), { recursive: true });
  await writeFile(path.join(state, "ventures/webdev-signal/design-lab/receipts", name), JSON.stringify({
    schemaVersion: "webdev-render-receipt/1",
    payloadRef: `state/ventures/webdev-signal/design-lab/payloads/${payloadHash.slice(0, 16)}-${locale}.json`,
    payloadHash,
    packageRef: `state/ventures/webdev-signal/packages/${date}-${locale}.json`,
    packageHash: hashOf("f"),
    locale,
    renderer: {
      package: "@boardlessai/carousel-studio",
      version: "1.0.0",
      templateId: "webdev-signal-change-4",
      templateVersion: "1.0.0",
      brandId: "webdev-signal",
      brandVersion: "1.0.0",
      fontSetVersion: "committed-metrics/1"
    },
    format: "instagram-portrait",
    dimensions: { width: 1080, height: 1350 },
    outputs: refs.map((assetRef, index) => ({ panelId: `panel-0${index + 1}`, assetRef, svgHash: hashOf("1"), pngHash: hashOf("2") })),
    panelCount: 4,
    checks: { schema: "pass", capability: "pass", textFit: "pass", contrast: "pass", statusNonColor: "pass", sourcePlacement: "pass", altTextSemantic: "pass", exactIdentifiers: "pass" },
    cache: { key: hashOf("3"), status: "new", reusedReceiptRef: null },
    export: { startedAt: `${date}T03:00:00.000Z`, completedAt: `${date}T03:00:05.000Z`, durationMs: 5000 },
    outcome: "success",
    reason: null,
    correctionSequence: 0,
    supersededReceiptRef: null,
    providerCostUsd: 0
  }));
}

describe("WebDev Signal's rendered panels leave the tree after four weeks", () => {
  it("keeps four weeks", () => {
    expect(WEBDEV_PANEL_RETENTION_DAYS).toBe(28);
  });

  it("removes a render dated before the window by its package day and keeps its receipt", async () => {
    const state = await tempState();
    await rendered(state, "2026-08-01", "cs", hashOf("a"));
    await rendered(state, "2026-08-01", "en", hashOf("a"));
    await rendered(state, "2026-08-29", "cs", hashOf("b"));

    const result = await pruneWebDevSignalPanels({ stateRoot: state, today: "2026-09-26" });

    expect(result).toEqual({ keepFrom: "2026-08-29", removed: [`${hashOf("a")}/cs`, `${hashOf("a")}/en`], kept: 1, unmanaged: 0 });
    expect(await exists(path.join(state, ASSETS, hashOf("a")))).toBe(false);
    expect(await exists(path.join(state, ASSETS, hashOf("b"), "cs", "01.png"))).toBe(true);
    expect(await exists(path.join(state, "ventures/webdev-signal/design-lab/receipts", `${hashOf("a")}-cs.json`))).toBe(true);
  });

  it("dates a render by the newest package that reused it", async () => {
    const state = await tempState();
    await rendered(state, "2026-08-01", "cs", hashOf("a"));
    await rendered(state, "2026-09-20", "cs", hashOf("a"), "reused.json");

    const result = await pruneWebDevSignalPanels({ stateRoot: state, today: "2026-09-26" });

    expect(result).toMatchObject({ removed: [], kept: 1 });
  });

  it("never removes a directory no receipt names", async () => {
    const state = await tempState();
    await mkdir(path.join(state, ASSETS, hashOf("c"), "cs"), { recursive: true });
    await writeFile(path.join(state, ASSETS, hashOf("c"), "cs", "01.png"), "png");
    await mkdir(path.join(state, ASSETS, "not-a-hash"), { recursive: true });

    const result = await pruneWebDevSignalPanels({ stateRoot: state, today: "2026-09-26" });

    expect(result).toEqual({ keepFrom: "2026-08-29", removed: [], kept: 0, unmanaged: 2 });
    expect(await exists(path.join(state, ASSETS, hashOf("c"), "cs", "01.png"))).toBe(true);
  });

  it("answers an empty result when nothing has been rendered", async () => {
    const state = await tempState();
    expect(await pruneWebDevSignalPanels({ stateRoot: state, today: "2026-09-26" })).toEqual({ keepFrom: "2026-08-29", removed: [], kept: 0, unmanaged: 0 });
  });

  it("is committed by the queue-health step as deletions only", async () => {
    const cycle = await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");
    const start = cycle.indexOf("      - name: Check both publish queues are draining\n");
    const step = cycle.slice(start, cycle.indexOf("\n      - name: ", start + 1));
    expect(step).toContain("git ls-files --deleted -z -- 'state/ventures/*/design-lab/assets/*' | xargs -0 -r git rm --cached --quiet --");
    expect(step).not.toMatch(/git add[^\n]*design-lab/u);
  });

  it("stages a pruned panel through the glob and leaves a new one out", async () => {
    const root = await tempState();
    const git = (...args: string[]) => execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
    const state = path.join(root, "state");
    await git("init", "--quiet");
    await rendered(state, "2026-08-01", "cs", hashOf("a"));
    await git("add", "--", "state");
    await git("commit", "--quiet", "-m", "panels");
    await rendered(state, "2026-09-26", "en", hashOf("b"));
    await pruneWebDevSignalPanels({ stateRoot: state, today: "2026-09-26" });

    await execFileAsync("bash", ["-c", "git ls-files --deleted -z -- 'state/ventures/*/design-lab/assets/*' | xargs -0 -r git rm --cached --quiet --"], { cwd: root });
    const { stdout } = await git("diff", "--cached", "--name-only");

    expect(stdout.trim().split("\n")).toEqual([1, 2, 3, 4].map((panel) => `state/${ASSETS}/${hashOf("a")}/cs/0${panel}.png`));
  });
});
