import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteText } from "../state.js";
import { loadRuntimeBudgetLimits } from "../portfolio/limits.js";

export const OPERATING_TRUTH_START = "<!-- GENERATED:CURRENT-OPERATING-TRUTH:START -->";
export const OPERATING_TRUTH_END = "<!-- GENERATED:CURRENT-OPERATING-TRUTH:END -->";

interface AgentRegistry {
  agents: Array<{ id: string; provider: "Anthropic" | "OpenAI"; status: string }>;
}

interface VentureRegistry {
  ventures: Array<{
    id: string;
    name: string;
    status: string;
    visibility: "public" | "owner-only";
    meetings: Array<{ kind: string; cadence: string; envelopeUsd: number }>;
  }>;
}

interface AgentControls {
  ventures: Record<string, { disabled: string[] }>;
}

interface SocialActivation {
  updatedAt: string;
  ventures: Record<string, { status: string; counter: number; required: number }>;
}

interface KpiSnapshot {
  evaluatedAt: string;
  quarterId: string;
  complete: boolean;
  statuses: Array<{ status: "on-track" | "at-risk" | "off-track" | "unavailable"; critical: boolean; id: string }>;
}

interface MoneySnapshot {
  generatedAt: string;
  costs: {
    api: { monthlyUsd: number; cumulativeUsd: number };
    fixed: { monthlyUsd: number };
    totalMonthlyBurnUsd: number;
  };
  revenue: { recognizedUsd: number };
}

interface FeatureConfig {
  METRICS_INGESTION_ENABLED: boolean;
}

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function latestStandupTimestamp(repoRoot: string): Promise<string | null> {
  const directory = path.join(repoRoot, "state", "standups");
  const files = await readdir(directory);
  const timestamps = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
    const value = await json<{ generatedAt?: string }>(path.join(directory, file));
    return value.generatedAt ?? null;
  }));
  return timestamps.filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function latestIso(values: string[]): string {
  return values
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? "unavailable";
}

