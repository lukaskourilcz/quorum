import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import editionFixture from "../../contracts/fixtures/edition-package.valid.json" with { type: "json" };
import { PROMOTION_SLIDE_COUNT } from "@boardlessai/carousel-studio";
import { EditionPackageSchema, type EditionPackage } from "../src/contracts/edition-package.js";
import { configRoot } from "../src/paths.js";
import {
  buildEditionPromotion,
  promotionAlreadyComposed,
  promotionRecordPath,
  storeEditionPromotion
} from "../src/social/edition-promotion.js";
import {
  UNCONFIGURED_PROMOTION,
  loadPromotionConfig,
  resolveCta,
  resolvePromotionChannel,
  type PromotionChannel
} from "../src/social/promotion-config.js";

/** Rasterising five 4:5 frames on a loaded runner is slow; the composition tests are not. */
const RENDER_TIMEOUT_MS = 90_000;

const EDITION_URL = "https://caught-up.example/articles/2026-08-04-measured-model-price-cut";

const HELD_CHANNEL: PromotionChannel = {
  id: "linkedin",
  status: "held",
  reason: 'No channel "linkedin" is registered in config/channels.json.'
};

async function root(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "caught-up-promotion-"));
}

/**
 * The shared fixture carries no Briefs, so the happy path supplies them.
 *
 * Reparsed through the schema rather than cast: a fixture that stopped being a valid package
 * should fail here and not three assertions later.
 */
function editionWithBriefs(overrides: Record<string, unknown> = {}): EditionPackage {
  const base = editionFixture as unknown as Record<string, unknown>;
  const article = base.article as { cs: { frontmatter: Record<string, unknown>; body: string } };
  return EditionPackageSchema.parse({
    ...base,
    article: {
      ...(base.article as object),
      cs: {
        ...article.cs,
        frontmatter: {
          ...article.cs.frontmatter,
          dispatches: [
            { title: "Cloudflare: crawleři AI musí být zodpovědní", body: "Registr crawlerů se rozšiřuje." },
            { title: "TypeSafe AI: model, který hraje Doom", body: "Demo běží v prohlížeči." },
            { title: "Llama.cpp vydal build b10991", body: "Nová kvantizace zrychluje inferenci." }
          ],
          ...overrides
        }
      }
    }
  });
}

describe("the DNESKAi repost is composed and held", () => {
  it("records five slides, the editor's coverage and one call to action", () => {
    const record = buildEditionPromotion({
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      config: UNCONFIGURED_PROMOTION,
      channel: HELD_CHANNEL,
      now: new Date("2026-08-04T06:00:00.000Z")
    });

    expect(record).not.toBeNull();
    expect(record!.status).toBe("held");
    expect(record!.slides).toHaveLength(PROMOTION_SLIDE_COUNT);
    expect(record!.slides.map((slide) => slide.kind)).toEqual(["cover", "hook", "body", "body", "outro"]);
    // Two Briefs on the fourth slide, and the record says the edition had three.
    expect(record!.coverage!.briefs).toMatchObject({ carried: 2, available: 3 });
    expect(record!.slides[3]!.text).toContain("Cloudflare");
    expect(record!.slides[3]!.text).toContain("TypeSafe");
    expect(record!.slides[3]!.text).not.toContain("Llama.cpp");
  });

  it("says nothing posts, in the two fields that would have to change for anything to", () => {
    const record = buildEditionPromotion({
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      config: UNCONFIGURED_PROMOTION,
      channel: HELD_CHANNEL,
      now: new Date("2026-08-04T06:00:00.000Z")
    });

    expect(record!.approvals).toEqual({ owner: "pending", posting: "manual-only" });
    expect(record!.channel.status).toBe("held");
    expect(record!.reason).toContain("linkedin");
    expect(record!.render.status).toBe("not-rendered");
  });

  it("captions with the desk's own copy, the licence credit and the one destination", () => {
    const record = buildEditionPromotion({
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      config: UNCONFIGURED_PROMOTION,
      channel: HELD_CHANNEL,
      now: new Date("2026-08-04T06:00:00.000Z")
    });

    expect(record!.caption).toContain("Zveřejněná cena se změnila");
    // Code appends the credit; a carousel reaching a feed without it is a licence breach.
    expect(record!.caption).toContain("Artwork by BoardlessAI FRAME");
    expect(record!.caption).toContain(EDITION_URL);
    expect(record!.caption).toContain("#dneskai");
    // Alt text describes every frame, which is what an image post owes a reader who cannot see it.
    expect(record!.altText).toContain("Slide 5:");
  });

  it("is deterministic on the edition it was built from", () => {
    const inputs = {
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      config: UNCONFIGURED_PROMOTION,
      channel: HELD_CHANNEL
    };
    const first = buildEditionPromotion({ ...inputs, now: new Date("2026-08-04T06:00:00.000Z") });
    const second = buildEditionPromotion({ ...inputs, now: new Date("2026-08-09T23:00:00.000Z") });

    expect(second!.contentHash).toBe(first!.contentHash);
  });
});

