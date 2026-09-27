import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAdminWebDevSignal, readWebDevSignalPanel } from "./admin-webdev-signal";

afterEach(() => vi.unstubAllEnvs());

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "webdev-admin-"));
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  await mkdir(path.join(root, "state", "decisions"), { recursive: true });
  await writeFile(
    path.join(root, "state/decisions/2026-08-28-webdev-signal-founding.md"),
    "# WebDev Signal founding\n\nStatus: countersigned\n\nHeld by this decision: live behavior held.\n",
    "utf8"
  );
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config/social-publisher-registry.json"), JSON.stringify({
    profiles: [
      { id: "social-profile-webdev-signal-cs", displayLabel: "WebDev Signal CZ", ventureRef: "webdev-signal", languages: ["cs"], lifecycle: "proposed", liveEligible: false },
      { id: "social-profile-caught-up", displayLabel: "Caught Up", ventureRef: "caught-up", languages: ["cs"], lifecycle: "proposed", liveEligible: false }
    ],
    connections: [{ id: "social-connection-caught-up-threads", profileId: "social-profile-caught-up" }]
  }), "utf8");
  return root;
}

async function observation(root: string, date: string, over: Record<string, unknown> = {}): Promise<void> {
  const directory = path.join(root, "state/ventures/webdev-signal/observations");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${date}.json`), JSON.stringify({
    schemaVersion: "webdev-observation/1",
    date,
    recordedAt: `${date}T06:00:00.000Z`,
    provenance: "fixture",
    refs: { runRef: `state/ventures/webdev-signal/runs/${date}.json`, selectionRef: null, evidenceBriefRef: null, packageRefs: [], renderReceiptRefs: [], profileRefs: [], sourceHealthRefs: [] },
    sources: { configured: 12, attempted: 12, healthy: 11, failed: 1, authorityClassesCovered: 2, layoutChanges: 0 },
    candidates: { fetched: 40, afterPrefilter: 28, duplicatesCollapsed: 4, held: 14, eligible: 6 },
    decision: { outcome: "selected", reason: "One material change crossed the threshold.", selectedRecordId: "rec-1", scoreMargin: { value: 0.2, unavailableReason: null }, confidence: { value: 0.8, unavailableReason: null }, ownerOverride: false },
    goviral: { status: "unavailable", changedWinner: false },
    editions: [
      { locale: "cs", state: "valid", holdReasons: [], claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" },
      { locale: "en", state: "valid", holdReasons: [], claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" }
    ],
    corrections: { opened: 0, resolved: 0, factualIncidents: 0, securityVersionIncidents: 0 },
    cost: { modelCalls: 0, providerCostUsd: 0, cacheReused: 8, callsAvoided: 2 },
    outcomes: [],
    snapshotHash: "a".repeat(64),
    ...over
  }), "utf8");
}

async function packageFile(root: string, date: string, locale: "cs" | "en", over: Record<string, unknown> = {}): Promise<void> {
  const directory = path.join(root, "state/ventures/webdev-signal/packages");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${date}-${locale}.json`), JSON.stringify({
    schemaVersion: "webdev-edition-package/1",
    id: `edition:abc:${locale}`,
    locale,
    evidenceBriefRef: `state/ventures/webdev-signal/briefs/${date}.json`,
    headline: locale === "cs" ? "Chrome 141: co se mění" : "Chrome 141: what changed",
    deck: "A deck.",
    explanation: "An explanation.",
    threads: { primary: "Threads text https://developer.chrome.com/blog/x/", continuation: [] },
    instagramCaption: "Caption\n\nSource: https://developer.chrome.com/blog/x/",
    instagramPanels: [{ role: "cover", heading: "Cover", body: "141" }, { role: "source", heading: "Source", body: "Official source" }],
    sourceAttribution: [{ url: "https://developer.chrome.com/blog/x/", label: "Chrome official source" }, { url: "http://insecure.example/", label: "dropped" }],
    status: "approved",
    heldReason: null,
    ...over
  }), "utf8");
}

