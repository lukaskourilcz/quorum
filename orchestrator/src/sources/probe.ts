import { safeFetch } from "../security/url.js";
import type { SourceConfig } from "./types.js";

export interface SourceProbe {
  sourceId: string;
  ok: boolean;
  status: "healthy" | "disabled" | "failed";
  finalUrl: string | null;
  contentType: string | null;
  bytes: number;
  checkedAt: string;
  error: string | null;
}

export async function probeSource(
  source: SourceConfig,
  allowHosts: readonly string[],
  now = new Date()
): Promise<SourceProbe> {
  if (!source.enabled) {
    return {
      sourceId: source.id,
      ok: false,
      status: "disabled",
      finalUrl: null,
      contentType: null,
      bytes: 0,
      checkedAt: now.toISOString(),
      error: null
    };
  }
  try {
    const response = await safeFetch(source.url, {
      allowHosts,
      maxBytes: 1_000_000
    });
    return {
      sourceId: source.id,
      ok: true,
      status: "healthy",
      finalUrl: response.url,
      contentType: response.contentType,
      bytes: response.body.byteLength,
      checkedAt: now.toISOString(),
      error: null
    };
  } catch (error) {
    return {
      sourceId: source.id,
      ok: false,
      status: "failed",
      finalUrl: null,
      contentType: null,
      bytes: 0,
      checkedAt: now.toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
