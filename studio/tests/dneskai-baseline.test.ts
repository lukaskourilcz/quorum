import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderDneskaiSlide, type DneskaiSlideInput } from "../src/index.js";
import { ACCEPTANCE_TEMPLATES, acceptanceDeck } from "./fixtures/dneskai-acceptance-deck.js";
import { editorialTemplatesSha256, receiptFrames } from "./fixtures/dneskai-receipt-matrix.js";

/*
 * The receipts of the DNESKAi editorial output, recorded from the code before the kit work began
 * (docs/design-lab/dneskai-kits/ADR.md §10): the acceptance deck's seven PNG hashes, the laid-out
 * frames of every flowed template across the string and picture matrix, and the sha256 of the
 * composed templates. The golden file pins eleven slides; these pin the layout arithmetic frame
 * by frame, so a refactor that moves one frame fails here with the frame named.
 */

const receipts = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "dneskai-receipts.json"), "utf8")) as {
  acceptancePngHashes: string[];
  editorialTemplatesSha256: string;
  frames: Record<string, unknown>;
};

const variants: Array<[string, (input: DneskaiSlideInput) => DneskaiSlideInput]> = [["no kit", (input) => input], ["editorial", (input) => ({...input,kit:"editorial"})]];

describe("the DNESKAi editorial receipts", () => {
  it("composes the editorial templates to the recorded bytes", () => {
    expect(editorialTemplatesSha256()).toBe(receipts.editorialTemplatesSha256);
  });

  it("lays out every flowed template to the recorded frames", () => {
    const frames = receiptFrames();
    expect(Object.keys(frames)).toEqual(Object.keys(receipts.frames));
    for (const [key, expected] of Object.entries(receipts.frames)) expect(frames[key], key).toEqual(expected);
  });

  it.each(variants)("renders the acceptance deck to the recorded PNG hashes (%s)", async (_name, dress) => {
    const deck = await acceptanceDeck();
    const hashes: Array<string | null> = [];
    for (const [index, slide] of deck.entries()) {
      const result = await renderDneskaiSlide(dress(slide));
      expect(result.template?.id).toBe(ACCEPTANCE_TEMPLATES[index]);
      hashes.push(result.pngHash);
    }
    expect(hashes).toEqual(receipts.acceptancePngHashes);
  }, 120_000);
});
