import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ContestSourceRegistrySchema,
  discoverySources,
  enabledHosts,
  fetchableSources,
  loadContestSourceRegistry
} from "../src/ventures/contest-radar/sources.js";
import { configRoot } from "../src/paths.js";

/**
 * The registry is the list of hosts this venture will contact, and each verdict was produced by
 * fetching the URL on 2026-08-30 rather than by reading the original brief.
 */
describe("the Contest Radar source registry", () => {
  it("parses, and names the audit and decision it came from", async () => {
    const registry = await loadContestSourceRegistry();

    expect(ContestSourceRegistrySchema.safeParse(registry).success).toBe(true);
    expect(registry.auditRef).toBe("docs/CONTEST-RADAR-SOURCES.md");
    expect(registry.decisionRef).toBe("state/decisions/2026-08-30-contest-radar-founding.md");
  });

  it("keeps every fetchable host in the network allowlist", async () => {
    const registry = await loadContestSourceRegistry();
    const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as {
      runtimeHosts: string[];
    };

    for (const host of enabledHosts(registry)) {
      expect(allowlist.runtimeHosts, `${host} is enabled but not allowlisted`).toContain(host);
    }
  });

  /*
   * The three refusals no code change can fix.
   *
   * `vyhrat.sk` redirects its listing to a login page, `dorahacks.io` answers 405 to a plain GET
   * and `lablab.ai` serves a Cloudflare challenge. Each is the site saying no. Encoding that is as
   * much the registry's job as listing the sources that work, because the alternative — imitating a
   * browser to get past a bot check — is the thing the founding decision rules out.
   */
  it("keeps a refusing source rejected and unbudgeted", async () => {
    const registry = await loadContestSourceRegistry();

    for (const id of ["vyhrat-sk", "dorahacks", "lablab-ai"]) {
      const source = registry.sources.find((candidate) => candidate.id === id);
      expect(source?.verdict, `${id} must stay rejected`).toBe("rejected");
      expect(source?.maxRequestsPerRun, `${id} must have no request budget`).toBe(0);
    }
    expect(fetchableSources(registry).map(({ id }) => id)).not.toContain("vyhrat-sk");
  });

  it("keeps a credentialed source held until the owner supplies the credential", async () => {
    const registry = await loadContestSourceRegistry();
    const kaggle = registry.sources.find((source) => source.id === "kaggle");

    expect(kaggle?.verdict).toBe("held");
    expect(kaggle?.authPosture).toBe("owner-read-credential");
    // The env var name travels; a credential value never reaches a config file.
    expect(kaggle?.credentialEnvName).toBe("KAGGLE_API_TOKEN");
    expect(JSON.stringify(registry)).not.toMatch(/token"\s*:\s*"[A-Za-z0-9]{8}/u);
  });

  it("keeps discovery-only sources out of the fetch set and out of the allowlist", async () => {
    const registry = await loadContestSourceRegistry();

    const discovery = discoverySources(registry).map(({ id }) => id);
    expect(discovery).toEqual(["goviral-scout", "owner-manual"]);
    // Merging these into the fetch set is how a social post becomes a deadline.
    for (const id of discovery) expect(fetchableSources(registry).map((source) => source.id)).not.toContain(id);
    expect(enabledHosts(registry)).not.toContain("internal");
  });

  it("schedules no social collection of its own", async () => {
    const registry = await loadContestSourceRegistry();

    // GoVIRAL owns Instagram and TikTok. A second scraper here would duplicate that boundary.
    for (const source of registry.sources) {
      expect(source.host).not.toMatch(/instagram|tiktok|threads/iu);
    }
    const goviral = registry.sources.find((source) => source.id === "goviral-scout");
    expect(goviral?.discoveryOnly).toBe(true);
    expect(goviral?.maxRequestsPerRun).toBe(0);
  });
});
