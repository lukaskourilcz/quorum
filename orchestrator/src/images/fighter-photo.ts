import { safeFetch } from "../security/url.js";
import { heroReady, wikimediaLicense, type LicensedPhotoCandidate } from "./licensed.js";

/**
 * The photograph a fighter's own Wikidata item names, or nothing.
 *
 * A name is not an identity. "Gustavo Lopez" belongs to an OKTAGON bantamweight and to an
 * Argentinian government official, and on 4 August the second one illustrated an article about
 * the first: the Commons file "678 - Gustavo Lopez.jpg", described on its own file page as
 * "Gustavo López, subsecretario de Presidencia de la Nación". Every filter the search path had
 * was textual — the caption has to contain every word of the subject's name, then the caption
 * with the fewest leftover words wins — and both passed the politician, the second one
 * enthusiastically, because "678 - Gustavo Lopez" is as close to being *only* the name as a
 * caption gets. No amount of caption reading fixes that, because the caption is not the thing
 * being asked about.
 *
 * Wikidata property P18 is different in kind. An item is the person, not a string about them,
 * and P18 is that item's maintainers stating which file depicts it. Q104839627 is the fighter;
 * a P18 on it cannot be a photograph of the subsecretario, whatever either of them is called.
 *
 * Q104839627 in fact has no P18, so the correct answer for that article was: there is no
 * photograph *of him*. That is what this returns — null — and the caller descends to the next rung
 * of `PHOTO_CERTAINTY_LADDER`. Null is the common case and the owner should know the shape of it.
 * Measured against the live items on 4 August 2026: all 92 fighter cards carry a wikidataId, 55 of
 * those items name an image, and 39 of those files are large enough to fill a 1600x900 hero. So 39
 * fighters in 92 can be photographed as themselves — 36 of the 80 UFC cards and 3 of the 12
 * OKTAGON ones, which is the thinner half by some way. (The previous note here read those two
 * figures as the count that *fails*, which they are not, and they do not sum to 53 either way.) No
 * file was refused for its licence; the 16 that failed were all narrower than 640px.
 *
 * The other 53 used to run the deterministic FRAME plate. Since 4 August they run an illustrative
 * photograph of the sport instead — see `illustrativeSportPhoto` — which is honest only because it
 * never claims to be the fighter. Nothing about that changes what this function may return: an
 * uncertain photograph of a person is still worse than no photograph of them.
 */

const USER_AGENT = "BoardlessAI-FightAIQ/1.0 (https://boardless-ai.vercel.app; source review bot)";
const API_HOSTS = ["www.wikidata.org", "commons.wikimedia.org"];

