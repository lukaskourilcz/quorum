import { createHash } from "node:crypto";
import { safeFetch } from "../security/url.js";
import { heroReady, wikimediaLicense, type LicensedPhotoCandidate } from "./licensed.js";

/**
 * Rung two of the certainty ladder: a photograph of the sport, presented as nothing else.
 *
 * A fighter article does not need a photograph of that fighter every time. When the fighter's own
 * Wikidata item names a usable file, `fighterIdentityPhoto` returns it and this module is never
 * reached; 53 of the 92 cards on file have no such image, and those used to fall straight to the
 * drawn FRAME plate. What runs there now is a licensed photograph of a cage, a hall or a crowd.
 *
 * The single rule this module exists to enforce: **an illustrative photograph is never presented
 * as being the fighter.** Its alt text says what the photograph is and claims nothing about who is
 * in it. That is enforced by construction rather than by care — `illustrativePhotoAlt` takes no
 * name and has no parameter through which one could arrive — because the two heroes this project
 * shipped wrongly in one week were both produced by code that had every intention of being right.
 *
 * ## Why a curated set and not a search
 *
 * A search is what put an Argentinian subsecretario de Presidencia and a Russian operetta singer
 * on this site, and running one on the sport instead of on a name does not make its results
 * predictable. Asked for "mixed martial arts cage" on 4 August 2026, Commons returned, among 30
 * hits: five logos, a PDF about a 1963 boxing match, and Emanuel Leutze's *Washington Crossing the
 * Delaware* — the last because it hangs in the Metropolitan Museum of Art, whose Commons files are
 * named "MMA-NYC". Ranking is not stable either, so the same article would get a different
 * photograph on a re-run and no reviewer could say what any article was about to show.
 *
 * The six files below were each looked at, at 640px, before being written down. They are the whole
 * of what may run, so the worst case is knowable: a reader can be shown one of six photographs
 * and a reviewer can check all six in a minute. The rotation is seeded by the article slug, so one
 * article always gets the same photograph and neighbouring articles get different ones.
 *
 * ## What the six have in common
 *
 * No face in any of them is large enough to be recognised. That is the curation rule, and it is a
 * stronger guarantee than the alt text alone: a wide shot of a lit cage reads as scene-setting,
 * whereas a close-up of an identifiable athlete reads as a portrait of the article's subject no
 * matter how carefully the alt is worded. Close-ups of amateur fighters were available, permissive
 * and sharp, and every one of them was rejected for this reason.
 *
 * Licence and attribution are read live from each file's own Commons metadata at fetch time,
 * exactly as for a P18 file — nothing about the licence is trusted to this list, because a licence
 * recorded in code is a licence that stops being checked.
 */

const USER_AGENT = "BoardlessAI-FightAIQ/1.0 (https://boardless-ai.vercel.app; source review bot)";
const API_HOST = "commons.wikimedia.org";

export interface IllustrativeSportPhoto {
  /** The Commons file, named exactly. Resolved by title, never by search. */
  file: string;
  /**
   * What the photograph shows, in Czech, written by whoever looked at it.
   *
   * Not the Commons description. A file page is editable by anybody and several of these carry an
   * event name and a year, which is detail an alt attribute does not need and a sentence a future
   * editor could turn into a person's name. What a curator saw cannot change under us.
   */
  sceneCs: string;
}

export const ILLUSTRATIVE_SPORT_PHOTOGRAPHS: readonly IllustrativeSportPhoto[] = [
  // Empty cage under the rig, German MMA Championship. Two distant figures, no legible face.
  { file: "GMC Octagon.jpg", sceneCs: "prázdná klec ve sportovní hale před začátkem galavečera" },
  // Wide shot from the stands: cage, seconds waiting outside it, seated crowd.
  { file: "PLMMA Cage-Octagon MMA.JPG", sceneCs: "klec a diváci na začátku turnaje ve sportovní hale" },
  // Strikeforce cage from above, referee mid-ring, press at the apron.
  { file: "Strikeforce cage 2011-01-07.jpg", sceneCs: "pohled z tribuny na klec během galavečera" },
  // Arena-scale: spotlights, screen, a full house around a small distant cage.
  { file: "PFL 2018 Photo.jpg", sceneCs: "nasvícená aréna se zaplněným hledištěm okolo klece" },
  // Cage lit through haze in an empty arena bowl before the doors open.
  { file: "MMA Challengers 9.JPG", sceneCs: "nasvícená klec v hale před zápasem" },
  // Cage at floor level ringed by spectators, seen from the upper tier.
  { file: "MMA event at Mellon Arena, July 7, 2009.jpg", sceneCs: "klec uprostřed haly a publikum kolem ní" }
];

