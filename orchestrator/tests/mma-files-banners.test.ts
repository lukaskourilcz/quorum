import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { configRoot, stateRoot } from "../src/paths.js";
import { atomicWriteJson } from "../src/state.js";
import {
  composeMmaBanner,
  MMA_BANNER_CONTRACT_PATH,
  MMA_BANNER_MANIFEST_PATH,
  mmaBannerPayloadHash,
  MmaFilesBannerContractSchema,
  type StagedMmaAdsManifest
} from "../src/mma-files/banners.js";
import { canonicalJson, sha256 } from "../src/mma-files/hash.js";

const slotSpecPath = path.join(configRoot, "mma-ad-slots.json");

async function emptySlots(): Promise<StagedMmaAdsManifest["slots"]> {
  const specification = JSON.parse(await readFile(slotSpecPath, "utf8")) as {
    slots: Array<{ id: string }>;
  };
  return Object.fromEntries(specification.slots.map((slot) => [
    slot.id,
    { enabled: false, image: null, alt: "", href: null }
  ])) as StagedMmaAdsManifest["slots"];
}

async function stageFixture(root: string) {
  const slots = await emptySlots();
  const creative = await sharp({
    create: { width: 300, height: 250, channels: 4, background: "#0b0b0c" }
  }).webp().toBuffer();
  slots["infeed-rectangle"] = {
    enabled: true,
    image: { src: "/ads/infeed-rectangle-300x250.webp", width: 300, height: 250 },
    alt: "Reklamní sdělení",
    href: "https://example.com/"
  };
  const manifest = Buffer.from(`${JSON.stringify({
    schemaVersion: "mma-ads/1",
    updatedAt: "2026-08-09T12:00:00.000Z",
    slots
  }, null, 2)}\n`);
  const files = [
    { path: MMA_BANNER_MANIFEST_PATH, bytes: manifest },
    { path: "public/ads/infeed-rectangle-300x250.webp", bytes: creative }
  ];
  for (const file of files) {
    const target = path.join(root, "ventures", "mma-files", "banners", "payload", file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
  const contracted = files.map((file) => ({
    path: file.path,
    sha256: sha256(file.bytes),
    bytes: file.bytes.byteLength
  }));
  await atomicWriteJson(root, MMA_BANNER_CONTRACT_PATH, {
    schemaVersion: "mma-files-banner/1",
    targetRepo: "lukaskourilcz/mma-files",
    files: contracted,
    payloadHash: mmaBannerPayloadHash(contracted),
    preparedAt: "2026-08-09T12:00:00.000Z",
    status: "staged",
    receiptRef: null
  });
  return files;
}

describe("MMA Files banner staging", () => {
  it("keeps the vendored slot contract pinned to the MMA Files source", async () => {
    const raw = JSON.parse(await readFile(slotSpecPath, "utf8")) as Record<string, unknown>;
    const { source: _source, sourceContentHash, ...sourceContent } = raw;
    expect(sourceContentHash).toBe("c66a2c8475f4b4065b705fb16c4d1bb3cb598fcfa18f24002c967d29e1309b13");
    expect(sha256(canonicalJson(sourceContent))).toBe(sourceContentHash);
  });

  it("ships an inert six-slot baseline through a staged, hashed contract", async () => {
    const composed = await composeMmaBanner(stateRoot);
    expect(composed.contract.status).toBe("staged");
    expect(Object.keys(composed.delivery.slots)).toHaveLength(6);
    expect(Object.values(composed.delivery.slots).every((slot) => !slot.enabled && slot.image === null)).toBe(true);
    expect(composed.packageHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("validates staged hashes, slot dimensions and real creative pixels", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-banner-stage-"));
    await stageFixture(root);
    const composed = await composeMmaBanner(root);
    expect(composed.delivery.slots["infeed-rectangle"]?.image).toMatchObject({
      src: "/ads/infeed-rectangle-300x250.webp",
      width: 300,
      height: 250
    });
    expect(composed.delivery.slots["infeed-rectangle"]?.image).toHaveProperty("bytes_base64");
  });

  it("refuses a tampered payload before it can become a delivery", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-banner-tamper-"));
    const files = await stageFixture(root);
    const creative = files.find((file) => file.path.startsWith("public/ads/"))!;
    await writeFile(
      path.join(root, "ventures", "mma-files", "banners", "payload", creative.path),
      Buffer.concat([creative.bytes, Buffer.from("tampered")])
    );
    await expect(composeMmaBanner(root)).rejects.toThrow(/differs from its contract/u);
  });

  it("rejects contract paths outside the exact target allowlist", () => {
    expect(MmaFilesBannerContractSchema.safeParse({
      schemaVersion: "mma-files-banner/1",
      targetRepo: "lukaskourilcz/mma-files",
      files: [{ path: "public/ads/../escape.webp", sha256: "a".repeat(64), bytes: 10 }],
      payloadHash: "b".repeat(64),
      preparedAt: "2026-08-09T12:00:00.000Z",
      status: "staged",
      receiptRef: null
    }).success).toBe(false);
  });
});
