import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveReferences, runReservedReferences, referencePosts, referenceFormat } from "../src/sources/social-references.js";
import { configRoot } from "../src/paths.js";
import { readJson } from "../src/state.js";
const roots: string[] = [];
const now = new Date("2026-09-27T08:00:00Z");
const rows = ["evolving.ai", "activeprogrammer"].map((ownerUsername, index) => ({ ownerUsername, shortCode: `post${index}`, timestamp: now.toISOString(), caption: "A short question?\nDetails.", childPosts: [{}, {}, {}], password: "never retained" }));
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), "references-")); roots.push(value); return value; }
afterEach(async () => { await Promise.all(roots.splice(0).map(value => rm(value, { force: true, recursive: true }))); });
describe("bounded public reference polling", () => {
  it("refuses unknown credit, missing tokens and repeat windows before paid calls", async () => {
    const base = { root: await root(), now, token: "fixture", usage: async () => 0 };
    expect((await reserveReferences({ ...base, token: "" })).ready).toBe(false);
    expect((await reserveReferences({ ...base, usage: async () => null })).ready).toBe(false);
    expect((await reserveReferences({ ...base, usage: async () => 19 })).ready).toBe(false);
    expect((await reserveReferences(base)).ready).toBe(true);
    expect((await reserveReferences(base)).ready).toBe(false);
  });
  it("deduplicates known posts, keeps only metrics and expires Design Lab hints", async () => {
    const base = { root: await root(), now, token: "fixture", usage: async () => 0 };
    await reserveReferences(base);
    expect(await runReservedReferences({ ...base, run: async () => rows })).toEqual({ observed: 2, newPosts: 2 });
    expect(await referenceFormat(base.root, configRoot, now)).toEqual({ carouselLed: true, shortCaptions: true });
    expect(await referenceFormat(base.root, configRoot, new Date("2026-10-10T00:00:00Z"))).toBeNull();
    const next = { ...base, now: new Date(now.getTime() + 6 * 3600_000) };
    await reserveReferences(next);
    expect(await runReservedReferences({ ...next, run: async () => rows })).toEqual({ observed: 2, newPosts: 0 });
    const retained = JSON.stringify(await readJson(base.root, "goviral/reference-monitor/latest.json", null));
    expect(retained).not.toContain("password"); expect(retained).not.toContain("Details");
    expect(referencePosts([{ ...rows[0], ownerUsername: "someone-else" }])).toEqual([]);
  });
  it("retains its spending reservation after provider failure and refuses a reused run", async () => {
    const base = { root: await root(), now, token: "fixture", usage: async () => 0 };
    await reserveReferences(base);
    const run = vi.fn(async () => { throw new Error("provider error with credentials"); });
    await expect(runReservedReferences({ ...base, run })).rejects.toThrow("reservation were retained");
    await expect(runReservedReferences({ ...base, run })).rejects.toThrow("No current reference reservation");
    expect(run).toHaveBeenCalledTimes(1);
    expect(await readJson(base.root, "goviral/reference-monitor/quota.json", null)).toMatchObject({ reservedUsd: 0.03, status: "failed", pending: false });
  });
});
