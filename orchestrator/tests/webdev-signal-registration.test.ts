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
  it("registers one owner-only Instagram-and-Threads venture, one ledger and two held locale editions", async () => {
    const registry = await loadVentureRegistry();
    const matches = registry.ventures.filter(({ id }) => id === "webdev-signal");
    expect(matches).toHaveLength(1);
    // `operating` is what gives the owner a pause switch for the daily scan; the editions stay
    // held because no account, connection or publishing authority exists.
    expect(matches[0]).toMatchObject({
      status: "operating",
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
    // The owner's 2026-09-15 instruction opened exactly two gates: direct collection and the
    // deterministic render. Synthesis stays held and both platforms stay disabled, so no model is
    // called and nothing is published; the daily runner only drafts.
    expect(registration.foundingCountersigned).toBe(true);
    expect(registration.features).toMatchObject({
      directSources: "enabled",
      secondaryDiscovery: "held",
      goviralOverlay: "held",
      bilingualSynthesis: "held",
      designLabRendering: "enabled",
      czechProfileDelivery: "held",
      englishProfileDelivery: "held",
      instagramPublishing: "disabled",
      threadsPublishing: "disabled",
      metricsCollection: "held"
    });
    expect(resolveWebDevSignalFeature({ registration, feature: "directSources", authorityAvailable: true })).toMatchObject({ decision: "allowed", authorityGranted: false });
    // An open gate is still nothing without the independent authority behind it.
    expect(resolveWebDevSignalFeature({ registration, feature: "directSources", authorityAvailable: false })).toMatchObject({ decision: "held", reason: "founding-or-independent-authority-missing" });
    const unsigned = { ...registration, foundingCountersigned: false };
    expect(resolveWebDevSignalFeature({ registration: unsigned, feature: "directSources", authorityAvailable: true })).toMatchObject({ decision: "held" });
    expect(resolveWebDevSignalFeature({ registration, feature: "bilingualSynthesis", authorityAvailable: true }).decision).toBe("held");
    expect(resolveWebDevSignalFeature({ registration, feature: "instagramPublishing", authorityAvailable: true }).decision).toBe("denied");
    expect(resolveWebDevSignalFeature({ registration, feature: "threadsPublishing", authorityAvailable: true }).decision).toBe("denied");
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

  it("dispatches only from its anchor, runs only with source authority, and holds with an honest zero-cost receipt", async () => {
    const registration = await loadWebDevSignalRegistration();
    expect(dispatchWebDevSignalRegistration({ registration, dispatcherPhase: "morning", pragueDate: "2026-08-28", mode: "fixture", sourceAuthorityAvailable: true })).toBeNull();
    const held = dispatchWebDevSignalRegistration({ registration, dispatcherPhase: "cu-day", pragueDate: "2026-08-28", mode: "live" });
    expect(held).toMatchObject({ decision: "held", reason: "founding-or-independent-authority-missing" });
    if (held?.decision !== "held") throw new Error("unreachable");
    expect(held.run).toMatchObject({
      schemaVersion: "webdev-run/1",
      phase: "webdev-signal-daily",
      mode: "live",
      selectionOutcome: "held",
      sourceOutcomes: [],
      model: { reservations: 0, calls: 0, reservedUsd: 0, actualUsd: 0 },
      queueRefs: [],
      renderRefs: [],
      errors: [{ code: "held", sourceId: null, message: "founding-or-independent-authority-missing" }]
    });
    const unsigned = { ...registration, foundingCountersigned: false };
    expect(dispatchWebDevSignalRegistration({ registration: unsigned, dispatcherPhase: "cu-day", pragueDate: "2026-08-28", mode: "fixture", sourceAuthorityAvailable: true })).toMatchObject({ decision: "held" });
    const run = dispatchWebDevSignalRegistration({ registration, dispatcherPhase: "cu-day", pragueDate: "2026-08-28", mode: "fixture", sourceAuthorityAvailable: true });
    expect(run).toMatchObject({ decision: "run" });
    // One key per Prague day and mode, the same whether the day ran or was held.
    const heldFixture = dispatchWebDevSignalRegistration({ registration: unsigned, dispatcherPhase: "cu-day", pragueDate: "2026-08-28", mode: "fixture" });
    expect(run?.decision === "run" ? run.idempotencyKey : null).toBe(heldFixture?.decision === "held" ? heldFixture.run.idempotencyKey : undefined);
    expect(held.run.idempotencyKey).not.toBe(run?.decision === "run" ? run.idempotencyKey : null);
    const siteFiles = await readFile(path.join(repoRoot, "site", "vercel.json"), "utf8");
    expect(siteFiles).not.toContain("webdev-signal");
    expect(JSON.stringify(registration)).not.toMatch(/secret|credential|publishAuthorized/iu);
  });
});
