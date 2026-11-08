import sharp from "sharp";
import type { AmbientConfig } from "./config.js";
import type { GateModels } from "./gates.js";
import type { Renderer } from "./providers.js";

/**
 * Offline stand-ins for a local rehearsal (`AMBIENT_MOCK=true`, dry runs only) and the tests.
 * The renderer paints a seeded gradient with noise at the native size, so grading, hashing and
 * the format and duplicate gates run on real pixels; the model gates pass. It costs nothing and
 * reaches no network.
 */
export function mockRenderer(config: AmbientConfig): Renderer {
  return {
    name: "fal",
    model: "mock/gradient",
    estimateUsd: () => 0,
    async render(request) {
      const { width, height } = config.sizes[request.aspect];
      return {
        bytes: await gradient(width, height, request.seed),
        provider: "fal",
        model: "mock/gradient",
        seed: request.seed,
        flaggedNsfw: false,
        sourceRef: null
      };
    }
  };
}

export function mockGates(): GateModels {
  return { moderate: async () => [], inspect: async () => [] };
}

export async function gradient(width: number, height: number, seed: number): Promise<Buffer> {
  const hue = seed % 360;
  const angle = (seed >> 3) % 180;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
<stop offset="0" stop-color="hsl(${hue},55%,30%)"/><stop offset="1" stop-color="hsl(${(hue + 140) % 360},60%,72%)"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${(seed % 7) * 120 + 180}" cy="${(seed % 11) * 140 + 200}" r="${200 + (seed % 5) * 40}" fill="hsl(${(hue + 60) % 360},70%,55%)" opacity=".6"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
