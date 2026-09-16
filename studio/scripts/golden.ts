import { mkdir, writeFile } from "node:fs/promises";
import { GOLDEN_DIRECTORY, GOLDEN_FAMILIES, goldenPath, renderGolden } from "../tests/golden-fixture.js";

/**
 * Regenerate the golden images the golden test compares against.
 *
 * Run it when a family's composition changes on purpose, and commit the new goldens in the same
 * commit as the composer. Run on an unchanged library it rewrites the same bytes: the renderer is
 * deterministic and its fonts are committed inputs.
 */
await mkdir(GOLDEN_DIRECTORY, { recursive: true });
for (const family of GOLDEN_FAMILIES) {
  const png = await renderGolden(family);
  await writeFile(goldenPath(family), png);
  console.log(`${family}: ${png.byteLength} bytes → ${goldenPath(family)}`);
}
