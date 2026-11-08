import sharp from "sharp";
import type { AmbientConfig, Aspect, Shot } from "./config.js";
import { boundedFetch, parseJson, type Fetcher } from "./http.js";
import { frameSeed } from "./providers.js";

/**
 * Stock photos enter only as image-to-image seeds at a strength of 0.75 or more, which keeps the
 * geometry of a landmark and replaces the pixels. A Pexels café posted as it is would be one
 * reverse image search away from "this account is fake"; a restyled one is not the same picture.
 *
 * Candidates whose own description mentions a person are dropped before download. The face gate
 * still runs on what the renderer makes of the seed, so this is a saving, not the guard.
 */
const PERSON_WORDS = /\b(man|men|woman|women|people|person|girl|boy|child|children|kid|face|portrait|couple|tourist|crowd|selfie|model)s?\b/iu;

export interface StockEnv {
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
}

interface Candidate {
  url: string;
  ref: string;
  description: string;
}

export async function stockSeed(input: {
  shot: Shot;
  aspect: Aspect;
  date: string;
  config: AmbientConfig;
  env: StockEnv;
  fetcher?: Fetcher;
}): Promise<{ bytes: Uint8Array; strength: number; ref: string } | null> {
  const seed = input.shot.stockSeed;
  if (!seed) return null;
  const candidates =
    seed.source === "pexels"
      ? await pexels(seed.query, input.config, input.env.PEXELS_API_KEY, input.fetcher)
      : await pixabay(seed.query, input.config, input.env.PIXABAY_API_KEY, input.fetcher);
  const usable = candidates.filter((candidate) => !PERSON_WORDS.test(candidate.description));
  if (usable.length === 0) return null;
  const chosen = usable[frameSeed(input.date, input.shot.id) % usable.length]!;
  const hosts = input.config.stock[seed.source].imageHosts;
  const image = await boundedFetch(chosen.url, { allowHosts: hosts, maxBytes: 15_000_000, timeoutMs: 30_000, fetcher: input.fetcher });
  const { width, height } = input.config.sizes[input.aspect];
  const bytes = await sharp(image.body).rotate().resize(width, height, { fit: "cover", kernel: "lanczos3" }).jpeg({ quality: 88 }).toBuffer();
  return { bytes, strength: seed.strength, ref: chosen.ref };
}

async function pexels(query: string, config: AmbientConfig, key: string | undefined, fetcher?: Fetcher): Promise<Candidate[]> {
  if (!key) return [];
  const host = config.stock.pexels.host;
  const url = `https://${host}/v1/search?${new URLSearchParams({ query, orientation: "portrait", per_page: "15" })}`;
  const response = await boundedFetch(url, { allowHosts: [host], headers: { Authorization: key }, maxBytes: 2_000_000, timeoutMs: 20_000, fetcher });
  const payload = parseJson(response.body) as { photos?: Array<{ id?: unknown; alt?: unknown; src?: { large2x?: unknown } }> };
  return (payload.photos ?? []).flatMap((photo) =>
    typeof photo.src?.large2x === "string"
      ? [{ url: photo.src.large2x, ref: `pexels:${String(photo.id)}`, description: typeof photo.alt === "string" ? photo.alt : "" }]
      : []
  );
}

async function pixabay(query: string, config: AmbientConfig, key: string | undefined, fetcher?: Fetcher): Promise<Candidate[]> {
  if (!key) return [];
  const host = config.stock.pixabay.host;
  const params = new URLSearchParams({ key, q: query, image_type: "photo", orientation: "vertical", per_page: "20", safesearch: "true" });
  const response = await boundedFetch(`https://${host}/api/?${params}`, { allowHosts: [host], maxBytes: 2_000_000, timeoutMs: 20_000, fetcher });
  const payload = parseJson(response.body) as { hits?: Array<{ id?: unknown; tags?: unknown; largeImageURL?: unknown }> };
  return (payload.hits ?? []).flatMap((hit) =>
    typeof hit.largeImageURL === "string"
      ? [{ url: hit.largeImageURL, ref: `pixabay:${String(hit.id)}`, description: typeof hit.tags === "string" ? hit.tags : "" }]
      : []
  );
}
