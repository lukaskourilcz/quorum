import { describe, expect, it } from "vitest";
import { renderChain } from "../src/providers.js";
import { stockSeed } from "../src/stock.js";
import { gradient } from "../src/mock.js";
import { config, json, scriptedFetch } from "./helpers.js";

const image = async () => new Response(new Uint8Array(await gradient(1080, 1350, 5)), { status: 200, headers: { "content-type": "image/jpeg" } });

describe("the render chain", () => {
  it("orders fal, OpenAI, Gemini and leaves out any provider without its key", async () => {
    const loaded = await config();
    expect(renderChain(loaded, {}).map((r) => r.name)).toEqual([]);
    expect(renderChain(loaded, { FAL_KEY: "f", OPENAI_API_KEY: "o" }).map((r) => r.name)).toEqual(["fal", "openai"]);
    expect(renderChain(loaded, { FAL_KEY: "f", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" }).map((r) => r.name)).toEqual(["fal", "openai", "gemini"]);
  });

  it("asks fal for the exact native size and downloads only from fal's own output hosts", async () => {
    const loaded = await config();
    const { fetcher, calls } = scriptedFetch([
      json({ images: [{ url: "https://v3.fal.media/files/x.jpg" }], seed: 77, has_nsfw_concepts: [false] }),
      await image()
    ]);
    const [fal] = renderChain(loaded, { FAL_KEY: "secret-fal" }, fetcher);
    const render = await fal!.render({ prompt: "p", negative: "n", aspect: "4:5", seed: 77 });
    expect(calls[0]!.url).toBe(`https://fal.run/${loaded.providers.fal.model}`);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Key secret-fal");
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({ image_size: { width: 1080, height: 1350 }, seed: 77, enable_safety_checker: true });
    expect(render).toMatchObject({ provider: "fal", seed: 77, flaggedNsfw: false, sourceRef: null });

    const hostile = scriptedFetch([json({ images: [{ url: "https://evil.example/x.jpg" }] })]);
    const [falHostile] = renderChain(loaded, { FAL_KEY: "k" }, hostile.fetcher);
    await expect(falHostile!.render({ prompt: "p", negative: "n", aspect: "4:5", seed: 1 })).rejects.toThrow(/allowlist/u);
  });

  it("switches fal to image-to-image for a stock seed and passes the renderer's NSFW flag on", async () => {
    const loaded = await config();
    const { fetcher, calls } = scriptedFetch([json({ images: [{ url: "https://fal.media/y.jpg" }], has_nsfw_concepts: [true] }), await image()]);
    const [fal] = renderChain(loaded, { FAL_KEY: "k" }, fetcher);
    const render = await fal!.render({ prompt: "p", negative: "n", aspect: "9:16", seed: 3, stockSeed: { bytes: new Uint8Array([1]), strength: 0.86, ref: "pexels:1" } });
    expect(calls[0]!.url).toBe(`https://fal.run/${loaded.providers.fal.img2imgModel}`);
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({ strength: 0.86, image_url: expect.stringMatching(/^data:image\/jpeg;base64,/u) });
    expect(render).toMatchObject({ flaggedNsfw: true, sourceRef: "pexels:1" });
  });

  it("asks Gemini for the aspect natively and reads the inline image", async () => {
    const loaded = await config();
    const data = (await gradient(1080, 1920, 2)).toString("base64");
    const { fetcher, calls } = scriptedFetch([json({ candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { data } }] } }] })]);
    const gemini = renderChain(loaded, { GEMINI_API_KEY: "g" }, fetcher)[0]!;
    const render = await gemini.render({ prompt: "p", negative: "n", aspect: "9:16", seed: 1 });
    expect(JSON.parse(String(calls[0]!.init?.body)).generationConfig.imageConfig.aspectRatio).toBe("9:16");
    expect((calls[0]!.init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("g");
    expect(render.provider).toBe("gemini");
  });
});

describe("stock seeds", () => {
  it("skip stock photos described with a person and restyle the rest to the native size", async () => {
    const loaded = await config();
    const shot = loaded.personas.nina.shots.find((s) => s.stockSeed?.source === "pexels")!;
    const { fetcher, calls } = scriptedFetch([
      json({
        photos: [
          { id: 1, alt: "Woman walking on the bridge", src: { large2x: "https://images.pexels.com/1.jpg" } },
          { id: 2, alt: "River at dusk with bridge lights", src: { large2x: "https://images.pexels.com/2.jpg" } }
        ]
      }),
      await image()
    ]);
    const seed = await stockSeed({ shot, aspect: "4:5", date: "2026-11-08", config: loaded, env: { PEXELS_API_KEY: "p" }, fetcher });
    expect(seed?.ref).toBe("pexels:2");
    expect(calls[1]!.url).toBe("https://images.pexels.com/2.jpg");
    expect(seed?.strength).toBeGreaterThanOrEqual(0.75);
  });

  it("returns nothing without a key or without a usable candidate", async () => {
    const loaded = await config();
    const shot = loaded.personas.nina.shots.find((s) => s.stockSeed?.source === "pexels")!;
    expect(await stockSeed({ shot, aspect: "4:5", date: "2026-11-08", config: loaded, env: {} })).toBeNull();
    const crowd = scriptedFetch([json({ photos: [{ id: 3, alt: "People on a bridge", src: { large2x: "https://images.pexels.com/3.jpg" } }] })]);
    expect(await stockSeed({ shot, aspect: "4:5", date: "2026-11-08", config: loaded, env: { PEXELS_API_KEY: "p" }, fetcher: crowd.fetcher })).toBeNull();
  });
});
