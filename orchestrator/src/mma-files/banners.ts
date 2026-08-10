import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { configRoot, stateRoot } from "../paths.js";
import { readJson } from "../state.js";
import { canonicalJson, sha256 } from "./hash.js";

export const MMA_BANNER_CONTRACT_PATH = "ventures/mma-files/banners/contract.json";
export const MMA_BANNER_MANIFEST_PATH = "data/boardless/ads.json";
export const MMA_BANNER_ALLOWED_PATH = /^((data\/boardless\/ads\.json)|(public\/ads\/[a-z0-9-]+-\d+x\d+\.webp))$/u;

const DimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

const AdSlotSpecificationSchema = z.object({
  schemaVersion: z.literal("mma-ad-slots/1"),
  source: z.string().min(1).optional(),
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  slots: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/u),
    desktop: DimensionsSchema.extend({ variants: z.array(DimensionsSchema) }).strict(),
    mobile: DimensionsSchema.nullable(),
    pages: z.array(z.string().min(1)).min(1)
  }).strict()).min(1)
}).strict();

const StagedAdImageSchema = z.object({
  src: z.string().regex(/^\/ads\/[a-z0-9-]+-\d+x\d+\.webp$/u),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

const StagedAdSlotSchema = z.object({
  enabled: z.boolean(),
  image: StagedAdImageSchema.nullable(),
  alt: z.string().max(300),
  href: z.string().url().refine((value) => value.startsWith("https://"), "ad links must use HTTPS").nullable()
}).strict();

export const StagedMmaAdsManifestSchema = z.object({
  schemaVersion: z.literal("mma-ads/1"),
  updatedAt: z.iso.datetime({ offset: true }),
  slots: z.record(z.string(), StagedAdSlotSchema)
}).strict();
export type StagedMmaAdsManifest = z.infer<typeof StagedMmaAdsManifestSchema>;

const DeliveryAdSlotSchema = StagedAdSlotSchema.extend({
  image: StagedAdImageSchema.extend({ bytes_base64: z.string().min(1) }).strict().nullable()
}).strict();

export const MmaAdsDeliverySchema = z.object({
  schemaVersion: z.literal("mma-ads/1"),
  updatedAt: z.iso.datetime({ offset: true }),
  slots: z.record(z.string(), DeliveryAdSlotSchema)
}).strict();
export type MmaAdsDelivery = z.infer<typeof MmaAdsDeliverySchema>;

const ContractFileSchema = z.object({
  path: z.string().refine((value) => MMA_BANNER_ALLOWED_PATH.test(value), "banner payload path is not allowlisted"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive()
}).strict();

export const MmaFilesBannerContractSchema = z.object({
  schemaVersion: z.literal("mma-files-banner/1"),
  targetRepo: z.literal("lukaskourilcz/mma-files"),
  files: z.array(ContractFileSchema).min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  preparedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["staged", "delivered"]),
  receiptRef: z.string().min(1).nullable()
}).strict().superRefine((contract, context) => {
  const paths = contract.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", message: "banner contract paths must be unique", path: ["files"] });
  }
  if (paths.filter((value) => value === MMA_BANNER_MANIFEST_PATH).length !== 1) {
    context.addIssue({ code: "custom", message: "banner contract needs exactly one ad manifest", path: ["files"] });
  }
  if ((contract.status === "staged") !== (contract.receiptRef === null)) {
    context.addIssue({ code: "custom", message: "only a delivered contract may name a receipt", path: ["receiptRef"] });
  }
});
export type MmaFilesBannerContract = z.infer<typeof MmaFilesBannerContractSchema>;

export interface ComposedMmaBanner {
  contract: MmaFilesBannerContract;
  delivery: MmaAdsDelivery;
  packageHash: string;
}

export function mmaBannerPayloadHash(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  return sha256([...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}:${file.sha256}`)
    .join("\n"));
}

export function mmaAdsPackageHash(delivery: MmaAdsDelivery): string {
  return sha256(canonicalJson(delivery));
}

async function slotSpecifications(slotSpecPath: string) {
  const parsed = AdSlotSpecificationSchema.parse(JSON.parse(await readFile(slotSpecPath, "utf8")));
  const { source: _source, sourceContentHash, ...sourceContent } = parsed;
  if (sourceContentHash && sha256(canonicalJson(sourceContent)) !== sourceContentHash) {
    throw new Error("Vendored MMA ad slots differ from their pinned source content hash");
  }
  if (new Set(parsed.slots.map((slot) => slot.id)).size !== parsed.slots.length) {
    throw new Error("MMA ad slot ids must be unique");
  }
  return parsed.slots;
}

function allowedDimensions(slot: z.infer<typeof AdSlotSpecificationSchema>["slots"][number]) {
  return [slot.desktop, ...slot.desktop.variants, ...(slot.mobile ? [slot.mobile] : [])];
}

export async function composeMmaBanner(
  root = stateRoot,
  slotSpecPath = path.join(configRoot, "mma-ad-slots.json")
): Promise<ComposedMmaBanner> {
  const contract = MmaFilesBannerContractSchema.parse(await readJson(root, MMA_BANNER_CONTRACT_PATH, null));
  if (contract.status !== "staged") throw new Error("MMA banner contract is not staged");
  if (contract.payloadHash !== mmaBannerPayloadHash(contract.files)) {
    throw new Error("MMA banner payload hash differs from its contract");
  }

  const payloadRoot = path.join(root, "ventures", "mma-files", "banners", "payload");
  const bytesByPath = new Map<string, Buffer>();
  for (const file of contract.files) {
    const bytes = await readFile(path.join(payloadRoot, file.path));
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`MMA banner payload file differs from its contract: ${file.path}`);
    }
    bytesByPath.set(file.path, bytes);
  }

  const manifestBytes = bytesByPath.get(MMA_BANNER_MANIFEST_PATH);
  if (!manifestBytes) throw new Error("MMA banner manifest is absent from the staged payload");
  const manifest = StagedMmaAdsManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  const specifications = await slotSpecifications(slotSpecPath);
  const expectedIds = specifications.map((slot) => slot.id).sort();
  const actualIds = Object.keys(manifest.slots).sort();
  if (canonicalJson(actualIds) !== canonicalJson(expectedIds)) {
    throw new Error("MMA banner manifest must carry every shared slot exactly once");
  }

  const deliverySlots: MmaAdsDelivery["slots"] = {};
  for (const specification of specifications) {
    const slot = manifest.slots[specification.id];
    if (!slot) throw new Error(`MMA banner slot is missing: ${specification.id}`);
    if (!slot.image) {
      if (slot.enabled) throw new Error(`MMA banner slot ${specification.id} cannot be enabled without an image`);
      deliverySlots[specification.id] = { ...slot, image: null };
      continue;
    }
    if (!allowedDimensions(specification).some((size) => size.width === slot.image?.width && size.height === slot.image?.height)) {
      throw new Error(`MMA banner slot ${specification.id} uses dimensions outside the shared slot specification`);
    }
    const expectedSrc = `/ads/${specification.id}-${slot.image.width}x${slot.image.height}.webp`;
    if (slot.image.src !== expectedSrc) throw new Error(`MMA banner slot ${specification.id} has a non-canonical image path`);
    if (!slot.alt.trim()) throw new Error(`MMA banner slot ${specification.id} needs alt text`);
    const assetPath = `public${expectedSrc}`;
    const bytes = bytesByPath.get(assetPath);
    if (!bytes) throw new Error(`MMA banner creative is absent from the staged payload: ${assetPath}`);
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "webp" || metadata.width !== slot.image.width || metadata.height !== slot.image.height) {
      throw new Error(`MMA banner creative pixels differ from the manifest: ${assetPath}`);
    }
    deliverySlots[specification.id] = {
      ...slot,
      image: { ...slot.image, bytes_base64: bytes.toString("base64") }
    };
  }

  const delivery = MmaAdsDeliverySchema.parse({ ...manifest, slots: deliverySlots });
  return { contract, delivery, packageHash: mmaAdsPackageHash(delivery) };
}
