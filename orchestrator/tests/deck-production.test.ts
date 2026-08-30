import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import { deckAlreadyProduced, produceDeck } from "../src/social/deck-production.js";

async function root(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "deck-production-"));
}

function summaryFor() {
  return buildCarouselSummary({
    venture: "kvorum",
    slug: "public-media",
    date: "2026-08-12",
    title: "Sněmovna projednává financování veřejnoprávních médií",
    dek: "Předloha mění výpočet poplatku a přesouvá jeho výběr na stát.",
    points: [
      "Výbor doporučil pozměňovací návrh, který mění výpočet poplatku.",
      "Ministerstvo financí odhaduje dopad na rozpočet v řádu miliard.",
      "Sněmovna o návrhu hlasuje ve druhém čtení příští týden."
    ],
    sources: [{ kind: "source", label: "Poslanecká sněmovna" }],
    hasHero: false,
    heroCredit: null
  });
}

/**
 * A deck nothing wrote down could not be hashed, queued or reviewed away from the browser, and the
 * status field Kvórum's approval sets had no consumer at all. This is that consumer, and the first
 * thing it does is ask whether it is allowed to run.
 */
describe("producing a deck from a recorded summary", () => {
  it("renders the frames, records the design and leaves one draft for the owner", async () => {
    const stateRoot = await root();

    const result = await produceDeck({ root: stateRoot, summary: summaryFor(), now: new Date("2026-08-12T10:00:00.000Z") });

    expect(result.produced).toBe(true);
    if (!result.produced) return;
    expect(result.slideCount).toBeGreaterThanOrEqual(4);
    expect(result.artifactRefs).toHaveLength(result.slideCount);

    // Real PNG bytes, not a promise of them.
    for (const ref of result.artifactRefs) {
      const bytes = await readFile(path.join(stateRoot, ref));
      expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    }

    const receipt = JSON.parse(await readFile(path.join(stateRoot, result.receiptRef), "utf8")) as {
      hashes: string[];
      recipe: unknown;
      slideCount: number;
    };
    expect(receipt.hashes).toHaveLength(result.slideCount);
    expect(receipt.recipe).toBeTruthy();

    const item = JSON.parse(await readFile(path.join(stateRoot, result.queueRef), "utf8")) as {
      status: string;
      approvals: { owner: string; posting: string };
      content: { assetPaths: string[]; contentHash: string };
    };
    expect(item.status).toBe("draft");
    expect(item.approvals).toEqual({ owner: "pending", posting: "manual-only" });
    expect(item.content.assetPaths).toEqual(result.artifactRefs);
  });

  it("writes nothing into the publisher's queue", async () => {
    const stateRoot = await root();

    await produceDeck({ root: stateRoot, summary: summaryFor() });

    // The drafts-only ventures have no connection binding and must never acquire one by a render.
    await expect(readdir(path.join(stateRoot, "social", "queue"))).rejects.toThrow();
  });

  it("is idempotent: the same deck twice is one record with one hash", async () => {
    const stateRoot = await root();
    const summary = summaryFor();

    const first = await produceDeck({ root: stateRoot, summary, now: new Date("2026-08-12T10:00:00.000Z") });
    expect(await deckAlreadyProduced(stateRoot, summary)).toBe(true);
    const second = await produceDeck({ root: stateRoot, summary, now: new Date("2026-08-13T11:00:00.000Z") });

    expect(first.produced && second.produced).toBe(true);
    if (!first.produced || !second.produced) return;
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.queueRef).toBe(first.queueRef);
    const files = await readdir(path.join(stateRoot, "ventures/carousel-studio/deck-queue/kvorum"));
    expect(files).toHaveLength(1);
  });

  it("refuses a venture with no registered render edge, and writes nothing", async () => {
    const stateRoot = await root();
    // `door-money` holds a registered edge; `personal-growth` has never had one and must not
    // acquire one by being asked politely.
    const summary = { ...summaryFor(), venture: "personal-growth" as never };

    const result = await produceDeck({ root: stateRoot, summary });

    expect(result.produced).toBe(false);
    if (result.produced) return;
    expect(result.reason).toContain("personal-growth");
    await expect(readdir(path.join(stateRoot, "ventures"))).rejects.toThrow();
  });
});
