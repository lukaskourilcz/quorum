import { createHash } from "node:crypto";
import type { Aspect, PersonaKey } from "./config.js";
import { boundedFetch, checkUrl, HttpFailure, parseJson, type Fetcher } from "./http.js";

/**
 * The upload to HeyDarlink's `POST /api/photo-library/ambient`.
 *
 * Authentication is `Authorization: Bearer <HEYDARLINK_INGEST_TOKEN>`, compared in constant time
 * on the server against its `AMBIENT_INGEST_TOKEN`. The body is multipart: the JPEG as `file`
 * plus one text field per metadata value, and `sha256` of the exact file bytes, which the server
 * recomputes so a body altered in transit is refused rather than stored under a wrong hash.
 */
export interface IngestMetadata {
  persona_key: PersonaKey;
  aspect: Aspect;
  pillar: string;
  shot_id: string;
  prompt: string;
  provider: string;
  model: string;
  cost_usd: number;
  seed: number | null;
  phash: string;
  source_ref: string | null;
}

export const INGEST_FIELDS = [
  "persona_key",
  "aspect",
  "pillar",
  "shot_id",
  "prompt",
  "provider",
  "model",
  "cost_usd",
  "seed",
  "phash",
  "sha256",
  "source_ref",
  "file"
] as const;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function ingestRequest(input: { url: string; token: string; jpeg: Uint8Array; meta: IngestMetadata }): { url: string; init: RequestInit } {
  const form = new FormData();
  const meta = input.meta;
  form.set("persona_key", meta.persona_key);
  form.set("aspect", meta.aspect);
  form.set("pillar", meta.pillar);
  form.set("shot_id", meta.shot_id);
  form.set("prompt", meta.prompt);
  form.set("provider", meta.provider);
  form.set("model", meta.model);
  form.set("cost_usd", meta.cost_usd.toFixed(6));
  if (meta.seed !== null) form.set("seed", String(meta.seed));
  form.set("phash", meta.phash);
  form.set("sha256", sha256Hex(input.jpeg));
  if (meta.source_ref) form.set("source_ref", meta.source_ref);
  const name = `${meta.shot_id}-${meta.aspect.replace(":", "x")}.jpg`;
  form.set("file", new Blob([Buffer.from(input.jpeg)], { type: "image/jpeg" }), name);
  return {
    url: input.url,
    init: { method: "POST", headers: { Authorization: `Bearer ${input.token}` }, body: form }
  };
}

export type IngestResult =
  | { kind: "stored"; id: string }
  | { kind: "duplicate"; id: string | null; code: string }
  | { kind: "failed"; status: number; code: string };

/**
 * 200 stored, 409 a duplicate the server already holds (exact sha256 or a near phash), anything
 * else a failure. 429 and 5xx are retried with backoff; 4xx other than 409 and 429 is a bug in
 * this client or a wrong token, and retrying it would only repeat it.
 */
export async function uploadFrame(input: {
  url: string;
  token: string;
  jpeg: Uint8Array;
  meta: IngestMetadata;
  fetcher?: Fetcher;
  allowInsecureLoopback?: boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<IngestResult> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let target: URL;
  try {
    target = checkUrl(input.url, [hostOf(input.url)], input.allowInsecureLoopback);
  } catch {
    // HTTPS only: the token must never travel in clear text, so a wrong URL sends nothing.
    return { kind: "failed", status: 0, code: "INVALID_URL" };
  }
  let last: IngestResult = { kind: "failed", status: 0, code: "NOT_ATTEMPTED" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { init } = ingestRequest(input);
    try {
      const response = await boundedFetch(target.toString(), {
        ...init,
        allowHosts: [target.hostname],
        maxBytes: 100_000,
        timeoutMs: 60_000,
        acceptAnyStatus: true,
        allowInsecureLoopback: input.allowInsecureLoopback,
        fetcher: input.fetcher
      });
      const payload = (safeJson(response.body) ?? {}) as { id?: unknown; code?: unknown };
      const code = typeof payload.code === "string" ? payload.code : `HTTP_${response.status}`;
      if (response.status === 200 && typeof payload.id === "string") return { kind: "stored", id: payload.id };
      if (response.status === 409) return { kind: "duplicate", id: typeof payload.id === "string" ? payload.id : null, code };
      last = { kind: "failed", status: response.status, code };
      if (response.status !== 429 && response.status < 500) return last;
    } catch (error) {
      last = { kind: "failed", status: error instanceof HttpFailure ? error.status : 0, code: "NETWORK" };
    }
    await sleep(2_000 * 4 ** attempt);
  }
  return last;
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

function safeJson(body: Uint8Array): unknown {
  try {
    return parseJson(body);
  } catch {
    return null;
  }
}
