import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { treatImage } from "../src/renderer.js";

describe("photographic treatments", () => {
  it.each([3, 4] as const)("tints a %i-channel image without expanding a greyscale band in linear", async channels => {
    const source = await sharp({ create: { width: 2, height: 2, channels, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } }).png().toBuffer();
    const output = await treatImage(source, "duotone", "#804020");
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(channels);
    expect([...data.subarray(0, 3)]).toEqual([128, 64, 32]);
    if (channels === 4) expect(data[3]).toBe(128);
  });
});
