import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot } from "../../paths.js";

/**
 * Whether Contest Radar is safe to run, checked against the files rather than a checklist.
 *
 * The program's invariants are the checks. Most of them are about what the venture must be unable
 * to do, and those are the ones worth automating: a capability nobody granted is easy to add by
 * accident and hard to notice afterwards.
 *
 * The two that matter most, because nothing else in this repository would fail if they broke:
 *
 * - **No source module contains a way to act on a contest.** Not a form post, not a submit, not a
 *   purchase call. The founding decision's line is only real if there is nothing that could cross
 *   it, and a grep over the venture's own source is the way to know.
 * - **Every paid rung is shut.** The founding authorised the build and explicitly not the
 *   spending, so the capacity decision it names must not exist yet.
 */

export interface ContestReleaseCheck {
  id: string;
  passed: boolean;
  detail: string;
  evidenceRefs: string[];
}

export interface ContestReleaseAudit {
  schemaVersion: "contest-release-audit/1";
  checks: ContestReleaseCheck[];
  passed: boolean;
}

function check(id: string, passed: boolean, detail: string, evidenceRefs: string[]): ContestReleaseCheck {
  return { id, passed, detail, evidenceRefs };
}

async function readText(root: string, relative: string): Promise<string> {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch {
    return "";
  }
}

async function ventureSource(repoRoot: string): Promise<string> {
  const directory = path.join(repoRoot, "orchestrator/src/ventures/contest-radar");
  try {
    // The audit itself is excluded: it names the shapes it looks for, so scanning it would make
    // the check fail on its own vocabulary rather than on anything that could act.
    const names = (await readdir(directory))
      .filter((name) => name.endsWith(".ts") && name !== "release-audit.ts");
    const bodies = await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")));
    return bodies.join("\n");
  } catch {
    return "";
  }
}

