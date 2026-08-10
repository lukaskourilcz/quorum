import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

import { DoctrineRejectError, rejectOnDoctrine } from "./titty-tuesdays-doctrine";
import { readTittyTuesdaysProposals } from "./titty-tuesdays-proposals";

const DATE = "2026-08-10";
const NOW = new Date("2026-08-10T18:00:00.000Z");

const proposal = {
  schemaVersion: "design-proposal/1",
  ventureId: "titty-tuesdays",
  date: DATE,
  promptTemplateVersion: "tt-garment-prompt/1",
  concept: {
    conceptId: "dc-ember",
    title: "Ember wash",
    colorway: "washed ember on bone",
    palette: ["ember"],
    sceneTexture: "matte paper",
    axis: "flat-lay"
  },
  variants: [
    {
      variantId: "dc-ember-openai",
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Product photography of a single garment. TITTY TUESDAYS.",
      altText: "AI-generated product render.",
      imagePath: `ventures/titty-tuesdays/design-proposals/media/${DATE}/dc-ember-openai.webp`,
      contentHash: `sha256:${"a".repeat(64)}`,
      bytes: 2048,
      usd: 0.053,
      createdAt: "2026-08-10T11:00:00.000Z",
      status: "proposed",
      rejectedAt: null,
      reason: null
    },
    {
      // An image path the media route would refuse. It must not become an <img> src.
      variantId: "dc-ember-fal",
      provider: "fal",
      model: "fal-ai/flux/schnell",
      prompt: "Product photography of a single garment. TITTY TUESDAYS.",
      altText: "AI-generated product render.",
      imagePath: "../../../etc/passwd",
      contentHash: `sha256:${"b".repeat(64)}`,
      bytes: 2048,
      usd: 0.004,
      createdAt: "2026-08-10T11:00:20.000Z",
      status: "proposed",
      rejectedAt: null,
      reason: null
    }
  ],
  failures: [],
  generatedAt: "2026-08-10T11:00:30.000Z"
};

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-tt-proposals-"));
  const write = async (relative: string, body: string) => {
    const absolute = path.join(directory, "state", relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, body);
  };
  await write(`ventures/titty-tuesdays/design-proposals/${DATE}.json`, JSON.stringify(proposal));
  await write(`ventures/titty-tuesdays/design-proposals/media/${DATE}/dc-ember-openai.webp`, "pretend-bytes");
  await write("ratings/titty-tuesdays/ledger.jsonl", `${JSON.stringify({
    schemaVersion: "rating/1",
    id: "r-2026-08-10-abcd",
    ventureId: "titty-tuesdays",
    objectKind: "visual",
    objectRef: { id: `${DATE}/dc-ember-openai`, contentHash: "sha256:abcdef123456" },
    rating: "perfect",
    ratedAt: "2026-08-10T12:00:00.000Z"
  })}\n`);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", directory);
  return directory;
}

describe("the proposals gallery's data", () => {
  it("carries the prompt, the hash and the owner's rating", async () => {
    await root();
    const snapshot = await readTittyTuesdaysProposals();
    const [day] = snapshot.days;

    expect(day?.conceptTitle).toBe("Ember wash");
    const openai = day?.variants.find((variant) => variant.provider === "openai");
    expect(openai?.prompt).toContain("TITTY TUESDAYS");
    expect(openai?.imageHref).toContain("/admin/api/titty-tuesdays/media?path=");
    // The rating the owner already gave, keyed the way the widget writes it.
    expect(openai?.ratings.map((rating) => rating.rating)).toEqual(["perfect"]);
  });

  it("refuses an image path the media route would not serve", async () => {
    await root();
    const snapshot = await readTittyTuesdaysProposals();
    const fal = snapshot.days[0]?.variants.find((variant) => variant.provider === "fal");
    expect(fal?.imageHref).toBeNull();
  });

  it("counts an unreadable day rather than losing the panel", async () => {
    const directory = await root();
    await writeFile(
      path.join(directory, "state", "ventures", "titty-tuesdays", "design-proposals", "2026-08-09.json"),
      "{ not json"
    );
    const snapshot = await readTittyTuesdaysProposals();
    expect(snapshot.unreadable).toEqual(["2026-08-09.json"]);
    expect(snapshot.days).toHaveLength(1);
  });

  it("says nothing has been proposed rather than showing an empty grid", async () => {
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", await mkdtemp(path.join(os.tmpdir(), "boardless-tt-empty-")));
    expect(await readTittyTuesdaysProposals()).toEqual({ days: [], unreadable: [] });
  });
});

describe("rejecting on doctrine", () => {
  it("deletes the bytes and keeps the hash, the prompt and the reason", async () => {
    const directory = await root();
    const result = await rejectOnDoctrine({
      date: DATE,
      variantId: "dc-ember-openai",
      reason: "A torso appeared behind the garment.",
      now: NOW
    });
    expect(result).toEqual({ variantId: "dc-ember-openai", bytesRemoved: true });

    const media = path.join(
      directory, "state", "ventures", "titty-tuesdays", "design-proposals", "media", DATE, "dc-ember-openai.webp"
    );
    await expect(readFile(media)).rejects.toThrow();

    const record = JSON.parse(await readFile(
      path.join(directory, "state", "ventures", "titty-tuesdays", "design-proposals", `${DATE}.json`), "utf8"
    )) as typeof proposal;
    const variant = record.variants.find((entry) => entry.variantId === "dc-ember-openai")!;
    expect(variant.status).toBe("doctrine-rejected");
    expect(variant.imagePath).toBeNull();
    expect(variant.reason).toBe("A torso appeared behind the garment.");
    expect(variant.rejectedAt).toBe(NOW.toISOString());
    // The evidence stays: the hash and the prompt are what make the rejection reviewable.
    expect(variant.contentHash).toBe(`sha256:${"a".repeat(64)}`);
    expect(variant.prompt).toContain("TITTY TUESDAYS");
  });

  it("shows the tombstone through the loader afterwards", async () => {
    await root();
    await rejectOnDoctrine({ date: DATE, variantId: "dc-ember-openai", reason: "A torso.", now: NOW });
    const snapshot = await readTittyTuesdaysProposals();
    const openai = snapshot.days[0]?.variants.find((variant) => variant.provider === "openai");
    expect(openai?.status).toBe("doctrine-rejected");
    expect(openai?.imageHref).toBeNull();
    expect(openai?.reason).toBe("A torso.");
  });

  it("refuses a rejection with no reason, and a path that is not a proposal", async () => {
    await root();
    await expect(rejectOnDoctrine({ date: DATE, variantId: "dc-ember-openai", reason: "   ", now: NOW }))
      .rejects.toThrow(DoctrineRejectError);
    await expect(rejectOnDoctrine({ date: "../../etc", variantId: "x", reason: "no", now: NOW }))
      .rejects.toThrow(DoctrineRejectError);
    await expect(rejectOnDoctrine({ date: DATE, variantId: "not-a-variant", reason: "no", now: NOW }))
      .rejects.toThrow(DoctrineRejectError);
  });
});
