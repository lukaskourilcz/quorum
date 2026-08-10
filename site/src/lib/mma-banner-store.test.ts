import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { setMmaBannerEnabled, stageMmaBannerCreative } from "./mma-banner-store";

const roots: string[] = [];
const sourceRoot = path.resolve(process.cwd(), "..");

beforeEach(() => { vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("NODE_ENV", "test"); });
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mma-banner-admin-"));
  roots.push(root);
  await mkdir(path.join(root, "config"), { recursive: true });
  await cp(path.join(sourceRoot, "config", "mma-ad-slots.json"), path.join(root, "config", "mma-ad-slots.json"));
  await cp(
    path.join(sourceRoot, "state", "ventures", "mma-files", "banners"),
    path.join(root, "state", "ventures", "mma-files", "banners"),
    { recursive: true }
  );
  return root;
}

const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

describe("MMA banner admin staging", () => {
  it("crops an oversized upload to exact WebP pixels and re-hashes the whole contract", async () => {
    const root = await fixtureRoot();
    const oversized = await sharp({ create: { width: 1_200, height: 900, channels: 4, background: "#bb1818" } }).png().toBuffer();
    const result = await stageMmaBannerCreative({
      slotId: "infeed-rectangle",
      width: 300,
      height: 250,
      source: oversized,
      alt: "Reklamní sdělení",
      href: "https://example.com/campaign",
      enabled: true,
      now: new Date("2026-08-09T13:00:00.000Z")
    }, root);
    expect(result.commit).toBeNull();
    const creativePath = path.join(root, "state/ventures/mma-files/banners/payload/public/ads/infeed-rectangle-300x250.webp");
    const creative = await readFile(creativePath);
    const metadata = await sharp(creative).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 300, 250]);
    const contract = JSON.parse(await readFile(path.join(root, result.contractPath), "utf8")) as {
      files: Array<{ path: string; sha256: string; bytes: number }>;
      payloadHash: string;
      status: string;
      receiptRef: string | null;
    };
    expect(contract).toMatchObject({ status: "staged", receiptRef: null });
    for (const file of contract.files) {
      const bytes = await readFile(path.join(root, "state/ventures/mma-files/banners/payload", file.path));
      expect(bytes.byteLength).toBe(file.bytes);
      expect(digest(bytes)).toBe(file.sha256);
    }
    const aggregate = digest(Buffer.from([...contract.files].sort((left, right) => left.path.localeCompare(right.path)).map((file) => `${file.path}:${file.sha256}`).join("\n")));
    expect(contract.payloadHash).toBe(aggregate);
  });

  it("stages enabled toggles without losing a creative or another slot", async () => {
    const root = await fixtureRoot();
    const upload = await sharp({ create: { width: 600, height: 500, channels: 3, background: "#111111" } }).jpeg().toBuffer();
    await stageMmaBannerCreative({ slotId: "infeed-rectangle", width: 300, height: 250, source: upload, alt: "Reklama", href: null, enabled: false, now: new Date("2026-08-09T13:00:00.000Z") }, root);
    await setMmaBannerEnabled({ slotId: "infeed-rectangle", enabled: true, now: new Date("2026-08-09T13:05:00.000Z") }, root);
    const manifest = JSON.parse(await readFile(path.join(root, "state/ventures/mma-files/banners/payload/data/boardless/ads.json"), "utf8"));
    expect(Object.keys(manifest.slots)).toHaveLength(6);
    expect(manifest.slots["infeed-rectangle"]).toMatchObject({ enabled: true, image: { width: 300, height: 250 } });
    expect(manifest.slots["article-top"]).toMatchObject({ enabled: false, image: null });
  });

  it("refuses an off-contract size and refuses enabling an empty slot", async () => {
    const root = await fixtureRoot();
    const upload = await sharp({ create: { width: 600, height: 500, channels: 3, background: "#111111" } }).png().toBuffer();
    await expect(stageMmaBannerCreative({ slotId: "infeed-rectangle", width: 301, height: 250, source: upload, alt: "Reklama", href: null, enabled: true }, root)).rejects.toThrow(/does not belong/u);
    await expect(setMmaBannerEnabled({ slotId: "article-top", enabled: true }, root)).rejects.toThrow(/Upload a creative/u);
  });
});