export type IdentityJsonFetcher = (url: string) => Promise<unknown>;

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await safeFetch(url, {
    allowHosts: API_HOSTS,
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

/** An extmetadata entry reduced to plain text: the API returns HTML in most of these fields. */
function metadataValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return text((value as { value?: unknown }).value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The Commons filename the item names, at the highest rank the item offers.
 *
 * Exported for the test, which reads a recorded claim list rather than calling Wikidata. A
 * deprecated claim is a value the maintainers have marked as wrong, so it is never read; a
 * preferred one is their answer when the item carries several.
 */
export function readImageFilename(claims: unknown): string | null {
  if (!Array.isArray(claims) || claims.length === 0) return null;
  const entries = claims as Array<{ mainsnak?: { datavalue?: { value?: unknown } }; rank?: string }>;
  const chosen = entries.find((claim) => claim.rank === "preferred")
    ?? entries.find((claim) => claim.rank !== "deprecated")
    ?? null;
  const filename = text(chosen?.mainsnak?.datavalue?.value);
  return filename || null;
}

/**
 * The alt text a screen-reader user gets, taken from the file rather than from the writer.
 *
 * The article writer is handed a title and never sees a pixel, so when it was asked for
 * "factual Czech imageAlt" it did the only thing it could and made one up: the 4 August article
 * shipped "Gustavo Lopez v zápasovém postoji" — in a fighting stance — describing a photograph
 * of a man in a suit at a lectern. Two things here are known rather than imagined. The file is
 * what Wikidata says depicts this person, and the file's own page carries a description its
 * uploader wrote while looking at it. Both are stated, in that order, and nothing else is.
 *
 * The description is not translated. It is quoted as the file page has it, in whatever language
 * that is, because a translation is another chance to invent and the Czech frame around it
 * already says what the reader is being given. URLs are dropped — several Commons descriptions
 * are pasted video blurbs ending in a link, which is noise in an alt attribute.
 */
export function identityPhotoAlt(input: { name: string; filename: string; description: string }): string {
  const description = input.description
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!description) {
    return `Fotografie, kterou Wikidata uvádí u osoby ${input.name} (soubor ${input.filename} na Wikimedia Commons). Commons k ní neuvádí popis.`.slice(0, 300);
  }
  const prefix = `Fotografie, kterou Wikidata uvádí u osoby ${input.name}. Popis souboru na Wikimedia Commons: `;
  const room = 300 - prefix.length - 1;
  if (room <= 0) return prefix.slice(0, 300);
  if (description.length <= room) return `${prefix}${description}`;
  // Cut on a word boundary so the quoted description never ends mid-word.
  const clipped = description.slice(0, room - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${prefix}${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export interface IdentityPhotoLookup {
  /** The fighter's Wikidata item, e.g. "Q4522047". */
  wikidataId: string;
  /**
   * The name for the alt text when the item carries no English label.
   *
   * The item's own label is preferred, because it names the same entity the photograph was
   * resolved through and it is free of the disambiguators a card id carries: Q104839627 labels
   * itself "Gustavo Lopez" where the card reads "Gustavo Lopez (fighter)".
   */
  fallbackName: string;
  fetchJson?: IdentityJsonFetcher;
}

/**
 * Resolves the fighter's item to a hero-ready candidate, or null when there is no photograph.
 *
 * Null is a normal, publishable outcome and covers 53 of the 92 cards on file: the caller drops to
 * rung two of `PHOTO_CERTAINTY_LADDER` and attaches a photograph of the sport that claims to be
 * nobody, or to the FRAME plate if even that cannot be fetched. What must never happen is the
 * third possibility — a photograph of somebody else offered as this person — so nothing here falls
 * back to a search when the item is silent, and nothing downstream may relabel what it does find.
 */
export async function fighterIdentityPhoto(input: IdentityPhotoLookup): Promise<LicensedPhotoCandidate | null> {
  if (!/^Q[1-9]\d*$/u.test(input.wikidataId)) return null;
  const fetchJson = input.fetchJson ?? defaultFetchJson;

  const itemUrl = new URL("https://www.wikidata.org/w/api.php");
  Object.entries({
    action: "wbgetentities",
    format: "json",
    ids: input.wikidataId,
    props: "claims|labels",
    languages: "en"
  }).forEach(([key, value]) => itemUrl.searchParams.set(key, value));
  const item = await fetchJson(itemUrl.toString()) as {
    entities?: Record<string, { claims?: Record<string, unknown>; labels?: { en?: { value?: unknown } } }>;
  };
  const entity = item.entities?.[input.wikidataId];
  const filename = readImageFilename(entity?.claims?.P18);
  if (!filename) return null;
  const name = text(entity?.labels?.en?.value) || input.fallbackName;

  const fileUrl = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query",
    format: "json",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "640"
  }).forEach(([key, value]) => fileUrl.searchParams.set(key, value));
  const file = await fetchJson(fileUrl.toString()) as { query?: { pages?: Record<string, unknown> } };
  const page = Object.values(file.query?.pages ?? {})[0] as
    { pageid?: unknown; imageinfo?: unknown[] } | undefined;
  const info = (page?.imageinfo?.[0] ?? {}) as Record<string, unknown>;
  const metadata = (info.extmetadata ?? {}) as Record<string, unknown>;

  // Licence and attribution come from the file's own metadata, never from the item that pointed
  // at it: P18 says who is depicted and says nothing about who may republish the picture.
  const license = wikimediaLicense(metadataValue(metadata.LicenseShortName));
  if (!license) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(text(info.mime))) return null;
  const author = metadataValue(metadata.Artist) || metadataValue(metadata.Credit) || "Wikimedia Commons contributor";
  const pageId = positiveNumber(page?.pageid);
  if (!pageId) return null;

  const candidate: LicensedPhotoCandidate = {
    id: `wikidata:${input.wikidataId}`,
    provider: "wikimedia",
    title: filename,
    thumbnailUrl: text(info.thumburl) || text(info.url),
    downloadUrl: text(info.url),
    width: positiveNumber(info.width),
    height: positiveNumber(info.height),
    license,
    author,
    sourceUrl: `https://commons.wikimedia.org/?curid=${pageId}`,
    attributionHtml: `${author} · ${license} · Wikimedia Commons`,
    identityOf: input.wikidataId,
    altCs: identityPhotoAlt({
      name,
      filename,
      description: metadataValue(metadata.ImageDescription)
    })
  };
  // Valentina Shevchenko's item names a 483x644 file. It is unarguably her and it still cannot
  // fill a 1600x900 hero, so the answer for her article is the FRAME cover, decided here rather
  // than discovered by a throw three steps later.
  return heroReady(candidate) ? candidate : null;
}
