import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AmbientConfig } from "../src/config.js";
import { emptyLedger, type Ledger } from "../src/ledger.js";

export const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export const fixture = (name: string) => readFile(path.join(fixtures, name), "utf8");

let cached: AmbientConfig | null = null;
export async function config(): Promise<AmbientConfig> {
  cached ??= await loadConfig();
  return structuredClone(cached);
}

export const ledger = (): Ledger => emptyLedger();

/** A fetch stand-in that answers each call from a queue and records what was asked. */
export function scriptedFetch(answers: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (!next) throw new Error("no scripted answer left");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetcher, calls };
}

export const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
