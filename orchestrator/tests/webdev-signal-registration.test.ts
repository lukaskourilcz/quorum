import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadVentureCapabilityMap, resolveVentureCapabilityInMap } from "../src/ventures/capabilities.js";
import { cronPayloads, loadVentureRegistry, parseVentureRegistry, resolveScheduledClock } from "../src/ventures/registry.js";
import {
  dispatchWebDevSignalRegistration,
  loadWebDevSignalRegistration,
  resolveWebDevSignalFeature,
  resolveWebDevSignalSynthesisBudget
} from "../src/ventures/webdev-signal/registration.js";

describe("WebDev Signal registration", () => {
  it("registers one held Instagram-and-Threads venture, one ledger and two locale editions", async () => {
    const registry = await loadVentureRegistry();
    const matches = registry.ventures.filter(({ id }) => id === "webdev-signal");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      status: "exploration",
      visibility: "owner-only",
      taste: false,
      ledgerNamespace: "webdev-signal",
      delivery: { product: "instagram-threads", website: "absent" },
      editions: [
        { locale: "cs", state: "held" },
        { locale: "en", state: "held" }
      ],
      meetings: []
    });
    const serialized = JSON.stringify(matches[0]);
    expect(serialized).not.toMatch(/credential|oauth|providerToken|websiteUrl/iu);
  });

  it("keeps direct collection, model, renderer, locale, platform and site gates independent", async () => {
    const registration = await loadWebDevSignalRegistration();
    expect(registration.features).toMatchObject({
      directSources: "enabled",
      secondaryDiscovery: "held",
      goviralOverlay: "held",
      bilingualSynthesis: "held",
      designLabRendering: "held",
      czechProfileDelivery: "held",
      englishProfileDelivery: "held",
      instagramPublishing: "disabled",
      threadsPublishing: "disabled",
      metricsCollection: "held"
    });
    expect(resolveWebDevSignalFeature({ registration, feature: "directSources", authorityAvailable: true })).toMatchObject({ decision: "held" });
    const countersigned = { ...registration, foundingCountersigned: true };
    expect(resolveWebDevSignalFeature({ registration: countersigned, feature: "directSources", authorityAvailable: true })).toMatchObject({ decision: "allowed", authorityGranted: false });
    expect(resolveWebDevSignalFeature({ registration: countersigned, feature: "bilingualSynthesis", authorityAvailable: true }).decision).toBe("held");
    expect(resolveWebDevSignalFeature({ registration: countersigned, feature: "instagramPublishing", authorityAvailable: true }).decision).toBe("denied");
  });

  it("reserves only the lower nested synthesis ceiling and never borrows", async () => {
    const registration = await loadWebDevSignalRegistration();
    expect(resolveWebDevSignalSynthesisBudget({
      registration,
      selected: true,
      authorityCeilingUsd: null,
      companyHeadroomUsd: 1,
      ventureMonthSpentUsd: 0
    })).toEqual({ decision: "held", ceilingUsd: 0, reason: "synthesis-authority-missing", borrowingAllowed: false });

    const authorized = {
      ...registration,
      foundingCountersigned: true,
      features: { ...registration.features, bilingualSynthesis: "enabled" as const }
    };
    expect(resolveWebDevSignalSynthesisBudget({
      registration: authorized,
      selected: true,
      authorityCeilingUsd: 0.025,
      companyHeadroomUsd: 0.02,
      ventureMonthSpentUsd: 0.74
    })).toEqual({ decision: "reserved", ceilingUsd: 0.01, reason: "lower-of-authorities", borrowingAllowed: false });
    expect(resolveWebDevSignalSynthesisBudget({
      registration: authorized,
      selected: false,
      authorityCeilingUsd: 0.03,
      companyHeadroomUsd: 1,
      ventureMonthSpentUsd: 0
    })).toMatchObject({ decision: "not-needed", ceilingUsd: 0 });
  });

  it("uses only the exact #424 edges and permanently denies unrelated ventures", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    expect(map.mapVersion).toBe("1.3.0");
    const relationships = map.edges
      .filter((edge) => (edge.source === "webdev-signal" || edge.target === "webdev-signal") && edge.decision !== "denied")
      .map(({ source, target, capability, dataSchemaVersion, decision }) => ({ source, target, capability, dataSchemaVersion, decision }));
    expect(relationships).toEqual(expect.arrayContaining([
      { source: "goviral", target: "webdev-signal", capability: "intelligence-read", dataSchemaVersion: "goviral-intelligence-packet/1", decision: "held" },
      { source: "webdev-signal", target: "design-lab", capability: "bounded-render-summary", dataSchemaVersion: "bounded-render-summary/1", decision: "allowed" },
      { source: "webdev-signal", target: "social-distribution", capability: "approved-publish-package", dataSchemaVersion: "approved-publish-package/1", decision: "allowed" }
    ]));
    for (const venture of ["caught-up", "devshark", "personal-growth", "kvorum", "door-money", "contest-radar"]) {
      expect(resolveVentureCapabilityInMap(map, {
        source: venture,
        target: "webdev-signal",
        capability: "intelligence-read",
        schemaVersion: "goviral-intelligence-packet/1"
      }).decision).toBe("denied");
    }
  });

  it("shares the 05:00 dispatcher across DST without adding a cron, room or collision", async () => {
    const registry = await loadVentureRegistry();
    const registration = await loadWebDevSignalRegistration();
    const withoutWebDev = parseVentureRegistry({
      ...registry,
      ventures: registry.ventures.filter(({ id }) => id !== "webdev-signal")
    });
    expect(resolveScheduledClock(registry)).toEqual(resolveScheduledClock(withoutWebDev));
    expect(cronPayloads(registry)).toEqual(cronPayloads(withoutWebDev));
    expect(registration.schedule).toMatchObject({
      pragueHour: 5,
      dispatcherAnchorPhase: "cu-day",
      position: "before-anchor",
      newCron: false,
      publicMeeting: false
    });
    const anchorCrons = cronPayloads(registry).filter(({ phase }) => phase === "cu-day");
    expect(anchorCrons).toHaveLength(2);
    expect(new Set(anchorCrons.map(({ cron }) => cron))).toHaveLength(2);
  });

  it("returns an honest zero-cost fixture receipt and never creates a website or publisher path", async () => {
    const registration = await loadWebDevSignalRegistration();
    expect(dispatchWebDevSignalRegistration({ registration, dispatcherPhase: "morning", pragueDate: "2026-08-28", mode: "fixture" })).toBeNull();
    const receipt = dispatchWebDevSignalRegistration({ registration, dispatcherPhase: "cu-day", pragueDate: "2026-08-28", mode: "fixture" });
    expect(receipt).toMatchObject({
      schemaVersion: "webdev-run/1",
      phase: "webdev-signal-daily",
      mode: "fixture",
      selectionOutcome: "held",
      model: { reservations: 0, calls: 0, reservedUsd: 0, actualUsd: 0 },
      queueRefs: [],
      renderRefs: []
    });
    const siteFiles = await readFile(path.join(repoRoot, "site", "vercel.json"), "utf8");
    expect(siteFiles).not.toContain("webdev-signal");
    expect(JSON.stringify(registration)).not.toMatch(/secret|credential|publishAuthorized/iu);
  });
});
