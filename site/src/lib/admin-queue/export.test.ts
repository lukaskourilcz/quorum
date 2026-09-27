import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQueueExport } from "./export";
import { queueFixtureRoot, readQueueFixture, writeJson } from "./fixture-root";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const decoder = new TextDecoder();
const roots: string[] = [];
let root = "";

beforeEach(async () => {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  root = await queueFixtureRoot();
  roots.push(root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function unzip(itemId: string): Promise<Record<string, Uint8Array>> {
  const exported = await buildQueueExport(itemId, root);
  expect(exported).not.toBeNull();
  expect(exported!.fileName).toBe(`${itemId}.zip`);
  return unzipSync(exported!.bytes);
}

describe("buildQueueExport", () => {
  it("zips the committed frames, the caption, the alt text and a manifest that records nothing as posted", async () => {
    await mkdir(path.join(root, "site/public/social/devshark/2026-09-26/en"), { recursive: true });
    await writeFile(path.join(root, "site/public/social/devshark/2026-09-26/en/slide-01.png"), PNG);
    const files = await unzip("ms-2026-09-26-devshark-en-linkedin");
    const fixture = await readQueueFixture() as { content: { text: string; altText: string; contentHash: string } };
    expect(Object.keys(files).sort()).toEqual(["alt-text.txt", "caption.txt", "frame-01.png", "manifest.json"]);
    expect(Buffer.from(files["frame-01.png"]!)).toEqual(PNG);
    expect(decoder.decode(files["caption.txt"])).toBe(`${fixture.content.text}\n`);
    const manifest = JSON.parse(decoder.decode(files["manifest.json"])) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: "queue-export/1",
      itemId: "ms-2026-09-26-devshark-en-linkedin",
      venture: "marketingshark",
      platform: "linkedin",
      contentHash: fixture.content.contentHash,
      framesExpected: 5
    });
    expect(manifest.note).toMatch(/records nothing/u);
    expect((manifest.files as Array<{ name: string }>).map((file) => file.name)).toContain("frame-01.png");
  });

  it("is byte-for-byte the same on a second export", async () => {
    const first = await buildQueueExport("ms-2026-09-26-devshark-en-linkedin", root);
    const second = await buildQueueExport("ms-2026-09-26-devshark-en-linkedin", root);
    expect(Buffer.from(first!.bytes)).toEqual(Buffer.from(second!.bytes));
  });

  it("adds the first reply a code-question package carries", async () => {
    await writeJson(root, "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json", {
      schemaVersion: "marketingshark-qotd/1",
      firstReply: { text: "Answer: B. devshark.app" }
    });
    const files = await unzip("ms-2026-09-26-devshark-en-linkedin");
    expect(decoder.decode(files["first-reply.txt"])).toBe("Answer: B. devshark.app\n");
  });

  it("adds a DNESKAi pack's story card, its link and the Threads question, and skips what is missing", async () => {
    const item = await readQueueFixture("caught-up-queue-threads.valid.json");
    await writeJson(root, "state/social/queue/2026-08-04-cs-threads.json", item);
    await writeJson(root, "state/social/packs/2026-08-04.json", {
      schemaVersion: "social-pack/1",
      story: { frame: "/social/2026-08-04/story.png", link: "https://dneskai.cz/?utm_source=instagram&utm_medium=story&utm_campaign=practical", linkLine: "Odkaz v příběhu", source: "practical" },
      threadsQuestion: { text: "Co z toho zůstává otevřené?" }
    });
    let files = await unzip("caught-up-2026-08-04-cs-threads");
    expect(files["story.png"]).toBeUndefined();
    expect(decoder.decode(files["story-link.txt"])).toContain("utm_medium=story");
    expect(decoder.decode(files["threads-question.txt"])).toBe("Co z toho zůstává otevřené?\n");
    expect(Object.keys(files).some((name) => name.startsWith("frame-"))).toBe(false);

    await mkdir(path.join(root, "site/public/social/2026-08-04"), { recursive: true });
    await writeFile(path.join(root, "site/public/social/2026-08-04/story.png"), PNG);
    files = await unzip("caught-up-2026-08-04-cs-threads");
    expect(Buffer.from(files["story.png"]!)).toEqual(PNG);
  });

  it("adds a recipe package's Threads text and ignores a package that does not parse", async () => {
    const item = await readQueueFixture("caught-up-queue-threads.valid.json");
    await writeJson(root, "state/social/queue/2026-08-04-cs-threads.json", item);
    await writeJson(root, "state/social/packs/2026-08-04.json", { schemaVersion: "dneskai-recipe/1", threads: { text: "Tři nástroje týdne." } });
    expect(decoder.decode((await unzip("caught-up-2026-08-04-cs-threads"))["threads.txt"])).toBe("Tři nástroje týdne.\n");
    await writeFile(path.join(root, "state/social/packs/2026-08-04.json"), "not json");
    expect(Object.keys(await unzip("caught-up-2026-08-04-cs-threads")).sort()).toEqual(["alt-text.txt", "caption.txt", "manifest.json"]);
  });

  it("adds a no-edition recipe's story card and its link", async () => {
    const item = await readQueueFixture("caught-up-queue-threads.valid.json");
    await writeJson(root, "state/social/queue/2026-08-04-cs-threads.json", item);
    await writeJson(root, "state/social/packs/2026-08-04.json", {
      schemaVersion: "dneskai-recipe/1",
      threads: { text: "Pojem dne." },
      story: { frame: { path: "/social/caught-up/2026-08-04/no-edition/story.png", sha256: "0".repeat(64) }, link: "https://dneskai.cz/?utm_source=instagram&utm_medium=story&utm_campaign=no-edition" }
    });
    await mkdir(path.join(root, "site/public/social/caught-up/2026-08-04/no-edition"), { recursive: true });
    await writeFile(path.join(root, "site/public/social/caught-up/2026-08-04/no-edition/story.png"), PNG);
    const files = await unzip("caught-up-2026-08-04-cs-threads");
    expect(Buffer.from(files["story.png"]!)).toEqual(PNG);
    expect(decoder.decode(files["story-link.txt"])).toContain("utm_campaign=no-edition");
  });

  it("answers null for an item that does not exist", async () => {
    expect(await buildQueueExport("ms-2026-01-01-devshark-en-threads", root)).toBeNull();
  });
});