export async function buildCurrentOperatingTruth(repoRoot: string): Promise<string> {
  const [agents, ventures, controls, activation, kpis, moneyState, features, latestStandup] = await Promise.all([
    json<AgentRegistry>(path.join(repoRoot, "config", "agents.json")),
    json<VentureRegistry>(path.join(repoRoot, "config", "ventures.json")),
    json<AgentControls>(path.join(repoRoot, "config", "venture-agent-controls.json")),
    json<SocialActivation>(path.join(repoRoot, "state", "social", "activation.json")),
    json<KpiSnapshot>(path.join(repoRoot, "state", "kpis", "latest.json")),
    json<MoneySnapshot>(path.join(repoRoot, "state", "money", "public.json")),
    json<FeatureConfig>(path.join(repoRoot, "config", "features.json")),
    latestStandupTimestamp(repoRoot)
  ]);
  const limits = await loadRuntimeBudgetLimits();
  const activeAgents = agents.agents.filter((agent) => agent.status === "active");
  const providerCounts = new Map<string, number>();
  for (const agent of activeAgents) providerCounts.set(agent.provider, (providerCounts.get(agent.provider) ?? 0) + 1);
  const statusCounts = new Map<string, number>();
  for (const status of kpis.statuses) statusCounts.set(status.status, (statusCounts.get(status.status) ?? 0) + 1);
  const criticalGaps = kpis.statuses
    .filter((status) => status.critical && status.status !== "on-track")
    .map((status) => status.id);
  const refreshedAt = latestIso([activation.updatedAt, kpis.evaluatedAt, moneyState.generatedAt, latestStandup ?? ""]);
  const publicVentures = ventures.ventures.filter((venture) => venture.visibility === "public");
  const ownerOnlyVentures = ventures.ventures.filter((venture) => venture.visibility === "owner-only");
  const meetingCount = publicVentures.reduce((sum, venture) => sum + venture.meetings.length, 0);
  const dailyMeetingEnvelope = publicVentures.reduce(
    (sum, venture) => sum + venture.meetings.reduce((ventureSum, meeting) => ventureSum + meeting.envelopeUsd, 0),
    0
  );

  const lines = [
    OPERATING_TRUTH_START,
    "## Current operating truth (generated)",
    "",
    `Refreshed from committed state: **${refreshedAt}**. This block is generated deterministically; edit the source state, not these lines.`,
    "",
    "| Item | Current value |",
    "| --- | --- |",
    `| Portfolio | ${publicVentures.length} public projects; ${ownerOnlyVentures.length} owner-only ${ownerOnlyVentures.length === 1 ? "workspace" : "workspaces"} |`,
    `| Agent roster | ${activeAgents.length} active: ${providerCounts.get("Anthropic") ?? 0} Anthropic, ${providerCounts.get("OpenAI") ?? 0} OpenAI |`,
    `| Scheduled specialist/service rooms | ${meetingCount}; combined maximum room envelopes ${money(dailyMeetingEnvelope)} if every room is commissioned |`,
    // Read from the resolver rather than written here. This line was a literal carrying
    // budget-2026-08d's $50 / $42 / $2.20 for four days after budget-2026-08e superseded it at
    // $30 / $25 / $1.00 -- a generated block stating a cap the runtime had stopped enforcing,
    // which is the one thing a generated block exists to prevent.
    `| Approved spend boundary | ${money(limits.monthlyOperatingUsd)} all-in monthly; ${money(limits.monthlyApiUsd)} model/API share; ${money(limits.dailyUsd)} daily model/API pace |`,
    `| Recorded API spend | ${money(moneyState.costs.api.monthlyUsd)} this month; ${money(moneyState.costs.api.cumulativeUsd)} cumulative |`,
    `| Entered fixed costs | ${money(moneyState.costs.fixed.monthlyUsd)} monthly |`,
    `| Recognized revenue | ${money(moneyState.revenue.recognizedUsd)} |`,
    `| KPI quarter | ${kpis.quarterId}; ${kpis.complete ? "complete" : "open"}; ${statusCounts.get("on-track") ?? 0} on track, ${statusCounts.get("at-risk") ?? 0} at risk, ${statusCounts.get("off-track") ?? 0} off track, ${statusCounts.get("unavailable") ?? 0} unavailable |`,
    `| Critical KPI gaps | ${criticalGaps.length ? criticalGaps.join(", ") : "none"} |`,
    `| FightAIQ analysis | approved by D8; production still requires \`FIGHTAIQ_ANALYSIS_ENABLED=true\` plus live and evidence gates |`,
    `| Visitor/engagement measurement | ${features.METRICS_INGESTION_ENABLED ? "enabled" : "disabled (`METRICS_INGESTION_ENABLED=false`)"} |`,
    "| Global social posting | stopped while `SOCIAL_KILL_SWITCH=true`; project counters and credentials remain separate gates |",
    "",
    "### Project modes and social readiness",
    "",
    "| Project | Mode | Rooms | Disabled optional roles | Social readiness |",
    "| --- | --- | --- | --- | --- |",
    ...publicVentures.map((venture) => {
      const social = activation.ventures[venture.id];
      const socialText = social ? `${social.status} (${social.counter}/${social.required})` : "not applicable";
      const disabled = controls.ventures[venture.id]?.disabled.join(", ") || "none";
      const rooms = venture.meetings.length
        ? venture.meetings.map((meeting) => `${meeting.kind} ${meeting.cadence.replace("daily@", "")}`).join("; ")
        : "deterministic service only";
      return `| ${venture.name} | ${venture.status} | ${rooms} | ${disabled} | ${socialText} |`;
    }),
    "",
    OPERATING_TRUTH_END
  ];
  return `${lines.join("\n")}\n`;
}

export function replaceCurrentOperatingTruth(document: string, generated: string): string {
  const start = document.indexOf(OPERATING_TRUTH_START);
  const end = document.indexOf(OPERATING_TRUTH_END);
  if (start < 0 || end < start) throw new Error("docs/ECOSYSTEM.md is missing the generated operating-truth markers");
  const after = end + OPERATING_TRUTH_END.length;
  return `${document.slice(0, start)}${generated.trimEnd()}${document.slice(after)}`;
}

export async function refreshEcosystemOperatingTruth(input: {
  repoRoot: string;
  check?: boolean;
}): Promise<{ changed: boolean; path: "docs/ECOSYSTEM.md" }> {
  const relative = "docs/ECOSYSTEM.md" as const;
  const current = await readFile(path.join(input.repoRoot, relative), "utf8");
  const next = replaceCurrentOperatingTruth(current, await buildCurrentOperatingTruth(input.repoRoot));
  const changed = current !== next;
  if (input.check && changed) throw new Error(`${relative} operating truth is stale; run pnpm docs:refresh`);
  if (changed) await atomicWriteText(input.repoRoot, relative, next);
  return { changed, path: relative };
}
