import sharp from "sharp";
import type { AmbientConfig, Aspect } from "./config.js";
import { boundedFetch, parseJson, type Fetcher } from "./http.js";
import { hamming } from "./phash.js";

/**
 * Automatic gates. The owner decided there is no human approval step, so these are the only
 * thing between a render and an Instagram account, and every one of them fails closed: a model
 * that times out, answers malformed JSON or is missing its key rejects the frame. A gate that can
 * be skipped by breaking it is not a gate.
 *
 * Order is cheapest first: format and duplicate cost nothing, the renderer's own NSFW flag
 * costs nothing, the moderation endpoint is free, and the vision check is the one paid call.
 */

export function formatGate(bytes: Uint8Array, meta: { width?: number; height?: number; format?: string }, aspect: Aspect, config: AmbientConfig): string[] {
  const reasons: string[] = [];
  const { width, height } = config.sizes[aspect];
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || meta.format !== "jpeg") reasons.push("format:not-jpeg");
  if (bytes.byteLength > config.gate.maxBytes) reasons.push("format:too-large");
  if (meta.width !== width || meta.height !== height) reasons.push(`format:size-${meta.width ?? 0}x${meta.height ?? 0}`);
  return reasons;
}

export async function readFormat(bytes: Uint8Array) {
  try {
    const meta = await sharp(bytes).metadata();
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch {
    return {};
  }
}

export function duplicateGate(hash: string, history: readonly string[], maxDistance: number): string | null {
  for (const previous of history) {
    const distance = hamming(hash, previous);
    if (distance <= maxDistance) return `duplicate:phash-distance-${distance}`;
  }
  return null;
}

export interface VisionVerdict {
  people: boolean;
  faces: boolean;
  body_parts: boolean;
  text_or_logos: boolean;
  nsfw: boolean;
  matches_brief: boolean;
}

/** The verdict fields that each reject a frame on their own when true. */
const REJECTING: Array<keyof VisionVerdict> = ["people", "faces", "body_parts", "text_or_logos", "nsfw"];

export function verdictReasons(verdict: VisionVerdict): string[] {
  const reasons = REJECTING.filter((field) => verdict[field]).map((field) => `vision:${field}`);
  if (!verdict.matches_brief) reasons.push("vision:off-brief");
  return reasons;
}

export function parseVerdict(raw: unknown): VisionVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const fields: Array<keyof VisionVerdict> = [...REJECTING, "matches_brief"];
  if (!fields.every((field) => typeof value[field] === "boolean")) return null;
  return Object.fromEntries(fields.map((field) => [field, value[field]])) as unknown as VisionVerdict;
}

export interface GateModels {
  /** Free moderation endpoint. Returns rejection reasons, empty when clean. */
  moderate(jpeg: Uint8Array): Promise<string[]>;
  /** The paid look. Returns rejection reasons, empty when clean. */
  inspect(jpeg: Uint8Array, brief: string): Promise<string[]>;
}

const VISION_INSTRUCTIONS = [
  "You are a strict photo editor checking a photo for an Instagram account that must never show a person.",
  "Answer only with the JSON object the schema describes.",
  "people: true if any person, figure, silhouette, reflection of a person or crowd appears anywhere, however small or blurred.",
  "faces: true if any human or human-like face appears, including on posters, screens, statues or packaging.",
  "body_parts: true if any hand, finger, arm, leg, foot or other body part appears.",
  "text_or_logos: true if any readable or pseudo text, letters, numbers, signage, brand mark, logo or watermark appears.",
  "nsfw: true if anything sexual, nude or suggestive appears.",
  "matches_brief: true if the photo plausibly shows the brief and looks like a natural photograph, not an illustration or a render with obvious artefacts."
].join(" ");

export function openaiGates(config: AmbientConfig, key: string | undefined, fetcher?: Fetcher): GateModels {
  const host = "api.openai.com";
  const dataUrl = (jpeg: Uint8Array) => `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
  return {
    async moderate(jpeg) {
      if (!key) return ["gate:moderation-unavailable"];
      try {
        const response = await boundedFetch(`https://${host}/v1/moderations`, {
          allowHosts: [host],
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: config.gate.moderationModel, input: [{ type: "image_url", image_url: { url: dataUrl(jpeg) } }] }),
          maxBytes: 200_000,
          timeoutMs: 60_000,
          fetcher
        });
        const payload = parseJson(response.body) as {
          results?: Array<{ flagged?: unknown; category_scores?: Record<string, unknown> }>;
        };
        const result = payload.results?.[0];
        if (!result || typeof result.flagged !== "boolean") return ["gate:moderation-malformed"];
        const reasons: string[] = [];
        if (result.flagged) reasons.push("moderation:flagged");
        const sexual = result.category_scores?.sexual;
        if (typeof sexual === "number" && sexual > config.gate.moderationSexualMax) reasons.push("moderation:sexual");
        return reasons;
      } catch {
        return ["gate:moderation-unavailable"];
      }
    },
    async inspect(jpeg, brief) {
      if (!key) return ["gate:vision-unavailable"];
      try {
        const response = await boundedFetch(`https://${host}/v1/chat/completions`, {
          allowHosts: [host],
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.gate.visionModel,
            temperature: 0,
            max_tokens: 200,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "ambient_verdict",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: [...REJECTING, "matches_brief"],
                  properties: Object.fromEntries([...REJECTING, "matches_brief"].map((field) => [field, { type: "boolean" }]))
                }
              }
            },
            messages: [
              { role: "system", content: VISION_INSTRUCTIONS },
              {
                role: "user",
                content: [
                  { type: "text", text: `Brief: ${brief}` },
                  { type: "image_url", image_url: { url: dataUrl(jpeg), detail: "high" } }
                ]
              }
            ]
          }),
          maxBytes: 200_000,
          timeoutMs: 90_000,
          fetcher
        });
        const payload = parseJson(response.body) as { choices?: Array<{ message?: { content?: unknown } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string") return ["gate:vision-malformed"];
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          return ["gate:vision-malformed"];
        }
        const verdict = parseVerdict(parsed);
        return verdict ? verdictReasons(verdict) : ["gate:vision-malformed"];
      } catch {
        return ["gate:vision-unavailable"];
      }
    }
  };
}
