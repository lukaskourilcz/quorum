import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The same shim every server-only module is tested through: `server-only` throws on import
// outside a React server bundle, and vitest is neither.
vi.mock("server-only", () => ({}));
const { addCarouselInspiration } = await import("./carousel-studio-admin-store");

async function emptyStore(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "carousel-inspiration-"));
  await mkdir(path.join(root, "state", "ventures", "carousel-studio", "inspiration"), {
    recursive: true
  });
  await writeFile(
    path.join(root, "state", "ventures", "carousel-studio", "inspiration", "owner-links.json"),
    JSON.stringify({ schemaVersion: "carousel-inspiration-links/1", links: [], updatedAt: "2026-08-06T00:00:00.000Z" }),
    "utf8"
  );
  return root;
}

/**
 * A board is not a design and a homepage is not a post.
 *
 * This rule used to be enforced twice: here, and again in the studio room that read the saved
 * links before a meeting. That room no longer exists -- the venture holds no meeting and its
 * engine renders deterministically at $0 -- so this store is the only place a link can arrive,
 * and the only place the rule has left to live.
 */
describe("the inspiration store refuses a board or a bare homepage", () => {
  it("takes one individual HTTPS article", async () => {
    const root = await emptyStore();

    const links = await addCarouselInspiration(
      { url: "https://example.com/an-article#section", label: "A layout worth reading", now: new Date("2026-08-06T09:00:00.000Z") },
      root
    );

    // The fragment is dropped: two links to the same page under different anchors are one link.
    expect(links.map((link) => link.url)).toEqual(["https://example.com/an-article"]);
    expect(await readFile(
      path.join(root, "state", "ventures", "carousel-studio", "inspiration", "owner-links.json"),
      "utf8"
    )).toContain("an-article");
  });

  it.each([
    ["a Pinterest board", "https://www.pinterest.com/someone/a-board/"],
    ["a shortened pin", "https://pin.it/abcdef"],
    ["a bare homepage", "https://godly.website/"],
    ["plain http", "http://example.com/an-article"],
    ["not a URL at all", "an-article"]
  ])("refuses %s", async (_name, url) => {
    const root = await emptyStore();

    await expect(addCarouselInspiration({ url, label: "Refused" }, root)).rejects.toThrow();
  });
});
