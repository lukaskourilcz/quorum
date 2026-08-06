import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { deliveredArticlePackage, deliveredEditionPackage } = await import("./delivered-packages");

const originalRoot = process.env.BOARDLESSAI_REPO_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.BOARDLESSAI_REPO_ROOT;
  else process.env.BOARDLESSAI_REPO_ROOT = originalRoot;
});

async function root(): Promise<string> {
  const created = await mkdtemp(path.join(os.tmpdir(), "delivered-"));
  process.env.BOARDLESSAI_REPO_ROOT = created;
  return created;
}

async function write(base: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(base, "state", relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value), "utf8");
}

describe("the package a day delivered", () => {
  it("returns the archived edition package and where to read it", async () => {
    const base = await root();
    await write(base, "edition/deliveries/2026-08-06.json", {
      status: "delivered",
      packageHash: "abc123",
      articleUrl: "https://caughtup-ai.vercel.app/articles/tri-laboratore"
    });
    await write(base, "edition/archive/2026-08-06-abc123.json", { status: "edition", date: "2026-08-06" });

    const delivered = await deliveredEditionPackage("2026-08-06");

    expect(delivered?.articleUrl).toBe("https://caughtup-ai.vercel.app/articles/tri-laboratore");
    expect(delivered?.json).toContain("\"date\": \"2026-08-06\"");
    expect(delivered?.note).toBeUndefined();
  });

  it("falls back to the receipt for editions delivered before packages were kept", async () => {
    const base = await root();
    await write(base, "edition/deliveries/2026-08-03.json", { status: "delivered", packageHash: "old" });

    const delivered = await deliveredEditionPackage("2026-08-03");

    expect(delivered?.json).toContain("\"packageHash\": \"old\"");
    expect(delivered?.note).toContain("deleted on delivery");
  });

  it("says nothing at all on a day that delivered nothing", async () => {
    const base = await root();
    await write(base, "edition/deliveries/2026-08-02.json", { status: "superseded", packageHash: "stale" });

    expect(await deliveredEditionPackage("2026-08-02")).toBeNull();
    expect(await deliveredEditionPackage("2026-08-09")).toBeNull();
  });

  it("joins an article to the receipt that delivered it", async () => {
    const base = await root();
    await write(base, "ventures/mma-files/articles/2026-08-04-am-oktagon-lopez.json", {
      slug: "oktagon-lopez",
      packageHash: "deadbeef",
      status: "delivered"
    });
    await write(base, "ventures/mma-files/deliveries/articles/deadbeef.json", {
      status: "delivered",
      articleUrl: "https://mma-files.vercel.app/cs/articles/oktagon-lopez"
    });

    const delivered = await deliveredArticlePackage("2026-08-04");

    expect(delivered?.json).toContain("\"slug\": \"oktagon-lopez\"");
    expect(delivered?.articleUrl).toBe("https://mma-files.vercel.app/cs/articles/oktagon-lopez");
  });

  it("shows nothing for an article that never delivered", async () => {
    const base = await root();
    await write(base, "ventures/mma-files/articles/2026-08-04-am-oktagon-lopez.json", {
      slug: "oktagon-lopez",
      packageHash: "deadbeef"
    });
    await write(base, "ventures/mma-files/deliveries/articles/deadbeef.json", { status: "needs_reconciliation" });

    expect(await deliveredArticlePackage("2026-08-04")).toBeNull();
  });
});
