import { describe, expect, it } from "vitest";
import { hasDeliveredPublishedEdition, manualEditionOverride } from "../src/cycle.js";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * The once-a-day edition guard, and the one thing that is allowed to step past it.
 *
 * Eighteen crons resolve to a phase, so without the guard a re-run publishes the same day twice.
 * With it, a manual dispatch — the owner at the keyboard asking for a new article — was refused
 * with NO_ACTION and no way to say otherwise.
 */

async function receiptRoot(receipt: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "edition-guard-"));
  await mkdir(path.join(root, "edition", "deliveries"), { recursive: true });
  await writeFile(path.join(root, "edition", "deliveries", "2026-08-03.json"), JSON.stringify(receipt));
  return root;
}

const DELIVERED = { status: "delivered", editionStatus: "edition", tags: ["ai"] };

describe("publishing a second edition on the same day", () => {
  it("is refused for a scheduled run that already delivered one", async () => {
    const root = await receiptRoot(DELIVERED);
    expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(true);
  });

  it("is allowed once the manual dispatch says so", async () => {
    const root = await receiptRoot(DELIVERED);
    const saved = process.env.CYCLE_FORCE_NEW_EDITION;
    process.env.CYCLE_FORCE_NEW_EDITION = "true";
    try {
      expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CYCLE_FORCE_NEW_EDITION;
      else process.env.CYCLE_FORCE_NEW_EDITION = saved;
    }
  });

  it("reads only an explicit true, so an unset or empty value keeps the guard", () => {
    expect(manualEditionOverride({})).toBe(false);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "" })).toBe(false);
    // GitHub renders a false boolean input as the string "false".
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "false" })).toBe(false);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "true" })).toBe(true);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "TRUE" })).toBe(true);
  });

  it("still returns false when nothing was delivered at all", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "edition-guard-empty-"));
    expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(false);
  });
});