describe("the call to action is honest about what it points at", () => {
  it("points at the edition while DNESKAi has no subscribe surface", () => {
    const cta = resolveCta(UNCONFIGURED_PROMOTION, EDITION_URL);

    expect(cta.origin).toBe("edition");
    expect(cta.destination).toBe(EDITION_URL);
    expect(cta.slideText).toBe("Nové vydání každý den · caught-up.example");
  });

  it("asks for the subscription the moment one URL is configured", () => {
    const cta = resolveCta(
      { ...UNCONFIGURED_PROMOTION, cta: { line: "Odebírejte denní přehled", subscribeUrl: "https://caught-up.example/odber" } },
      EDITION_URL
    );

    expect(cta.origin).toBe("subscribe");
    expect(cta.destination).toBe("https://caught-up.example/odber");
    expect(cta.slideText).toBe("Odebírejte denní přehled · caught-up.example");
  });

  it("falls back to the edition when the configured subscribe URL is not a safe HTTPS URL", () => {
    const cta = resolveCta(
      { ...UNCONFIGURED_PROMOTION, cta: { line: null, subscribeUrl: "http://localhost/odber" } },
      EDITION_URL
    );

    expect(cta.origin).toBe("edition");
    expect(cta.destination).toBe(EDITION_URL);
  });
});

describe("a repost that cannot be built honestly is refused, and says so", () => {
  it("refuses an edition with no Briefs rather than inventing a fourth slide", () => {
    const record = buildEditionPromotion({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      editionUrl: EDITION_URL,
      config: UNCONFIGURED_PROMOTION,
      channel: HELD_CHANNEL,
      now: new Date("2026-08-04T06:00:00.000Z")
    });

    expect(record!.status).toBe("refused");
    expect(record!.reason).toContain("no Briefs");
    expect(record!.slides).toEqual([]);
    expect(record!.caption).toBeNull();
  });

  it("composes nothing at all for a day that published no edition", async () => {
    const stateRoot = await root();
    const noEdition = EditionPackageSchema.parse({
      schemaVersion: "edition-package/1",
      status: "no_edition",
      date: "2026-08-05",
      idempotencyKey: "a".repeat(64),
      generation: { models: { writer: "fixture" } },
      reason: "no_story",
      board: {
        meetingRef: "meetings/2026-08-05/cu-edition.json",
        roomUrl: "https://boardless-ai.example/meetings/2026-08-05",
        noEditionReason: "No story cleared the desk."
      }
    });

    const stored = await storeEditionPromotion({
      stateRoot,
      configRoot,
      editionPackage: noEdition,
      editionUrl: EDITION_URL
    });

    expect(stored).toBeNull();
  });
});

describe("the channel is read from the registry, never claimed", () => {
  it("holds LinkedIn because the repository registers no such channel", async () => {
    const channel = await resolvePromotionChannel(configRoot, "linkedin");

    expect(channel.status).toBe("held");
    expect(channel.reason).toContain("config/channels.json");
    expect(channel.reason).toContain("CAUGHT-UP-LINKEDIN-CHANNEL");
  });

  it("holds the two registered channels too, because both are still draft-only", async () => {
    for (const id of ["instagram", "threads"]) {
      const channel = await resolvePromotionChannel(configRoot, id);
      expect(channel.status).toBe("held");
      expect(channel.reason).toContain("draft-only");
    }
  });

  it("holds when the registry cannot be read at all", async () => {
    const channel = await resolvePromotionChannel(await root(), "linkedin");

    expect(channel).toMatchObject({ status: "held", reason: "The channel registry could not be read." });
  });
});

