import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { SocialAssetRetentionSchema } from "../src/contracts/social-assets.js";
import { sha256 } from "../src/hashing.js";
import { repoRoot } from "../src/paths.js";
import { SOCIAL_ASSET_RETENTION_DAYS, pruneSocialAssets, retentionKeepFrom } from "../src/social/media/retention.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-asset-retention-"));
  roots.push(root);
  return root;
}

async function put(root: string, relative: string, contents: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), contents);
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

describe("social frames leave the tree after ninety days", () => {
  it("keeps ninety days, counting from the day the step runs", () => {
    expect(SOCIAL_ASSET_RETENTION_DAYS).toBe(90);
    expect(retentionKeepFrom("2026-09-25", 90)).toBe("2026-06-27");
    expect(retentionKeepFrom("2026-12-26", 90)).toBe("2026-09-27");
  });

  it("removes only dated frames before the window, hashes each one first, and names what it will not touch", async () => {
    const root = await tempRoot();
    const stateRoot = path.join(root, "state");
    const old = {
      "site/public/social/devshark/2026-06-01/en/slide-01.png": "devshark june",
      "site/public/social/2026-06-26/cs/instagram/frame-01.png": "dneskai june",
      "site/public/social/mma-files/2026-05-02/slug-A-cs-instagram-01.png": "mma may"
    };
    const kept = {
      "site/public/social/2026-06-27/cs/instagram/frame-01.png": "the first day kept",
      "site/public/social/devshark/2026-09-25/en/slide-01.jpg": "today"
    };
    for (const [relative, contents] of Object.entries({ ...old, ...kept })) await put(root, relative, contents);
    await put(root, "site/public/social/README.md", "not a frame");

    const { record, artifacts } = await pruneSocialAssets({ repoRoot: root, stateRoot, today: "2026-09-25" });

    expect(artifacts).toEqual(["social/asset-retention/2026-09-25.json"]);
    expect(record).toMatchObject({ keepFrom: "2026-06-27", retentionDays: 90, keptCount: 2, unmanagedPaths: ["site/public/social/README.md"], unmanagedCount: 1 });
    expect(record.removed.map(({ path: removed, sha256: hash }) => [removed, hash]).sort()).toEqual(
      Object.entries(old).map(([relative, contents]) => [relative, sha256(contents)]).sort()
    );
    for (const relative of Object.keys(old)) expect(await exists(path.join(root, relative))).toBe(false);
    for (const relative of Object.keys(kept)) expect(await exists(path.join(root, relative))).toBe(true);
    expect(await exists(path.join(root, "site/public/social/devshark/2026-06-01"))).toBe(false);
    expect(await exists(path.join(root, "site/public/social/mma-files"))).toBe(false);
    expect(await exists(path.join(root, "site/public/social"))).toBe(true);
    expect(SocialAssetRetentionSchema.parse(JSON.parse(await readFile(path.join(stateRoot, artifacts[0]!), "utf8")))).toEqual(record);
  });

  it("adds a second run's removals to the day's record instead of replacing it, and writes nothing when nothing goes", async () => {
    const root = await tempRoot();
    const stateRoot = path.join(root, "state");
    await put(root, "site/public/social/devshark/2026-06-01/en/slide-01.png", "first");
    await pruneSocialAssets({ repoRoot: root, stateRoot, today: "2026-09-25" });
    await put(root, "site/public/social/devshark/2026-06-02/en/slide-01.png", "second");
    const second = await pruneSocialAssets({ repoRoot: root, stateRoot, today: "2026-09-25" });
    const quiet = await pruneSocialAssets({ repoRoot: root, stateRoot, today: "2026-09-26" });

    expect(second.record.removed.map(({ path: removed }) => removed)).toEqual([
      "site/public/social/devshark/2026-06-01/en/slide-01.png",
      "site/public/social/devshark/2026-06-02/en/slide-01.png"
    ]);
    expect(quiet).toMatchObject({ artifacts: [], record: { removed: [] } });
    expect(await exists(path.join(stateRoot, "social/asset-retention/2026-09-26.json"))).toBe(false);
  });

  it("answers an empty record when the directory does not exist", async () => {
    const root = await tempRoot();
    const { record, artifacts } = await pruneSocialAssets({ repoRoot: root, stateRoot: path.join(root, "state"), today: "2026-09-25" });
    expect(artifacts).toEqual([]);
    expect(record).toMatchObject({ removed: [], keptCount: 0, unmanagedCount: 0 });
  });
});

describe("the queue-health step commits the prune and nothing else under site/public/social", () => {
  function queueHealthStep(cycle: string): string {
    const start = cycle.indexOf("      - name: Check both publish queues are draining\n");
    expect(start).toBeGreaterThan(-1);
    return cycle.slice(start, cycle.indexOf("\n      - name: ", start + 1));
  }

  it("stages the retention record and the deletions only", async () => {
    const step = queueHealthStep(await readFile(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8"));
    expect(step).toContain("pnpm queue:health");
    expect(step).toMatch(/for queue_path in [^\n]*state\/social\/asset-retention/u);
    expect(step).toContain("git ls-files --deleted -z -- site/public/social | xargs -0 -r git rm --cached --quiet --");
    expect(step).not.toMatch(/git add[^\n]*site\/public\/social/u);
  });

  it("leaves a frame a failed cycle wrote out of the commit", async () => {
    const root = await tempRoot();
    const git = (...args: string[]) => execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
    await git("init", "--quiet");
    await put(root, "site/public/social/devshark/2026-06-01/en/slide-01.png", "old");
    await put(root, "site/public/social/devshark/2026-09-24/en/slide-01.png", "kept");
    await git("add", "--", "site");
    await git("commit", "--quiet", "-m", "frames");
    await put(root, "site/public/social/devshark/2026-09-25/en/slide-01.png", "written by a cycle that failed its gate");
    await put(root, "site/public/social/devshark/2026-09-24/en/slide-01.png", "rewritten by that cycle");
    await pruneSocialAssets({ repoRoot: root, stateRoot: path.join(root, "state"), today: "2026-09-25" });

    await execFileAsync("bash", ["-c", "git ls-files --deleted -z -- site/public/social | xargs -0 -r git rm --cached --quiet --"], { cwd: root });
    const { stdout } = await git("diff", "--cached", "--name-status");

    expect(stdout.trim()).toBe("D\tsite/public/social/devshark/2026-06-01/en/slide-01.png");
  });
});
