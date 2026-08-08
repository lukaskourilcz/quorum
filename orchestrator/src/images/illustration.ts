import { readFile } from "node:fs/promises";
import path from "node:path";
import { ArticleImageSchema, type ArticleImage } from "../contracts/autonomy.js";
import { configRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";
import { illustrationAltCs } from "./alt.js";
import { webpVariant } from "./licensed.js";
import type { VisualBrief } from "./visual-brief.js";

/**
 * The rung between the licensed search and the FRAME plate: a picture nobody photographed.
 *
 * It exists because the archives are finite. Some days no licensed photograph illustrates the
 * story and the honest answer has been a drawn plate of coloured bars — correct, and not much of
 * a cover. What runs here instead is an abstract editorial illustration in the magazine's own
 * visual language, rendered fresh for the article's own subject matter.
 *
 * Three rules make that honest rather than a shortcut.
 *
 * It is never presented as photography. The alt text says it is an illustration and not a
 * photograph, in Czech, in the sentence a screen-reader user hears; the licence block names
 * BoardlessAI rather than a photographer; and `origin` is its own value, which the package
 * schema ties to that licence in both directions.
 *
 * It passes the same gate as everything else, in `generated` mode. Looking rendered is not held
 * against it — it is one, and it says so — but text in the frame, a recognisable human face or
 * drifting off the brief kill it exactly as they would kill a photograph.
 *
 * It is bounded before it is attempted. Two renders a day across both magazines, inside the same
 * ten-cent daily cap the gate spends from, and a render that the gate then refuses still counts:
 * the money was spent whether or not the picture was used, so the counter has to see it.
 */

const API_HOST = "fal.run";
/** Where the renderer serves its output. Fixed here, never taken from the response. */
const OUTPUT_HOSTS = ["fal.media", "v3.fal.media", "v3b.fal.media"];

/** 16:9 at about one megapixel, which is the hero's aspect and rather more than its 1600x900. */
export const ILLUSTRATION_WIDTH = 1_344;
export const ILLUSTRATION_HEIGHT = 768;

/**
 * What one render costs, as a fixed estimate rather than a measurement.
 *
 * The renderer bills per megapixel and returns no cost in its response, so there is nothing to
 * read back. The ledger carries this figure, and it is deliberately the published rate rounded
 * up: an estimate that under-reports is a cap that does not hold.
 */
export const ILLUSTRATION_USD_PER_IMAGE = 0.004;

/**
 * The house style, one per magazine, with the prohibitions that make the gate's job easier.
 *
 * The negatives are not decoration. DNESKAi's design contract bans the glowing circuit-board
 * brain and one shipped anyway; naming it here is cheaper than catching it downstream. Faces and
 * lettering are named on both because those are the two failures the gate is strictest about.
 */
export const ILLUSTRATION_STYLE: Readonly<Record<"caught-up" | "mma-files", string>> = {
  "caught-up": [
    "Abstract editorial illustration for a technology briefing.",
    "Precise instrument-panel geometry, thin light lines on a near-black ground,",
    "electric blueprint-blue accent, subtle paper grain.",
    "Subject matter: {subject}.",
    "Strictly no text, no letters, no logos, no human faces, no robots, no brains,",
    "no circuit boards, no glowing gradients."
  ].join(" "),
  "mma-files": [
    "Atmospheric editorial illustration for a fighting-sports magazine.",
    "Arena light through haze, canvas and cage textures, ember orange accent on deep charcoal.",
    "Subject matter: {subject}.",
    "Strictly no text, no letters, no logos, no recognisable faces,",
    "no depictions of real fighters."
  ].join(" ")
};

export function illustrationPrompt(venture: "caught-up" | "mma-files", brief: VisualBrief): string {
  // The desk's own phrases, which have already been checked for names, non-ASCII and length.
  // Nothing else from the article travels: a renderer given a headline would try to draw it.
  const subject = brief.phrases.slice(0, 3).join(", ");
  return ILLUSTRATION_STYLE[venture].replace("{subject}", subject || "abstract editorial subject");
}

/**
 * Whether the rung runs at all.
 *
 * Both, not either. A key with no flag is an account somebody set up and has not decided about;
 * a flag with no key cannot render anything. Absent either, the rung is skipped in silence and
 * the ladder behaves exactly as it did before this file existed — which is what every keyless
 * environment, including a local checkout, will see.
 */
export function illustrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.FAL_KEY) && env.ARTICLE_ILLUSTRATION_ENABLED === "true";
}

