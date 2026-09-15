import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WebDevEditionPackageSchema,
  WebDevObservationSchema,
  WebDevRenderReceiptSchema,
  WebDevRunSchema,
  WebDevSelectionSchema,
  parseWebDevCandidates
} from "../src/contracts/webdev-signal.js";
import { configRoot } from "../src/paths.js";
import { webDevSignalFixtureBodies } from "../src/ventures/webdev-signal/fixtures.js";
import { runWebDevSignalDaily } from "../src/ventures/webdev-signal/run.js";
import { loadWebDevSourceRegistry } from "../src/ventures/webdev-signal/sources/registry.js";

/**
 * The daily runner, end to end, against a scratch state root.
 *
 * Every day here is a fixture day or a stubbed live day; nothing reaches a network. What the
 * assertions are about is the chain and its posture: the records a day leaves, the receipt that
 * makes a second firing free, and the line a failing source costs — never the run.
 */

// 05:00 Prague on a CEST day, which is when the dispatcher fires.
const NOW = new Date("2026-09-16T03:00:00.000Z");
const DATE = "2026-09-16";
const PUBLIC_DNS = async () => ["203.0.113.10"];
const NO_DELAY = async () => undefined;
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "webdev-run-"));
  roots.push(root);
  return root;
}

async function json(root: string, ref: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, ref.replace(/^state\//u, "")), "utf8")) as unknown;
}

const neverFetch = vi.fn(async () => {
  throw new Error("the fixture day must not fetch");
}) as unknown as typeof fetch;

/** A live day served from the fixture bodies, with one host optionally dead. */
async function stubbedFetch(dead: readonly string[] = []): Promise<typeof fetch> {
  const registry = await loadWebDevSourceRegistry();
  const bodies = webDevSignalFixtureBodies(registry, NOW.toISOString());
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const source = registry.sources.find((candidate) => candidate.endpoint === url.toString());
    if (!source || dead.includes(source.id)) throw new Error(`fixture outage for ${url.hostname}`);
    const contentType = source.sourceKind === "rss" || source.sourceKind === "atom" ? "application/rss+xml" : "application/json";
    return new Response(Buffer.from(bodies[source.id]!), { status: 200, headers: { "content-type": contentType, etag: `etag-${source.id}` } });
  }) as typeof fetch;
}