export async function auditContestRadarRelease(options: {
  repoRoot?: string;
  configRoot?: string;
} = {}): Promise<ContestReleaseAudit> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const configRoot = options.configRoot ?? defaultConfigRoot;

  const [venturesRaw, sourcesRaw, capabilitiesRaw, allowlistRaw, founding, source, capacity] = await Promise.all([
    readText(configRoot, "ventures.json"),
    readText(configRoot, "contest-radar-sources.json"),
    readText(configRoot, "venture-capabilities.json"),
    readText(configRoot, "network-allowlist.json"),
    readText(repoRoot, "state/decisions/2026-08-30-contest-radar-founding.md"),
    ventureSource(repoRoot),
    readText(repoRoot, "state/decisions/2026-08-30-contest-radar-budget-capacity.md")
  ]);

  const ventures = JSON.parse(venturesRaw || "{}") as {
    ventures?: Array<{ id: string; visibility?: string; meetings?: unknown[]; ledgerNamespace?: string }>;
  };
  const registry = JSON.parse(sourcesRaw || "{}") as {
    sources?: Array<{ id: string; verdict: string; host: string; discoveryOnly?: boolean; maxRequestsPerRun: number; authPosture?: string }>;
  };
  const capabilities = JSON.parse(capabilitiesRaw || "{}") as {
    edges?: Array<{ source: string; target: string; capability: string; decision: string }>;
    isolationRules?: Array<{ id: string; sources?: string[] }>;
  };
  const allowlist = JSON.parse(allowlistRaw || "{}") as { runtimeHosts?: string[] };

  const entries = (ventures.ventures ?? []).filter((venture) => venture.id === "contest-radar");
  const entry = entries[0];
  const sources = registry.sources ?? [];
  const checks: ContestReleaseCheck[] = [];

  checks.push(check(
    "owner-only-and-scheduler-free",
    entries.length === 1
      && entry?.visibility === "owner-only"
      && (entry.meetings ?? []).length === 0
      && entry.ledgerNamespace === "contest-radar",
    "Contest Radar is registered once, owner-only, with its own ledger namespace and no meeting of its own — the scan rides the existing dispatcher.",
    ["config/ventures.json"]
  ));

  /*
   * The line the whole venture rests on.
   *
   * A grep rather than a promise, because "it never enters anything" is only true while nothing in
   * the venture's own source could. `submitted` and similar words appear in prose, so this looks
   * for the shapes that would actually act.
   */
  const actionShapes = /\.post\(|method:\s*["']POST["']|new FormData|\.submit\(|puppeteer|playwright/u;
  checks.push(check(
    "cannot-act-on-a-contest",
    source.length > 0 && !actionShapes.test(source),
    "No module in the venture contains a POST, a form submission or a browser driver. It prepares work and stops.",
    ["orchestrator/src/ventures/contest-radar/"]
  ));

  checks.push(check(
    "paid-rungs-shut",
    capacity.trim().length === 0,
    "Neither paid rung can open: the capacity decision the founding names does not exist, and the founding says in its own words that it is not that decision.",
    ["state/decisions/2026-08-30-contest-radar-founding.md"]
  ));

  checks.push(check(
    "founding-countersigned-and-holding",
    /^Status:\s*countersigned\s*$/mu.test(founding)
      && founding.includes("Held by this decision")
      && founding.includes("never acts on a contest"),
    "The founding is countersigned, holds every paid path and external write, and states the no-action rule.",
    ["state/decisions/2026-08-30-contest-radar-founding.md"]
  ));

  const rejected = sources.filter((entry) => entry.verdict === "rejected");
  checks.push(check(
    "refusals-recorded-and-unbudgeted",
    rejected.length >= 3 && rejected.every((entry) => entry.maxRequestsPerRun === 0),
    "Every source that refused a plain request stays rejected with no request budget: a login wall, a 405 and a bot challenge.",
    ["config/contest-radar-sources.json", "docs/CONTEST-RADAR-SOURCES.md"]
  ));

  const fetchHosts = sources
    .filter((entry) => entry.verdict === "enabled" && !entry.discoveryOnly && entry.maxRequestsPerRun > 0)
    .map((entry) => entry.host);
  checks.push(check(
    "every-fetched-host-allowlisted",
    fetchHosts.length > 0 && fetchHosts.every((host) => (allowlist.runtimeHosts ?? []).includes(host)),
    "The registry is the list of hosts this venture contacts, and every one of them is in the network allowlist.",
    ["config/contest-radar-sources.json", "config/network-allowlist.json"]
  ));

  checks.push(check(
    "no-credentialed-source-is-enabled",
    sources.every((entry) => entry.authPosture !== "owner-read-credential" || entry.verdict !== "enabled"),
    "No source requiring an owner credential is enabled; Kaggle stays held until the owner supplies one.",
    ["config/contest-radar-sources.json"]
  ));

  const inbound = (capabilities.edges ?? []).filter((edge) => edge.target === "contest-radar");
  const outbound = (capabilities.edges ?? []).filter((edge) => edge.source === "contest-radar");
  checks.push(check(
    "one-inbound-edge-and-no-outbound",
    inbound.length === 1
      && inbound[0]?.source === "goviral"
      && inbound[0]?.capability === "intelligence-read"
      && outbound.length === 0
      && (capabilities.isolationRules ?? []).some((rule) =>
        rule.id === "contest-radar-outbound-isolation" && (rule.sources ?? []).includes("contest-radar")),
    "Exactly one inbound edge — GoVIRAL's recorded scout evidence — and no outbound edge at all, with the isolation rule saying so.",
    ["config/venture-capabilities.json"]
  ));

  checks.push(check(
    "no-social-collection-of-its-own",
    sources.every((entry) => !/instagram|tiktok|threads|facebook/iu.test(entry.host)),
    "GoVIRAL owns Instagram and TikTok collection; no Contest Radar source contacts a social host.",
    ["config/contest-radar-sources.json"]
  ));

  return {
    schemaVersion: "contest-release-audit/1",
    checks,
    passed: checks.every((entry) => entry.passed)
  };
}