export interface RenderedIllustration {
  bytes: Uint8Array;
  /** What the renderer was asked for, so the run report can say what was attempted. */
  prompt: string;
}

export type IllustrationRenderer = (input: {
  prompt: string;
  model: string;
  apiKey: string;
}) => Promise<RenderedIllustration>;

let cachedModel: string | null = null;

/** The renderer's endpoint id, from config. Never written into code or anything a reader sees. */
export async function illustrationModel(): Promise<string> {
  if (cachedModel) return cachedModel;
  const raw = await readFile(path.join(configRoot, "models.json"), "utf8");
  const parsed = JSON.parse(raw) as { roles?: Record<string, { model?: string }> };
  const model = parsed.roles?.ARTICLE_ILLUSTRATION?.model;
  if (!model) throw new Error("config/models.json has no ARTICLE_ILLUSTRATION route");
  cachedModel = model;
  return model;
}

/**
 * One render, through the REST endpoint, with the same fetch posture as every other host here.
 *
 * The output URL comes back in the response, which is why the download allowlist is fixed in
 * this file rather than taken from it: a compromised or hostile answer could otherwise point the
 * downloader anywhere. A host that is not on the list costs the picture.
 */
export const defaultIllustrationRenderer: IllustrationRenderer = async (input) => {
  const response = await safeFetch(`https://${API_HOST}/${input.model}`, {
    allowHosts: [API_HOST],
    method: "POST",
    headers: {
      Authorization: `Key ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: { width: ILLUSTRATION_WIDTH, height: ILLUSTRATION_HEIGHT },
      num_images: 1,
      enable_safety_checker: true,
      output_format: "jpeg"
    }),
    maxBytes: 200_000,
    timeoutMs: 60_000
  });
  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    images?: Array<{ url?: unknown }>;
  };
  const url = typeof payload.images?.[0]?.url === "string" ? payload.images[0].url : "";
  if (!url) throw new Error("the renderer returned no image");
  const image = await safeFetch(url, {
    allowHosts: OUTPUT_HOSTS,
    maxBytes: 12_000_000,
    timeoutMs: 30_000
  });
  if (!image.contentType.startsWith("image/")) throw new Error("the rendered asset is not an image");
  return { bytes: image.body, prompt: input.prompt };
};

/**
 * The rendered bytes, turned into the hero and thumbnail an article package carries.
 *
 * `attention` is the right crop anchor here: there is no face to keep in frame, by construction,
 * and the renderer puts the composition wherever it likes inside the 16:9.
 */
export async function illustrationImage(input: {
  bytes: Uint8Array;
  venture: "caught-up" | "mma-files";
  slug: string;
  sceneCs: string;
}): Promise<ArticleImage> {
  const [hero, thumb] = await Promise.all([
    webpVariant(input.bytes, 1_600, 900, 800_000, "attention"),
    webpVariant(input.bytes, 640, 360, 300_000, "attention")
  ]);
  const safeSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
  const directory = input.venture === "caught-up" ? "editions" : "articles";
  return ArticleImageSchema.parse({
    hero_path: `public/images/${directory}/${safeSlug}/hero.webp`,
    thumb_path: `public/images/${directory}/${safeSlug}/thumb.webp`,
    width: 1_600,
    height: 900,
    alt_cs: illustrationAltCs(input.sceneCs),
    license: {
      name: "BoardlessAI illustration",
      author: "BoardlessAI FRAME",
      source_url: "https://boardless-ai.vercel.app/",
      attribution_html: "Ilustrace: BoardlessAI FRAME"
    },
    origin: "illustration",
    hero_bytes_base64: Buffer.from(hero).toString("base64"),
    thumb_bytes_base64: Buffer.from(thumb).toString("base64")
  });
}
