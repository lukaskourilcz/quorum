import { createHash } from "node:crypto";
import type { AmbientConfig, Aspect } from "./config.js";
import { falFrameUsd } from "./config.js";
import { boundedFetch, HttpFailure, parseJson, type Fetcher } from "./http.js";

export type ProviderName = "fal" | "openai" | "gemini";

export interface RenderRequest {
  prompt: string;
  negative: string;
  aspect: Aspect;
  seed: number;
  /** A stock photo used only as an image-to-image seed, never posted as it is. */
  stockSeed?: { bytes: Uint8Array; strength: number; ref: string };
}

export interface Render {
  bytes: Uint8Array;
  provider: ProviderName;
  model: string;
  seed: number | null;
  /** The renderer's own safety flag. A true here rejects the frame before any paid gate. */
  flaggedNsfw: boolean;
  sourceRef: string | null;
}

export interface Renderer {
  name: ProviderName;
  model: string;
  estimateUsd(aspect: Aspect): number;
  render(request: RenderRequest): Promise<Render>;
}

export interface ProviderEnv {
  FAL_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

const MAX_JSON = 30_000_000;
const MAX_IMAGE = 15_000_000;

function falRenderer(config: AmbientConfig, key: string, fetcher?: Fetcher): Renderer {
  const fal = config.providers.fal;
  return {
    name: "fal",
    model: fal.model,
    estimateUsd: (aspect) => falFrameUsd(config, aspect),
    async render(request) {
      const size = config.sizes[request.aspect];
      const model = request.stockSeed ? fal.img2imgModel : fal.model;
      const body: Record<string, unknown> = {
        // FLUX has no negative prompt input; the positive prompt already says what to leave out.
        prompt: request.prompt,
        image_size: { width: size.width, height: size.height },
        num_inference_steps: fal.steps,
        seed: request.seed,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "jpeg"
      };
      if (request.stockSeed) {
        body.image_url = `data:image/jpeg;base64,${Buffer.from(request.stockSeed.bytes).toString("base64")}`;
        body.strength = request.stockSeed.strength;
      }
      const response = await boundedFetch(`https://${fal.host}/${model}`, {
        allowHosts: [fal.host],
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        maxBytes: 200_000,
        timeoutMs: 120_000,
        fetcher
      });
      const payload = parseJson(response.body) as {
        images?: Array<{ url?: unknown }>;
        seed?: unknown;
        has_nsfw_concepts?: unknown[];
      };
      const url = typeof payload.images?.[0]?.url === "string" ? payload.images[0].url : "";
      if (!url) throw new HttpFailure("fal returned no image", response.status);
      const image = await boundedFetch(url, { allowHosts: fal.outputHosts, maxBytes: MAX_IMAGE, timeoutMs: 60_000, fetcher });
      if (!image.contentType.startsWith("image/")) throw new HttpFailure("fal output is not an image", image.status);
      return {
        bytes: image.body,
        provider: "fal",
        model,
        seed: typeof payload.seed === "number" ? payload.seed : request.seed,
        flaggedNsfw: payload.has_nsfw_concepts?.[0] === true,
        sourceRef: request.stockSeed?.ref ?? null
      };
    }
  };
}

/**
 * OpenAI renders portrait only at 1024x1536 (2:3). That is a 17% crop to 4:5 and 16% to 9:16,
 * inside the grading pass's ceiling; for a frame with nobody in it a centre crop costs nothing
 * but a margin. It is the fallback, not the default, for exactly that reason.
 */
function openaiRenderer(config: AmbientConfig, key: string, fetcher?: Fetcher): Renderer {
  const openai = config.providers.openai;
  return {
    name: "openai",
    model: openai.model,
    estimateUsd: () => openai.usdPerImage,
    async render(request) {
      const response = await boundedFetch(`https://${openai.host}/v1/images/generations`, {
        allowHosts: [openai.host],
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: openai.model,
          prompt: `${request.prompt} Avoid: ${request.negative}.`,
          size: "1024x1536",
          quality: openai.quality,
          n: 1,
          output_format: "jpeg"
        }),
        maxBytes: MAX_JSON,
        timeoutMs: 180_000,
        fetcher
      });
      const payload = parseJson(response.body) as { data?: Array<{ b64_json?: unknown }> };
      const b64 = payload.data?.[0]?.b64_json;
      if (typeof b64 !== "string" || !b64) throw new HttpFailure("OpenAI returned no image", response.status);
      return { bytes: Buffer.from(b64, "base64"), provider: "openai", model: openai.model, seed: null, flaggedNsfw: false, sourceRef: null };
    }
  };
}

function geminiRenderer(config: AmbientConfig, key: string, fetcher?: Fetcher): Renderer {
  const gemini = config.providers.gemini;
  return {
    name: "gemini",
    model: gemini.model,
    estimateUsd: () => gemini.usdPerImage,
    async render(request) {
      const response = await boundedFetch(
        `https://${gemini.host}/v1beta/models/${gemini.model}:generateContent`,
        {
          allowHosts: [gemini.host],
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${request.prompt} Avoid: ${request.negative}.` }] }],
            generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: request.aspect } }
          }),
          maxBytes: MAX_JSON,
          timeoutMs: 180_000,
          fetcher
        }
      );
      const payload = parseJson(response.body) as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: unknown } }> } }>;
      };
      const data = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.inlineData?.data === "string")?.inlineData?.data;
      if (typeof data !== "string") throw new HttpFailure("Gemini returned no image", response.status);
      return { bytes: Buffer.from(data, "base64"), provider: "gemini", model: gemini.model, seed: null, flaggedNsfw: false, sourceRef: null };
    }
  };
}

/**
 * The fallback chain, in order: fal, then OpenAI, then Gemini. A provider without its key is
 * left out rather than failed, so a missing GEMINI_API_KEY is the normal case and costs nothing.
 */
export function renderChain(config: AmbientConfig, env: ProviderEnv, fetcher?: Fetcher): Renderer[] {
  const chain: Renderer[] = [];
  if (env.FAL_KEY) chain.push(falRenderer(config, env.FAL_KEY, fetcher));
  if (env.OPENAI_API_KEY) chain.push(openaiRenderer(config, env.OPENAI_API_KEY, fetcher));
  if (env.GEMINI_API_KEY) chain.push(geminiRenderer(config, env.GEMINI_API_KEY, fetcher));
  return chain;
}

/** Deterministic per frame and attempt, so a rerun asks for the same picture. */
export function frameSeed(...parts: Array<string | number>): number {
  return createHash("sha256").update(parts.join(":")).digest().readUInt32BE(0) % 2_147_483_647;
}
