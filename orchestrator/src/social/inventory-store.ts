import { SocialInventoryBuildReceiptSchema, SocialProfileInventorySchema } from "../contracts/social-inventory.js";
import { atomicWriteJson, withFileLock } from "../state.js";
import type { SocialInventoryBuildResult } from "./inventory.js";

export async function writeSocialInventoryBuild(stateRoot: string, result: SocialInventoryBuildResult): Promise<void> {
  const inventory = SocialProfileInventorySchema.parse(result.inventory);
  const receipt = SocialInventoryBuildReceiptSchema.parse(result.receipt);
  if (inventory.profileId !== receipt.profileId || inventory.inputHash !== receipt.inputHash) {
    throw new Error("Inventory and build receipt do not share the exact profile/input binding");
  }
  await withFileLock(stateRoot, `social/inventory/${inventory.profileId}/writer.lock`, async () => {
    await Promise.all([
      atomicWriteJson(stateRoot, `social/inventory/${inventory.profileId}/current.json`, inventory),
      atomicWriteJson(stateRoot, `social/inventory/${inventory.profileId}/${inventory.horizonStart}.json`, inventory),
      atomicWriteJson(stateRoot, `social/inventory-receipts/${receipt.id}.json`, receipt),
      ...result.incidents.map((incident) => atomicWriteJson(stateRoot, `social/inventory-incidents/${incident.id}.json`, incident))
    ]);
  });
}
