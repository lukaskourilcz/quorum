import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import { fetchJson } from "../sources/adapters/util.js";
import type { SourceFetchContext } from "../sources/types.js";
import { safeFetch, type SafeFetchOptions } from "../security/url.js";

const MmaSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tier: z.enum(["A", "B", "C", "D"]),
  host: z.string().min(1),
  coverage: z.array(z.string().min(1)).min(1),
  access: z.enum(["api", "html", "rss", "dataset"]),
  state: z.enum(["wired", "proposed", "disabled", "blocked"]),
  credentialEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/).optional(),
  freeLimit: z.string().min(1),
  termsVerdict: z.enum(["allowed-with-account", "allowed", "unclear", "forbidden"]),
  termsNote: z.string().min(1),
  evidenceUrl: z.string().url()
});

const MmaSourceRegistrySchema = z.object({
  schemaVersion: z.literal("mma-sources/1"),
  verifiedAt: z.iso.date(),
  sources: z.array(MmaSourceSchema).min(1)
}).superRefine((registry, context) => {
  for (const source of registry.sources) {
    if (source.state === "wired" && source.termsVerdict !== "allowed-with-account" && source.termsVerdict !== "allowed") {
      context.addIssue({ code: "custom", message: "Wired sources require an allowed terms verdict", path: ["sources", source.id] });
    }
    if (source.state === "blocked" && source.termsVerdict !== "forbidden") {
      context.addIssue({ code: "custom", message: "Blocked sources require a forbidden verdict", path: ["sources", source.id] });
    }
  }
});

export type MmaSourceRegistry = z.infer<typeof MmaSourceRegistrySchema>;

export async function loadMmaSourceRegistry(filePath = path.join(configRoot, "mma-sources.json")): Promise<MmaSourceRegistry> {
  return MmaSourceRegistrySchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export interface ApiBoutOdds {
  id: string;
  commenceTime: string;
  red: string;
  blue: string;
  bookmakers: Array<{ name: string; redDecimal: number; blueDecimal: number }>;
}

interface OddsApiEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{ title?: string; markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number }> }> }>;
}

export function projectOddsApiEvents(value: unknown): ApiBoutOdds[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const event = item as OddsApiEvent;
    if (!event.id || !event.commence_time || !event.home_team || !event.away_team) return [];
    const bookmakers = (event.bookmakers ?? []).flatMap((bookmaker) => {
      const outcomes = bookmaker.markets?.find((market) => market.key === "h2h")?.outcomes ?? [];
      const red = outcomes.find((outcome) => outcome.name === event.home_team)?.price;
      const blue = outcomes.find((outcome) => outcome.name === event.away_team)?.price;
      if (!bookmaker.title || !red || !blue || red <= 1 || blue <= 1) return [];
      return [{ name: bookmaker.title, redDecimal: red, blueDecimal: blue }];
    });
    return [{ id: event.id, commenceTime: new Date(event.commence_time).toISOString(), red: event.home_team, blue: event.away_team, bookmakers }];
  });
}

export interface OddsApiMmaResult {
  events: ApiBoutOdds[];
  remainingCredits: number | null;
  usedCredits: number | null;
  lastRequestCredits: number | null;
  exhausted: boolean;
}

function quotaInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function fetchOddsApiMma(input: {
  apiKey: string;
  context: SourceFetchContext;
  remainingCredits?: number | null;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<OddsApiMmaResult> {
  if (!input.apiKey.trim() || input.remainingCredits === 0) {
    return { events: [], remainingCredits: input.remainingCredits ?? null, usedCredits: null, lastRequestCredits: null, exhausted: input.remainingCredits === 0 };
  }
  const endpoint = new URL("https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds");
  endpoint.searchParams.set("regions", "eu");
  endpoint.searchParams.set("markets", "h2h");
  endpoint.searchParams.set("oddsFormat", "decimal");
  endpoint.searchParams.set("apiKey", input.apiKey);
  const response = await safeFetch(endpoint.toString(), {
    allowHosts: input.context.allowHosts,
    fetchImpl: input.fetchImpl,
    resolveImpl: input.resolveImpl,
    responseHeaderNames: ["x-requests-remaining", "x-requests-used", "x-requests-last"]
  });
  const remainingCredits = quotaInteger(response.headers["x-requests-remaining"]);
  return {
    events: projectOddsApiEvents(JSON.parse(new TextDecoder().decode(response.body)) as unknown),
    remainingCredits,
    usedCredits: quotaInteger(response.headers["x-requests-used"]),
    lastRequestCredits: quotaInteger(response.headers["x-requests-last"]),
    exhausted: remainingCredits === 0
  };
}

export interface CitoFighterSummary {
  id: string;
  name: string;
  record: string | null;
}

export function projectCitoFighters(value: unknown): CitoFighterSummary[] {
  const rows = Array.isArray(value) ? value : z.object({ data: z.array(z.unknown()) }).safeParse(value).data?.data ?? [];
  return rows.flatMap((row) => {
    const parsed = z.object({ id: z.union([z.string(), z.number()]), name: z.string().trim().min(1), record: z.string().trim().optional() }).safeParse(row);
    return parsed.success ? [{ id: String(parsed.data.id), name: parsed.data.name, record: parsed.data.record ?? null }] : [];
  });
}

export async function fetchCitoFighters(input: { apiKey: string; context: SourceFetchContext }): Promise<CitoFighterSummary[]> {
  if (!input.apiKey.trim()) return [];
  const value = await fetchJson<unknown>("https://api.citoapi.com/api/v1/ufc/fighters", input.context, { headers: { "x-api-key": input.apiKey } });
  return projectCitoFighters(value);
}