describe("the promotion config", () => {
  it("ships unconfigured, with no subscribe surface and no CTA line", async () => {
    const config = await loadPromotionConfig(configRoot);

    expect(config.cta).toEqual({ line: null, subscribeUrl: null });
    expect(config.channelId).toBe("linkedin");
  });

  it("reads a malformed file as unconfigured rather than as a different call to action", async () => {
    const temporary = await root();
    await writeFile(path.join(temporary, "caught-up-promotion.json"), '{"schemaVersion":"caught-up-promotion/9"}');

    expect(await loadPromotionConfig(temporary)).toEqual(UNCONFIGURED_PROMOTION);
    expect(await loadPromotionConfig(path.join(temporary, "absent"))).toEqual(UNCONFIGURED_PROMOTION);
  });
});

describe("writing the record", () => {
  it("writes one record and nothing into the publisher's queue", async () => {
    const stateRoot = await root();

    const stored = await storeEditionPromotion({
      stateRoot,
      configRoot,
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      now: new Date("2026-08-04T06:00:00.000Z")
    });

    expect(stored!.path).toBe(promotionRecordPath("2026-08-04", "2026-08-04-measured-model-price-cut"));
    const written = JSON.parse(await readFile(path.join(stateRoot, stored!.path), "utf8")) as { status: string; recipe: unknown };
    expect(written.status).toBe("held");
    // The design the edition would render with, recorded beside the words it would render.
    expect(written.recipe).toBeTruthy();
    expect(await promotionAlreadyComposed(stateRoot, "2026-08-04", "2026-08-04-measured-model-price-cut")).toBe(true);

    // The triple-lock is untouched: this path has no connection binding and must never acquire one.
    await expect(readdir(path.join(stateRoot, "social", "queue"))).rejects.toThrow();
  });

  it("writes no frames unless the render is asked for", async () => {
    const stateRoot = await root();

    const stored = await storeEditionPromotion({
      stateRoot,
      configRoot,
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL
    });

    expect(stored!.record.render).toMatchObject({ status: "not-rendered", assetPaths: [], canvas: null });
    await expect(readdir(path.join(stateRoot, "ventures", "carousel-studio", "decks"))).rejects.toThrow();
  });

  it("renders without being asked once the channel it names is actually open", async () => {
    const stateRoot = await root();
    const openConfigRoot = await root();
    await writeFile(
      path.join(openConfigRoot, "caught-up-promotion.json"),
      JSON.stringify({ schemaVersion: "caught-up-promotion/1", channelId: "instagram", cta: { line: null, subscribeUrl: null } })
    );
    await writeFile(path.join(openConfigRoot, "channels.json"), JSON.stringify({
      channels: [{ id: "instagram", mode: "autopublish", enabledByHumanAt: "2026-09-16T08:00:00.000Z" }]
    }));
    // The real capability map, because the render must still ask the same edge and fail closed.
    await writeFile(
      path.join(openConfigRoot, "venture-capabilities.json"),
      await readFile(path.join(configRoot, "venture-capabilities.json"), "utf8")
    );

    const stored = await storeEditionPromotion({
      stateRoot,
      configRoot: openConfigRoot,
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL
    });

    expect(stored!.record.channel.status).toBe("open");
    expect(stored!.record.render.status).toBe("rendered");
    // Open channel or not, this path still writes no queue item and still posts nothing.
    expect(stored!.record.approvals).toEqual({ owner: "pending", posting: "manual-only" });
    await expect(readdir(path.join(stateRoot, "social", "queue"))).rejects.toThrow();
  }, RENDER_TIMEOUT_MS);

  it("renders five 4:5 frames when it is", async () => {
    const stateRoot = await root();

    const stored = await storeEditionPromotion({
      stateRoot,
      configRoot,
      editionPackage: editionWithBriefs(),
      editionUrl: EDITION_URL,
      render: true
    });

    const render = stored!.record.render;
    expect(render.status).toBe("rendered");
    expect(render.canvas).toEqual({ width: 1_080, height: 1_350 });
    expect(render.assetPaths).toHaveLength(PROMOTION_SLIDE_COUNT);
    expect(render.frameHashes).toHaveLength(PROMOTION_SLIDE_COUNT);
    for (const asset of render.assetPaths) {
      const bytes = await readFile(path.join(stateRoot, asset));
      expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
  }, RENDER_TIMEOUT_MS);
});
