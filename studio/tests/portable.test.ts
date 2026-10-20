import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderDneskaiSlide, syntheticPhoto } from "../src/index.js";

/*
 * The package runs outside this repository (quorum#603, own-dashboard#117).
 *
 * OwnDashboard vendors the studio as built output. The runtime reads `../fonts` and
 * `../brand-kits` relative to its own modules, so `files` has to ship both beside `dist`, and
 * nothing in `dist` may reach back into the repository. Proved the hard way: the package is
 * compiled fresh into an empty directory, the fonts and only the caught-up kit are copied beside
 * it, and a separate Node process renders a slide from there. Its PNG must be the bytes the source
 * renders here.
 */

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = createRequire(path.join(studio, "package.json")).resolve("typescript/bin/tsc");

const SLIDE = {
  type: "figure",
  position: { index: 1, count: 5 },
  headline: "Slide vyrenderovaný mimo repozitář",
  body: "Jen dist, fonts a brand-kits/caught-up.",
  credit: "Graf: smyšlený zdroj"
} as const;

describe("the package outside the repository", () => {
  it("ships fonts and brand kits beside dist", () => {
    const manifest = JSON.parse(readFileSync(path.join(studio, "package.json"), "utf8")) as { files: string[] };
    expect(manifest.files).toEqual(expect.arrayContaining(["dist", "fonts", "brand-kits"]));
  });

  it("renders a DNESKAi slide from a directory holding only dist, fonts and brand-kits/caught-up", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "carousel-studio-"));
    try {
      execFileSync(process.execPath, [tsc, "-p", path.join(studio, "tsconfig.build.json"), "--outDir", path.join(directory, "dist")], { stdio: "pipe" });
      cpSync(path.join(studio, "fonts"), path.join(directory, "fonts"), { recursive: true });
      cpSync(path.join(studio, "brand-kits", "caught-up"), path.join(directory, "brand-kits", "caught-up"), { recursive: true });
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "vendored-studio", type: "module", private: true }));
      // The package's own dependencies (sharp, resvg, zod), as an installed copy would have them.
      symlinkSync(path.join(studio, "node_modules"), path.join(directory, "node_modules"), "dir");
      const script = [
        'const studio = await import("./dist/index.js");',
        "const bytes = await studio.syntheticPhoto(936, 560, 2);",
        `const result = await studio.renderDneskaiSlide({ ...${JSON.stringify(SLIDE)}, images: [{ slot: "image-1", bytes }] });`,
        "process.stdout.write(JSON.stringify({ status: result.status, pngHash: result.pngHash, problems: result.problems, fonts: studio.FONTS_DIRECTORY, kits: studio.BRAND_KITS_DIRECTORY }));"
      ].join("\n");
      const output = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: directory, encoding: "utf8" })) as {
        status: string; pngHash: string; problems: unknown[]; fonts: string; kits: string;
      };
      expect(output.fonts).toBe(path.join(directory, "fonts"));
      expect(output.kits).toBe(path.join(directory, "brand-kits"));
      expect(output.problems).toEqual([]);
      expect(output.status).toBe("rendered");
      const here = await renderDneskaiSlide({ ...SLIDE, images: [{ slot: "image-1", bytes: await syntheticPhoto(936, 560, 2) }] });
      expect(output.pngHash).toBe(here.pngHash);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
