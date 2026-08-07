/**
 * Stage the devShark house banner for DNESKAi, and stop there.
 *
 * This writes the asset, the slot config and the delivery contract into quorum. It does not
 * deliver: a house banner on a reader site is a new outward-facing surface, so the first
 * placement waits on one HUMAN_APPROVAL item in state/INBOX.md. After that one approval the
 * existing App channel carries it within the recorded scope.
 *
 *   pnpm marketingshark:stage-banner
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertBannerIsInert,
  BANNER_SIZES,
  bannerSlotConfig,
  bannerSvg,
  MarketingSharkBannerContract,
  payloadHashOf,
  sha256
} from "../orchestrator/src/ventures/marketingshark/banner.js";
import { loadMarketingSharkConfig } from "../orchestrator/src/ventures/marketingshark/config.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const stagingRoot = path.join(repoRoot, "state", "ventures", "marketingshark", "banner");

async function main(): Promise<void> {
  const config = await loadMarketingSharkConfig();
  const brand = config.brands.find((candidate) => candidate.id === "devshark")!;
  if (!brand.banner) throw new Error("devShark's banner flag is off; nothing to stage");

  const creatives = (Object.keys(BANNER_SIZES) as Array<keyof typeof BANNER_SIZES>).map((size) => {
    const svg = bannerSvg(size);
    assertBannerIsInert(svg);
    const { width, height } = BANNER_SIZES[size];
    return { path: `public/images/banners/devshark-${width}x${height}.svg`, svg };
  });
  const slot = `${JSON.stringify(bannerSlotConfig(brand), null, 2)}\n`;

  const files = [
    ...creatives.map((creative) => ({
      path: creative.path,
      sha256: sha256(creative.svg),
      bytes: Buffer.byteLength(creative.svg)
    })),
    { path: "config/banner.json", sha256: sha256(slot), bytes: Buffer.byteLength(slot) }
  ];

  const contract = MarketingSharkBannerContract.parse({
    schemaVersion: "marketingshark-banner/1",
    brandId: "devshark",
    targetRepo: "lukaskourilcz/aifirst",
    // False, and checked rather than assumed: aifirst owns a banner-slot/1 config at
    // config/banner.json with the today-partner-belt slot, landed at 5a94146. An earlier version
    // of this script read a shallow clone taken hours before that commit, concluded the slot was
    // absent, and would have overwritten it with an incompatible flat object.
    fallbackSpec: false,
    files,
    payloadHash: payloadHashOf(files),
    humanApprovalRef: "INBOX:place-devshark-house-banner-on-dneskai",
    preparedAt: new Date().toISOString(),
    status: "staged",
    receiptRef: null
  });

  await mkdir(path.join(stagingRoot, "payload", "public", "images", "banners"), { recursive: true });
  await mkdir(path.join(stagingRoot, "payload", "config"), { recursive: true });
  for (const creative of creatives) {
    await writeFile(path.join(stagingRoot, "payload", creative.path), creative.svg, "utf8");
  }
  await writeFile(path.join(stagingRoot, "payload", "config", "banner.json"), slot, "utf8");
  await writeFile(path.join(stagingRoot, "contract.json"), `${JSON.stringify(contract, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    staged: path.relative(repoRoot, stagingRoot),
    payloadHash: contract.payloadHash,
    files: files.map((file) => `${file.path} (${file.bytes} bytes)`),
    delivered: false,
    waitingOn: contract.humanApprovalRef
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
