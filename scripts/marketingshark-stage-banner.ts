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

  const svg = bannerSvg();
  assertBannerIsInert(svg);
  const slot = `${JSON.stringify(bannerSlotConfig(brand), null, 2)}\n`;

  const files = [
    { path: "public/banners/devshark.svg", sha256: sha256(svg), bytes: Buffer.byteLength(svg) },
    { path: "config/banner.json", sha256: sha256(slot), bytes: Buffer.byteLength(slot) }
  ];

  const contract = MarketingSharkBannerContract.parse({
    schemaVersion: "marketingshark-banner/1",
    brandId: "devshark",
    targetRepo: "lukaskourilcz/aifirst",
    // Verified at aifirst e5e9b4f: config/ holds board-changelog.json and topics.yml and no
    // banner slot, so this payload supplies one. A slot that lands there later wins.
    fallbackSpec: true,
    files,
    payloadHash: payloadHashOf(files),
    humanApprovalRef: "INBOX:place-devshark-house-banner-on-dneskai",
    preparedAt: new Date().toISOString(),
    status: "staged",
    receiptRef: null
  });

  await mkdir(path.join(stagingRoot, "payload", "public", "banners"), { recursive: true });
  await mkdir(path.join(stagingRoot, "payload", "config"), { recursive: true });
  await writeFile(path.join(stagingRoot, "payload", "public", "banners", "devshark.svg"), svg, "utf8");
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