describe("the WebDev Signal daily runner", () => {
  it("runs a fixture day end to end at $0, touching no network and leaving every record", async () => {
    const root = await scratchRoot();
    const result = await runWebDevSignalDaily({ now: NOW, dry: true, root, fetchImpl: neverFetch });
    expect(neverFetch).not.toHaveBeenCalled();
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");

    const run = WebDevRunSchema.parse(await json(root, result.runRef));
    expect(run).toMatchObject({
      pragueDate: DATE,
      mode: "fixture",
      selectionOutcome: "selected",
      queueRefs: [],
      model: { reservations: 0, calls: 0, provider: null, model: null, reservedUsd: 0, actualUsd: 0 }
    });
    expect(run.packageRefs).toEqual([
      `state/ventures/webdev-signal/packages/${DATE}-cs.json`,
      `state/ventures/webdev-signal/packages/${DATE}-en.json`
    ]);
    expect(run.renderRefs).toHaveLength(2);
    expect(run.errors).toEqual([]);
    expect(run.nextSafeAction).toContain("post them by hand");
    // Every enabled source answered: three carried an invented item, the rest were quiet.
    expect(run.sourceOutcomes.map(({ outcome }) => outcome).sort()).toEqual([...Array<string>(7).fill("empty"), "success", "success", "success"].sort());
    expect(run.counts).toMatchObject({ candidates: 3, new: 3, updated: 0, duplicate: 0, malformed: 0 });

    const selection = WebDevSelectionSchema.parse(await json(root, run.selectionRef!));
    expect(selection.outcome).toBe("selected");
    const candidates = parseWebDevCandidates(await json(root, `state/ventures/webdev-signal/candidates/${DATE}.json`) as unknown[]);
    expect(candidates.candidates.every((candidate) => candidate.provenance.fixture)).toBe(true);

    for (const locale of ["cs", "en"] as const) {
      const pack = WebDevEditionPackageSchema.parse(await json(root, `state/ventures/webdev-signal/packages/${DATE}-${locale}.json`));
      expect(pack).toMatchObject({ locale, status: "approved", editorialProvenance: { deterministic: true, provider: null, model: null } });
      expect(pack.instagramCaption).toContain("https://");
    }
    const receipts = await Promise.all(run.renderRefs.map(async (ref) => WebDevRenderReceiptSchema.parse(await json(root, ref))));
    expect(receipts.map(({ locale }) => locale).sort()).toEqual(["cs", "en"]);
    for (const receipt of receipts) {
      expect(receipt).toMatchObject({ outcome: "success", providerCostUsd: 0, cache: { status: "new" } });
      for (const output of receipt.outputs) {
        const png = await stat(path.join(root, output.assetRef.replace(/^state\//u, "")));
        expect(png.size).toBeGreaterThan(0);
      }
    }

    const observation = WebDevObservationSchema.parse(await json(root, `state/ventures/webdev-signal/observations/${DATE}.json`));
    expect(observation).toMatchObject({ provenance: "fixture", decision: { outcome: "selected" }, refs: { runRef: result.runRef } });
    expect(observation.editions.map(({ locale, state, renderState, deliveryState }) => ({ locale, state, renderState, deliveryState }))).toEqual([
      { locale: "cs", state: "valid", renderState: "rendered", deliveryState: "held" },
      { locale: "en", state: "valid", renderState: "rendered", deliveryState: "held" }
    ]);
    expect(observation.decision.scoreMargin.value).toBeGreaterThan(0);
    // Nothing the day wrote is a queue item, a connection or a credential.
    expect(JSON.stringify(run)).not.toMatch(/queueItem|credential|providerToken|publishAuthorized/u);
  }, 60_000);

  it("finds its own receipt on a second call for the same Prague day and writes nothing more", async () => {
    const root = await scratchRoot();
    const first = await runWebDevSignalDaily({ now: NOW, dry: true, root });
    const listing = async () => {
      const files: string[] = [];
      const walk = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(full);
          else files.push(`${full}:${(await stat(full)).mtimeMs}`);
        }
      };
      await walk(root);
      return files.sort();
    };
    const before = await listing();
    const second = await runWebDevSignalDaily({ now: new Date(NOW.getTime() + 3_600_000), dry: true, root, fetchImpl: neverFetch });
    expect(second.status).toBe("already_recorded");
    expect(second.run).toEqual(first.run);
    expect(second.artifacts).toEqual([]);
    expect(await listing()).toEqual(before);
  }, 60_000);

  it("charges a dead feed one receipt line and still selects the day's story", async () => {
    const root = await scratchRoot();
    const result = await runWebDevSignalDaily({
      now: NOW,
      dry: false,
      root,
      fetchImpl: await stubbedFetch(["chrome-developers"]),
      resolveImpl: PUBLIC_DNS,
      delayImpl: NO_DELAY
    });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.run.mode).toBe("live");
    expect(result.run.sourceOutcomes.find(({ sourceId }) => sourceId === "chrome-developers")).toMatchObject({ outcome: "failed", fetched: 0, kept: 0 });
    expect(result.run.errors).toEqual([expect.objectContaining({ code: "source-failed", sourceId: "chrome-developers" })]);
    expect(result.run.selectionOutcome).toBe("selected");
    expect(result.run.packageRefs).toHaveLength(2);
    expect(result.run.renderRefs).toHaveLength(2);
    // Live mode is the only mode that keeps conditional-request metadata, and only metadata.
    const cache = await readFile(path.join(root, "ventures/webdev-signal/sources/cache.json"), "utf8");
    expect(cache).toContain("etag-react-releases");
    expect(cache).not.toContain("Invented");
  }, 60_000);

  it("records a held day when every source failed, without pretending to judge anything", async () => {
    const root = await scratchRoot();
    const result = await runWebDevSignalDaily({
      now: NOW,
      dry: false,
      root,
      fetchImpl: (async () => {
        throw new Error("fixture outage");
      }) as unknown as typeof fetch,
      resolveImpl: PUBLIC_DNS,
      delayImpl: NO_DELAY
    });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.run).toMatchObject({ selectionOutcome: "held", selectionRef: null, briefRef: null, packageRefs: [], renderRefs: [] });
    expect(result.run.errors.some((error) => error.code === "no-source")).toBe(true);
    expect(result.run.errors.filter((error) => error.code === "source-failed")).toHaveLength(10);
    const observation = WebDevObservationSchema.parse(await json(root, `state/ventures/webdev-signal/observations/${DATE}.json`));
    expect(observation.decision.outcome).toBe("not-run");
    expect(observation.sources.attempted).toBe(10);
  }, 30_000);

  it("records NO_EDITION for a quiet day and leaves nothing to post", async () => {
    const root = await scratchRoot();
    const quiet = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      const body = url.hostname === "api.github.com" ? "[]" : '<?xml version="1.0"?><rss version="2.0"><channel><title>quiet</title></channel></rss>';
      const contentType = url.hostname === "api.github.com" ? "application/json" : "application/rss+xml";
      return new Response(body, { status: 200, headers: { "content-type": contentType } });
    }) as typeof fetch;
    const result = await runWebDevSignalDaily({ now: NOW, dry: false, root, fetchImpl: quiet, resolveImpl: PUBLIC_DNS, delayImpl: NO_DELAY });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.run).toMatchObject({ selectionOutcome: "NO_EDITION", briefRef: null, packageRefs: [], renderRefs: [], errors: [] });
    expect(result.run.nextSafeAction).toContain("nothing to post");
    expect(result.run.sourceOutcomes.every(({ outcome }) => outcome === "empty")).toBe(true);
    const observation = WebDevObservationSchema.parse(await json(root, `state/ventures/webdev-signal/observations/${DATE}.json`));
    expect(observation.decision).toMatchObject({ outcome: "NO_EDITION", scoreMargin: { value: null, unavailableReason: "no-edition-day" } });
  }, 30_000);

  it("holds the render, keeps the approved packages and says why, when the Design Lab edge is missing", async () => {
    const root = await scratchRoot();
    const scratchConfig = path.join(root, "config");
    await cp(configRoot, scratchConfig, { recursive: true });
    const capabilities = JSON.parse(await readFile(path.join(scratchConfig, "venture-capabilities.json"), "utf8")) as { edges: Array<{ source: string; target: string }> };
    capabilities.edges = capabilities.edges.filter((edge) => !(edge.source === "webdev-signal" && edge.target === "design-lab"));
    await writeFile(path.join(scratchConfig, "venture-capabilities.json"), JSON.stringify(capabilities, null, 2));

    const result = await runWebDevSignalDaily({ now: NOW, dry: true, root, configRoot: scratchConfig });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.run.selectionOutcome).toBe("selected");
    expect(result.run.packageRefs).toHaveLength(2);
    expect(result.run.renderRefs).toEqual([]);
    expect(result.run.errors).toEqual([expect.objectContaining({ code: "render-held", message: "founding-or-independent-authority-missing" })]);
    const observation = WebDevObservationSchema.parse(await json(root, `state/ventures/webdev-signal/observations/${DATE}.json`));
    expect(observation.editions.every((edition) => edition.state === "valid" && edition.renderState === "held")).toBe(true);
  }, 60_000);

  it("writes a held receipt and nothing else while the founding is not countersigned", async () => {
    const root = await scratchRoot();
    const scratchConfig = path.join(root, "config");
    await cp(configRoot, scratchConfig, { recursive: true });
    const registration = JSON.parse(await readFile(path.join(scratchConfig, "webdev-signal.json"), "utf8")) as { foundingCountersigned: boolean };
    registration.foundingCountersigned = false;
    await writeFile(path.join(scratchConfig, "webdev-signal.json"), JSON.stringify(registration, null, 2));

    const result = await runWebDevSignalDaily({ now: NOW, dry: false, root, configRoot: scratchConfig, fetchImpl: neverFetch });
    expect(neverFetch).not.toHaveBeenCalled();
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.run).toMatchObject({ selectionOutcome: "held", errors: [{ code: "held", sourceId: null, message: "founding-or-independent-authority-missing" }] });
    expect(await readdir(path.join(root, "ventures/webdev-signal"))).toEqual(["runs"]);
  });

  it("does nothing for a dispatcher that is not the anchor the registration names", async () => {
    const root = await scratchRoot();
    const result = await runWebDevSignalDaily({ now: NOW, dry: true, root, dispatcherPhase: "mma-day" });
    expect(result).toMatchObject({ status: "not-anchored", run: null, runRef: null });
    await expect(readdir(path.join(root, "ventures"))).rejects.toThrow();
  });

  it("keeps yesterday's story out of today's selection through the cooldown, but still sees the window", async () => {
    const root = await scratchRoot();
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    const first = await runWebDevSignalDaily({ now: yesterday, dry: true, root });
    if (first.status !== "recorded") throw new Error("unreachable");
    expect(first.run.selectionOutcome).toBe("selected");
    const today = await runWebDevSignalDaily({ now: NOW, dry: true, root });
    if (today.status !== "recorded") throw new Error("unreachable");
    // The same three invented items arrive again, re-dated by the fixture so they count as updated
    // rather than new. Yesterday's winner is inside its own project cooldown, so the day picks the
    // next eligible story or none — never the same one.
    expect(today.run.counts).toMatchObject({ candidates: 3, new: 0, updated: 3, duplicate: 0 });
    const selection = WebDevSelectionSchema.parse(await json(root, today.run.selectionRef!));
    const previousWinner = WebDevSelectionSchema.parse(await json(root, first.run.selectionRef!)).selectedRecordId;
    expect(selection.selectedRecordId).not.toBe(previousWinner);
    expect(selection.candidates.find(({ recordId }) => recordId === previousWinner)?.gate).toBe("duplicate-recent-edition");
  }, 90_000);
});
