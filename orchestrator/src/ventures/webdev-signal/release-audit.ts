import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot } from "../../paths.js";

/**
 * What has to be true before WebDev Signal is safe to operate, checked rather than asserted.
 *
 * Every clause here is a fact about files this repository holds, so the audit reads them and says
 * which ones hold. It is deliberately not a summary of the program's issues: an audit that trusted
 * a checklist would pass on the day someone deleted the thing the checklist described.
 *
 * The two clauses worth stating plainly, because they are what a release could quietly break:
 * only audited official and primary sources carry factual authority, and no account, credential,
 * connection or publishing scope exists. Both are the founding decision's own words, and both are
 * things a well-meaning change could grant by accident.
 */

export interface WebDevReleaseCheck {
  id: string;
  passed: boolean;
  detail: string;
  evidenceRefs: string[];
}

export interface WebDevReleaseAudit {
  schemaVersion: "webdev-release-audit/1";
  checks: WebDevReleaseCheck[];
  passed: boolean;
}

function check(id: string, passed: boolean, detail: string, evidenceRefs: string[]): WebDevReleaseCheck {
  return { id, passed, detail, evidenceRefs };
}

async function readText(root: string, relative: string): Promise<string> {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch {
    return "";
  }
}

export async function auditWebDevSignalRelease(options: {
  repoRoot?: string;
  configRoot?: string;
} = {}): Promise<WebDevReleaseAudit> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const configRoot = options.configRoot ?? defaultConfigRoot;

  const [venturesRaw, publisherRaw, strategiesRaw, capabilitiesRaw, foundingRaw, sourcesDoc, cycleWorkflow] =
    await Promise.all([
      readText(configRoot, "ventures.json"),
      readText(configRoot, "social-publisher-registry.json"),
      readText(configRoot, "social-profile-strategies.json"),
      readText(configRoot, "venture-capabilities.json"),
      readText(repoRoot, "state/decisions/2026-08-28-webdev-signal-founding.md"),
      readText(repoRoot, "docs/WEBDEV-SIGNAL-SOURCES.md"),
      readText(repoRoot, ".github/workflows/cycle.yml")
    ]);

  const ventures = JSON.parse(venturesRaw || "{}") as {
    ventures?: Array<{ id: string; editions?: Array<{ locale: string; profileRef: string; state: string }>; meetings?: unknown[]; ledgerNamespace?: string }>;
  };
  const publisher = JSON.parse(publisherRaw || "{}") as {
    profiles?: Array<{ id: string; ventureRef?: string | null; lifecycle?: string; liveEligible?: boolean }>;
    connections?: Array<{ profileId: string }>;
  };
  const strategies = JSON.parse(strategiesRaw || "{}") as {
    strategies?: Array<{ profileId: string; authorityGranted?: boolean; queueAuthorized?: boolean; publishingAuthorized?: boolean }>;
  };
  const capabilities = JSON.parse(capabilitiesRaw || "{}") as {
    edges?: Array<{ source: string; target: string; capability: string; decision: string }>;
  };

  const entries = (ventures.ventures ?? []).filter((venture) => venture.id === "webdev-signal");
  const registry = entries[0];
  const editions = registry?.editions ?? [];
  const profiles = (publisher.profiles ?? []).filter((profile) => profile.ventureRef === "webdev-signal");
  const profileIds = new Set(profiles.map((profile) => profile.id));

  const checks: WebDevReleaseCheck[] = [];

  checks.push(check(
    "one-venture-two-editions",
    entries.length === 1
      && typeof registry?.ledgerNamespace === "string"
      && editions.length === 2
      && new Set(editions.map((edition) => edition.locale)).size === 2
      && editions.every((edition) => profileIds.has(edition.profileRef)),
    "WebDev Signal is registered once with a ledger namespace and exactly two locale editions, each resolving to a real profile.",
    ["config/ventures.json", "config/social-publisher-registry.json"]
  ));

  checks.push(check(
    "no-second-cron-or-public-meeting",
    (registry?.meetings ?? []).length === 0 && !cycleWorkflow.includes("webdev"),
    "Daily execution belongs to the existing Prague dispatcher: the venture declares no meeting of its own and the cycle workflow names no WebDev step.",
    ["config/ventures.json", ".github/workflows/cycle.yml"]
  ));

  // The sources document is the audit trail for which hosts may establish a fact. A secondary
  // source that stopped being discovery-only would not fail anything else in this repository.
  checks.push(check(
    "secondary-sources-stay-discovery-only",
    sourcesDoc.includes("Lead/corroboration only; no factual authority"),
    "Only audited official and primary sources carry factual authority; secondary sources remain lead-only.",
    ["docs/WEBDEV-SIGNAL-SOURCES.md"]
  ));

  const goviralEdge = (capabilities.edges ?? []).find((edge) =>
    edge.source === "goviral" && edge.target === "webdev-signal" && edge.capability === "intelligence-read");
  checks.push(check(
    "goviral-optional-and-held",
    goviralEdge?.decision === "held",
    "GoVIRAL reaches WebDev Signal only as held, read-only momentum intelligence; it cannot create a candidate or establish a fact.",
    ["config/venture-capabilities.json"]
  ));

  const socialEdge = (capabilities.edges ?? []).find((edge) =>
    edge.source === "webdev-signal" && edge.target === "social-distribution");
  const renderEdge = (capabilities.edges ?? []).find((edge) =>
    edge.source === "webdev-signal" && edge.target === "design-lab");
  checks.push(check(
    "exact-outbound-edges-only",
    socialEdge?.capability === "approved-publish-package"
      && renderEdge?.capability === "bounded-render-summary"
      && (capabilities.edges ?? []).filter((edge) => edge.source === "webdev-signal" && edge.decision === "allowed").length === 2,
    "WebDev Signal sends exactly two things: a bounded render summary to Design Lab and an immutable approved package reference to Social Distribution.",
    ["config/venture-capabilities.json"]
  ));

  const webdevStrategies = (strategies.strategies ?? []).filter((strategy) => profileIds.has(strategy.profileId));
  checks.push(check(
    "accounts-and-authority-held",
    profiles.length === 2
      && profiles.every((profile) => profile.lifecycle === "proposed" && profile.liveEligible !== true)
      && (publisher.connections ?? []).every((connection) => !profileIds.has(connection.profileId))
      && webdevStrategies.length === 2
      && webdevStrategies.every((strategy) =>
        strategy.authorityGranted !== true && strategy.queueAuthorized !== true && strategy.publishingAuthorized !== true),
    "Both editions are proposals with no connection, and neither constitution grants authority, queue or publishing.",
    ["config/social-publisher-registry.json", "config/social-profile-strategies.json"]
  ));

  checks.push(check(
    "founding-holds-live-behaviour",
    /^Status:\s*countersigned\s*$/mu.test(foundingRaw)
      && foundingRaw.includes("Held by this decision")
      && foundingRaw.replace(/\s+/gu, " ").includes("no rendering, profile, connection, provider, routine-scope, queue or publishing authority"),
    "The founding is countersigned and still holds live behaviour; the signature authorised the build and nothing external.",
    ["state/decisions/2026-08-28-webdev-signal-founding.md"]
  ));

  checks.push(check(
    "no-website-workstream",
    foundingRaw.includes("there is no website stage or website backlog")
      && !foundingRaw.includes("#447"),
    "Instagram and Threads are the entire public product; no website or cross-promotion workstream is a release dependency.",
    ["state/decisions/2026-08-28-webdev-signal-founding.md"]
  ));

  return {
    schemaVersion: "webdev-release-audit/1",
    checks,
    passed: checks.every((entry) => entry.passed)
  };
}
