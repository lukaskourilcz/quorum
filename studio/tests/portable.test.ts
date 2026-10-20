import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderDneskaiSlide } from "../src/index.js";
import { ACCEPTANCE_DECK, ACCEPTANCE_TEMPLATES, acceptanceAssets, materializeDeck } from "./fixtures/dneskai-acceptance-deck.js";

/*
 * The package runs outside this repository (quorum#603, own-dashboard#117).
 *
 * OwnDashboard vendors the studio as built output. The runtime reads `../fonts` and
 * `../brand-kits` relative to its own modules, so `files` has to ship both beside `dist`, and
 * nothing in `dist` may reach back into the repository. Proved the hard way: the package is
 * compiled fresh into an empty directory, the fonts and only the caught-up kit are copied beside
 * it, and a separate Node process renders the issue's whole acceptance deck there, twice. Every
 * PNG must be the bytes the source renders here.
 */

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = createRequire(path.join(studio, "package.json")).resolve("typescript/bin/tsc");

describe("the package outside the repository", () => {
  it("ships fonts and brand kits beside dist", () => {
    const manifest = JSON.parse(readFileSync(path.join(studio, "package.json"), "utf8")) as { files: string[] };
    expect(manifest.files).toEqual(expect.arrayContaining(["dist", "fonts", "brand-kits"]));
  });

  it("renders the seven-slide acceptance deck from a directory holding only dist, fonts and brand-kits/caught-up", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "carousel-studio-"));
    try {
      // The exact build `pnpm build` runs, into the empty directory. Not a copy of studio/dist:
      // that holds whatever the last build left there, which is not necessarily this source.
      execFileSync(process.execPath, [tsc, "-p", path.join(studio, "tsconfig.build.json"), "--outDir", path.join(directory, "dist")], { stdio: "pipe" });
      cpSync(path.join(studio, "fonts"), path.join(directory, "fonts"), { recursive: true });
      cpSync(path.join(studio, "brand-kits", "caught-up"), path.join(directory, "brand-kits", "caught-up"), { recursive: true });
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "vendored-studio", type: "module", private: true }));
      // The package's own dependencies (sharp, resvg, zod), as an installed copy would have them.
      symlinkSync(path.join(studio, "node_modules"), path.join(directory, "node_modules"), "dir");
      // The deck as data and its four assets as files: the process below holds nothing else.
      const assets = await acceptanceAssets();
      const input = path.join(directory, "input");
      mkdirSync(input);
      assets.forEach((bytes, index) => writeFileSync(path.join(input, `asset-${index}.png`), bytes));
      writeFileSync(path.join(input, "deck.json"), JSON.stringify(ACCEPTANCE_DECK));
      const script = [
        'import { readFileSync } from "node:fs";',
        'const studio = await import("./dist/index.js");',
        'const spec = JSON.parse(readFileSync("input/deck.json", "utf8"));',
        "const deck = spec.map(({ images, ...slide }) => ({ ...slide, ...(images ? { images: images.map(({ asset, ...image }) => ({ ...image, bytes: readFileSync(`input/asset-${asset}.png`) })) } : {}) }));",
        "const render = async () => { const out = []; for (const slide of deck) { const result = await studio.renderDneskaiSlide(slide); out.push({ status: result.status, template: result.template?.id ?? null, pngHash: result.pngHash, svgHash: result.svgHash, size: result.png ? [result.png.readUInt32BE(16), result.png.readUInt32BE(20)] : null, problems: result.problems.filter((entry) => entry.blocking) }); } return out; };",
        "const first = await render();",
        "const second = await render();",
        "process.stdout.write(JSON.stringify({ first, second, fonts: studio.FONTS_DIRECTORY, kits: studio.BRAND_KITS_DIRECTORY }));"
      ].join("\n");
      const output = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })) as {
        first: Array<{ status: string; template: string | null; pngHash: string | null; svgHash: string | null; size: [number, number] | null; problems: unknown[] }>;
        second: Array<{ pngHash: string | null }>;
        fonts: string;
        kits: string;
      };
      expect(output.fonts).toBe(path.join(directory, "fonts"));
      expect(output.kits).toBe(path.join(directory, "brand-kits"));
      expect(output.first.map((slide) => slide.template)).toEqual(ACCEPTANCE_TEMPLATES);
      for (const slide of output.first) {
        expect(slide.problems).toEqual([]);
        expect(slide.status).toBe("rendered");
        expect(slide.size).toEqual([1_080, 1_350]);
      }
      // Deterministic there, and the same bytes the source renders here.
      expect(output.second.map((slide) => slide.pngHash)).toEqual(output.first.map((slide) => slide.pngHash));
      const here = await Promise.all(materializeDeck(assets).map((slide) => renderDneskaiSlide(slide)));
      expect(output.first.map((slide) => slide.pngHash)).toEqual(here.map((result) => result.pngHash));
      expect(output.first.map((slide) => slide.svgHash)).toEqual(here.map((result) => result.svgHash));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 240_000);
});