async function receiptFile(root: string, name: string, over: Record<string, unknown> = {}): Promise<void> {
  const directory = path.join(root, "state/ventures/webdev-signal/design-lab/receipts");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), JSON.stringify({
    schemaVersion: "webdev-render-receipt/1",
    packageRef: "state/ventures/webdev-signal/packages/2026-08-12-cs.json",
    outcome: "success",
    reason: null,
    outputs: [
      { panelId: "panel-01", assetRef: "state/ventures/webdev-signal/design-lab/assets/abc/cs/01.png" },
      { panelId: "panel-02", assetRef: "state/ventures/webdev-signal/design-lab/assets/../escape.png" }
    ],
    ...over
  }), "utf8");
}

/**
 * One loader, not one per tab. Every tab asks a different question about the same Prague day, and
 * answering each from its own reader is how two tabs come to disagree about that day.
 */
describe("the WebDev Signal admin snapshot", () => {
  it("joins each package with the receipt that rendered it and lists drafts newest first, Czech before English", async () => {
    const root = await repository();
    await packageFile(root, "2026-08-12", "cs");
    await packageFile(root, "2026-08-12", "en", { status: "held", heldReason: "en:missing-source-attribution" });
    await packageFile(root, "2026-08-13", "en");
    await receiptFile(root, "aaa-cs.json");
    await receiptFile(root, "bbb-cs.json", { outcome: "held", reason: "textFit: panel-02-body", outputs: [] });
    await writeFile(path.join(root, "state/ventures/webdev-signal/packages/2026-08-14-cs.json"), "{ not json", "utf8");

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.draftsState).toBe("present");
    expect(snapshot.drafts.map(({ date, locale }) => `${date}-${locale}`)).toEqual(["2026-08-13-en", "2026-08-12-cs", "2026-08-12-en"]);
    const czech = snapshot.drafts.find(({ locale, date }) => locale === "cs" && date === "2026-08-12");
    // The successful render wins over the held retry, and an escaping asset ref is dropped.
    // The file is not in the tree, so the card names the panel as pruned rather than showing a broken image.
    expect(czech?.render).toEqual({
      outcome: "success",
      reason: null,
      assetRefs: ["state/ventures/webdev-signal/design-lab/assets/abc/cs/01.png"],
      files: [{ number: 1, previewUrl: "/admin/api/webdev-signal/panel/2026-08-12/cs/1", downloadUrl: "/admin/api/webdev-signal/panel/2026-08-12/cs/1?download=1", available: false }]
    });
    expect(czech?.sourceUrls).toEqual(["https://developer.chrome.com/blog/x/"]);
    expect(czech?.instagramCaption).toContain("Source: https://");
    expect(snapshot.drafts.find(({ date }) => date === "2026-08-13")?.render.outcome).toBe("absent");
    expect(snapshot.drafts.find(({ locale, date }) => locale === "en" && date === "2026-08-12")).toMatchObject({ status: "held", heldReason: "en:missing-source-attribution" });
    expect(snapshot.unreadable).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("2026-08-14-cs.json");
  });

  it("reads a venture that has never run as absent rather than broken", async () => {
    await repository();

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.observationsState).toBe("missing");
    expect(snapshot.days).toEqual([]);
    expect(snapshot.unreadable).toBe(0);
    // The posture comes from the countersigned record, not from an assumption.
    expect(snapshot.authority).toEqual({ foundingCountersigned: true, liveBehaviourHeld: true, accountsCreated: false });
  });

  it("returns days newest first and carries only this venture's profiles", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");
    await observation(root, "2026-08-13");

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days.map(({ date }) => date)).toEqual(["2026-08-13", "2026-08-12"]);
    expect(snapshot.profiles.map(({ id }) => id)).toEqual(["social-profile-webdev-signal-cs"]);
    expect(snapshot.profiles[0]?.connections).toEqual([]);
  });

  it("drops a malformed day as a count and never as a path", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");
    await writeFile(
      path.join(root, "state/ventures/webdev-signal/observations/2026-08-13.json"),
      "{ not json",
      "utf8"
    );

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days).toHaveLength(1);
    expect(snapshot.unreadable).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain(root);
    expect(JSON.stringify(snapshot)).not.toContain("2026-08-13.json");
  });

  it("hashes deterministically over the same state", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");

    const first = await readAdminWebDevSignal();
    const second = await readAdminWebDevSignal();

    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.snapshotHash).toHaveLength(64);
  });

  it("keeps a NO_EDITION day's missing measures unavailable with their reason", async () => {
    const root = await repository();
    await observation(root, "2026-08-12", {
      decision: {
        outcome: "NO_EDITION",
        reason: "No candidate crossed the threshold.",
        selectedRecordId: null,
        scoreMargin: { value: null, unavailableReason: "no-edition-day" },
        confidence: { value: null, unavailableReason: "no-edition-day" },
        ownerOverride: false
      },
      editions: []
    });

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days[0]?.outcome).toBe("NO_EDITION");
    expect(snapshot.days[0]?.scoreMargin).toEqual({ value: null, unavailableReason: "no-edition-day" });
  });
});