/**
 * The alt text of an illustrative photograph.
 *
 * There is no parameter for a name and there must never be one. "Valentina Shevchenko in the UFC
 * cage" over a stock cage photograph is the exact sentence this project shipped twice in a week,
 * and both times it was written by something that knew the article's subject and was asked to
 * describe a picture it had not seen. This function cannot write that sentence, whoever calls it.
 *
 * Two things are said and nothing else: that the photograph is an illustration of the sport, and
 * what is in the frame. The second sentence is the one a reader needs — a hero photograph is
 * assumed to be of the person the headline names unless it says otherwise.
 */
export function illustrativePhotoAlt(sceneCs: string): string {
  return `Ilustrační fotografie ze zápasů MMA: ${sceneCs}. Nejde o snímek osoby, o níž článek pojednává.`.slice(0, 300);
}

export type IllustrativeJsonFetcher = (url: string) => Promise<unknown>;

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await safeFetch(url, {
    allowHosts: [API_HOST],
    headers: { "User-Agent": USER_AGENT },
    maxBytes: 4_000_000,
    timeoutMs: 8_000
  });
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metadataValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return text((value as { value?: unknown }).value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The order the set is tried in for a given article. Exported because it is the whole of the pick.
 *
 * A hash of the seed chooses the first file and the rest follow in order, wrapping. One article
 * therefore always shows the same photograph — a re-run does not silently reshuffle the site — and
 * two articles published together rarely show the same one. The tail matters: a file that is
 * momentarily unfetchable costs that article its first choice, not its photograph.
 */
export function illustrativeRotation(seed: string): readonly IllustrativeSportPhoto[] {
  const set = ILLUSTRATIVE_SPORT_PHOTOGRAPHS;
  const digest = createHash("sha256").update(seed).digest();
  const start = digest.readUInt32BE(0) % set.length;
  return Array.from({ length: set.length }, (_, index) => set[(start + index) % set.length]!);
}

/** Resolve one curated file to a hero-ready candidate, or null if this file cannot be used. */
async function resolve(
  photo: IllustrativeSportPhoto,
  fetchJson: IllustrativeJsonFetcher
): Promise<LicensedPhotoCandidate | null> {
  const url = new URL(`https://${API_HOST}/w/api.php`);
  Object.entries({
    action: "query",
    format: "json",
    titles: `File:${photo.file}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "640"
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = await fetchJson(url.toString()) as { query?: { pages?: Record<string, unknown> } };
  const page = Object.values(payload.query?.pages ?? {})[0] as
    { pageid?: unknown; imageinfo?: unknown[] } | undefined;
  const info = (page?.imageinfo?.[0] ?? {}) as Record<string, unknown>;
  const metadata = (info.extmetadata ?? {}) as Record<string, unknown>;

  // Read live, never taken from the list above. A file relicensed or deleted on Commons has to
  // stop being publishable here on the next run, not on the next time somebody edits this file.
  const license = wikimediaLicense(metadataValue(metadata.LicenseShortName));
  if (!license) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(text(info.mime))) return null;
  const pageId = positiveNumber(page?.pageid);
  if (!pageId) return null;
  const author = metadataValue(metadata.Artist) || metadataValue(metadata.Credit) || "Wikimedia Commons contributor";

  const candidate: LicensedPhotoCandidate = {
    id: `illustrative:${pageId}`,
    provider: "wikimedia",
    title: photo.file,
    thumbnailUrl: text(info.thumburl) || text(info.url),
    downloadUrl: text(info.url),
    width: positiveNumber(info.width),
    height: positiveNumber(info.height),
    license,
    author,
    sourceUrl: `https://commons.wikimedia.org/?curid=${pageId}`,
    attributionHtml: `${author} · ${license} · Wikimedia Commons`,
    illustrative: true,
    altCs: illustrativePhotoAlt(photo.sceneCs)
  };
  // `heroReady` also applies the landscape rule, which is correct here and wrong for a P18
  // portrait: an illustrative photograph is chosen for the hero slot and every file in the set was
  // picked landscape, so a candidate that fails it is a file that changed under us.
  return heroReady(candidate) ? candidate : null;
}

/**
 * A licensed photograph of the sport for an article that has no photograph of its subject.
 *
 * `seed` is the article slug: it decides which of the curated files is tried first and nothing
 * else. It is never sent anywhere — no query is built from it, and no part of the subject's name
 * reaches Commons — which is the difference between this and the name search that shipped a
 * politician's portrait.
 *
 * Null means every file in the set failed, and the caller draws the FRAME plate. That is rung
 * three and a normal outcome, not an error.
 */
export async function illustrativeSportPhoto(input: {
  seed: string;
  fetchJson?: IllustrativeJsonFetcher;
}): Promise<LicensedPhotoCandidate | null> {
  const fetchJson = input.fetchJson ?? defaultFetchJson;
  for (const photo of illustrativeRotation(input.seed)) {
    // One unreachable file must not cost the article its photograph, so a throw moves to the next
    // in the rotation rather than out of this function.
    const candidate = await resolve(photo, fetchJson).catch(() => null);
    if (candidate) return candidate;
  }
  return null;
}
