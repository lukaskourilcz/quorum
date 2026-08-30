import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readNewestGoViralBrief } from "./admin-goviral-brief";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  roots.length = 0;
});

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "goviral-brief-"));
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  return root;
}

async function plan(root: string, name: string, body: unknown): Promise<void> {
  const directory = path.join(root, "state", "ventures", "goviral", "plans");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), JSON.stringify(body), "utf8");
}

describe("the newest GoVIRAL brief", () => {
  it("has nothing to show while the room has never produced one", async () => {
    await repository();

    expect(await readNewestGoViralBrief()).toBeNull();
  });

  it("takes the newest approved plan and reads its date from the filename", async () => {
    const root = await repository();
    await plan(root, "2026-08-17-weekly.json", { status: "approved", title: "Older", tactics: [] });
    await plan(root, "2026-08-24-weekly.json", {
      status: "approved",
      title: "Weekly content brief — 2026-08-24",
      tactics: [{ description: "Trend call: one." }]
    });

    const brief = await readNewestGoViralBrief();

    expect(brief?.date).toBe("2026-08-24");
    expect(brief?.title).toBe("Weekly content brief — 2026-08-24");
    expect(brief?.tactics).toEqual([{ description: "Trend call: one." }]);
  });

  it("walks past a draft and past a plan it cannot read", async () => {
    const root = await repository();
    await plan(root, "2026-08-17-weekly.json", { status: "approved", title: "Approved", tactics: [] });
    await plan(root, "2026-08-24-weekly.json", { status: "draft", title: "Not approved", tactics: [] });
    await writeFile(
      path.join(root, "state", "ventures", "goviral", "plans", "2026-08-25-weekly.json"),
      "{ not json",
      "utf8"
    );

    // One malformed plan costs one plan, and a draft is not a brief.
    expect((await readNewestGoViralBrief())?.title).toBe("Approved");
  });
});
