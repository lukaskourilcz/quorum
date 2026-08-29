import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { readVentureIndex } from "./venture-index";

async function put(root: string, relative: string, body = "{}\n"): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

describe("the public venture index", () => {
  it("returns one real card per registered venture and names absent state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "venture-index-empty-"));
    const cards = await readVentureIndex(root);

    // Paused ventures leave the public index with the wall, so the expectation follows the
    // registry rather than pinning a count that changes with the owner's Settings switches.
    expect(cards.map((card) => card.id)).toEqual(ventureRegistry.ventures
      .filter((venture) => venture.visibility === "public" && venture.status !== "paused")
      .map((venture) => venture.id));
    expect(cards.map((card) => card.id)).not.toContain("personal-growth");
    expect(cards.every((card) => card.status === "Operating")).toBe(true);
    expect(cards.every((card) => card.promise.length > 0 && card.boundary.length > 0)).toBe(true);
    expect(cards.every((card) => card.metric.count === null)).toBe(true);
    expect(cards.every((card) => !("score" in card))).toBe(true);
  });

  it("counts only the recorded artifacts owned by each metric", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "venture-index-state-"));
    await put(root, "state/ventures/door-money/recommendations/one.json");
    await put(root, "state/ventures/door-money/recommendations/two.json");
    await put(root, "state/ventures/door-money/recommendations/readme.txt", "not a record\n");
    await mkdir(path.join(root, "state/ventures/tehdejsi-svet/drafts"), { recursive: true });
    await put(root, "state/ventures/carousel-studio/summaries/door-money/one.json");
    await put(root, "state/ideas/goviral/ledger.jsonl", `${JSON.stringify({ schemaVersion: "synthetic/1" })}\n`);

    const cards = await readVentureIndex(root);
    // Door Money is paused in the committed registry, so its card is absent and its stored
    // records stay untouched on disk; the other metrics still count only what they own.
    expect(cards.find((card) => card.id === "door-money")).toBeUndefined();
    expect(cards.find((card) => card.id === "tehdejsi-svet")?.metric.count).toBe(0);
    expect(cards.find((card) => card.id === "carousel-studio")?.metric.count).toBe(1);
    expect(cards.find((card) => card.id === "goviral")?.metric.count).toBe(1);
  });

  it("refuses to present a partial count when a ledger line is unreadable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "venture-index-poison-"));
    await put(root, "state/ideas/goviral/ledger.jsonl", "{}\nnot-json\n");
    const cards = await readVentureIndex(root);
    expect(cards.find((card) => card.id === "goviral")?.metric.count).toBeNull();
  });
});