describe("one rendered panel, for the admin preview and download route", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const HASH = createHash("sha256").update(PNG).digest("hex");
  const REF = "state/ventures/webdev-signal/design-lab/assets/abc/cs/01.png";

  async function rendered(root: string, bytes: Buffer): Promise<void> {
    await mkdir(path.join(root, "state/ventures/webdev-signal/design-lab/assets/abc/cs"), { recursive: true });
    await writeFile(path.join(root, REF), bytes);
    await receiptFile(root, "aaa-cs.json", { outputs: [{ panelId: "panel-01", assetRef: REF, pngHash: HASH }] });
  }

  it("serves the file the day's successful receipt names while its bytes match the receipt", async () => {
    const root = await repository();
    await rendered(root, PNG);

    const read = await readWebDevSignalPanel("2026-08-12", "cs", 1);

    expect(read).toEqual({ state: "found", bytes: PNG, filename: "webdev-signal-2026-08-12-cs-01.png" });
    const snapshot = await (async () => { await packageFile(root, "2026-08-12", "cs"); return readAdminWebDevSignal(); })();
    expect(snapshot.drafts[0]?.render.files).toEqual([expect.objectContaining({ number: 1, available: true })]);
  });

  it("refuses a changed file, a missing panel and anything that is not a day, a locale and a number", async () => {
    const root = await repository();
    await rendered(root, Buffer.from("not the rendered panel"));

    expect(await readWebDevSignalPanel("2026-08-12", "cs", 1)).toEqual({ state: "mismatch" });
    expect(await readWebDevSignalPanel("2026-08-12", "cs", 2)).toEqual({ state: "not-found" });
    expect(await readWebDevSignalPanel("2026-08-12", "en", 1)).toEqual({ state: "not-found" });
    expect(await readWebDevSignalPanel("../../x", "cs", 1)).toEqual({ state: "not-found" });
    expect(await readWebDevSignalPanel("2026-08-12", "de", 1)).toEqual({ state: "not-found" });
    expect(await readWebDevSignalPanel("2026-08-12", "cs", 0)).toEqual({ state: "not-found" });
  });

  it("serves nothing from a held render", async () => {
    const root = await repository();
    await rendered(root, PNG);
    await receiptFile(root, "aaa-cs.json", { outcome: "held", reason: "textFit", outputs: [{ panelId: "panel-01", assetRef: REF, pngHash: HASH }] });

    expect(await readWebDevSignalPanel("2026-08-12", "cs", 1)).toEqual({ state: "not-found" });
  });
});
