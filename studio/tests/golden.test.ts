import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  GOLDEN_FAMILIES,
  GOLDEN_MAX_CHANGED_FRACTION,
  compareGolden,
  goldenPath,
  renderGolden
} from "./golden-fixture.js";

/**
 * The committed goldens, one per family, against a fresh render through the real renderer and
 * resvg. A family whose pixels drift past the tolerance fails by name with the measured share, so
 * the failure says which composition moved and by how much rather than that "something changed".
 *
 * A deliberate composition change regenerates the goldens in the same commit with
 * `pnpm -C studio golden:update`; the tolerance is never the thing to loosen.
 */
describe("the golden images", () => {
  for (const family of GOLDEN_FAMILIES) {
    it(`${family} still renders its golden`, async () => {
      const golden = await readFile(goldenPath(family)).catch(() => null);
      expect(golden, `${family} has no golden; run pnpm -C studio golden:update and commit it`).not.toBeNull();
      const comparison = await compareGolden(await renderGolden(family), golden!);
      expect(comparison.sizeMismatch, `${family} changed size: ${comparison.sizeMismatch}`).toBeNull();
      expect(
        comparison.fraction,
        `${family} drifted: ${comparison.changed} of ${comparison.total} pixels (${(comparison.fraction * 100).toFixed(3)} %) differ by more than the tolerance`
      ).toBeLessThanOrEqual(GOLDEN_MAX_CHANGED_FRACTION);
    });
  }
});
