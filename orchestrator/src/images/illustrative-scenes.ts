import { createHash } from "node:crypto";
import { safeFetch } from "../security/url.js";
import { heroReady, wikimediaLicense, type LicensedPhotoCandidate } from "./licensed.js";

/**
 * The DNESKAi half of the certainty ladder: a curated scene photograph, tried before any search.
 *
 * MMA already runs this design and it is the reason its covers are predictable — a fighter's own
 * Wikidata photograph, then one of a handful of hand-reviewed sport scenes, then the drawn plate.
 * The daily edition had only the middle rung's opposite: a live Openverse and Wikimedia search on
 * a subject phrase, whose results nobody has looked at, ranked in an order that moves. Whether a
 * given day got a usable photograph or the plate came down to search luck.
 *
 * This is the same curation, keyed by the concept the day's tags resolve to rather than by the
 * sport. Every file below was opened at 640px before it was written down, and the same rule
 * applies as on the MMA set: **no recognisable face**. A wide shot of a server hall or a
 * legislature reads as scene-setting; a photograph of an identifiable person over a story about
 * a company reads as a claim about who that person is, however the alt is worded.
 *
 * Licence, author and dimensions are read live from each file's own Commons metadata at fetch
 * time. Nothing about the licence is trusted to this list — a licence recorded in code is a
 * licence that has stopped being checked — so a file relicensed or deleted on Commons drops out
 * on the next run and the rotation moves to the next entry.
 *
 * Rung two is the live search that used to be rung one; rung three is the FRAME plate. Nothing
 * here spends money: Commons needs no key and the pipeline has never billed an image call.
 */

const USER_AGENT = "BoardlessAI-DNESKAi/1.0 (https://boardless-ai.vercel.app; source review bot)";
const API_HOST = "commons.wikimedia.org";

export interface IllustrativeScene {
  /** The Commons file, named exactly. Resolved by title, never by search. */
  file: string;
  /**
   * What the photograph shows, in Czech, written by whoever looked at it.
   *
   * Not the Commons description: a file page is editable by anybody, and several of these carry a
   * company name and a year — detail an alt attribute does not need and a sentence a future
   * editor could turn into a claim. What a curator saw cannot change under us.
   */
  sceneCs: string;
}

/**
 * Curated scenes by the concept `imageSubjectQuery` resolves a day's tags to.
 *
 * The keys are exactly the values in VISUAL_SUBJECT, so a concept the vocabulary can produce
 * either has a curated set here or falls through to the live search. A concept with no entry is
 * not a bug; it is a concept nobody has reviewed photographs for yet.
 */
export const ILLUSTRATIVE_SCENES: Readonly<Record<string, readonly IllustrativeScene[]>> = {
  "data centre": [
    { file: "CERN Server 03.jpg", sceneCs: "řady serverových skříní v datovém centru" },
    { file: "Wikimedia Foundation Servers-8055 35.jpg", sceneCs: "chodba mezi servery s kabeláží" },
    { file: "Datacenter-telecom.jpg", sceneCs: "sál datového centra s racky a chlazením" }
  ],
  semiconductor: [
    { file: "Silicon wafer with mirror finish.jpg", sceneCs: "křemíková destička s vyleptanými čipy" },
    { file: "Wafer 2 Zoll bis 8 Zoll 2.jpg", sceneCs: "křemíkové destičky různých velikostí vedle sebe" },
    { file: "ASML Twinscan NXT-1950i.jpg", sceneCs: "litografický stroj ve výrobě polovodičů" }
  ],
  "government building": [
    { file: "Berlaymont building, Brussels (DSCF3245).jpg", sceneCs: "budova evropské instituce zvenčí" },
    { file: "European Parliament Strasbourg hemicycle - Diliff.jpg", sceneCs: "prázdný jednací sál parlamentu" },
    { file: "Poslanecka snemovna Parlamentu CR.jpg", sceneCs: "budova zákonodárného sboru zvenčí" }
  ],
  newsroom: [
    { file: "Newsroom of the Los Angeles Times, 2009.jpg", sceneCs: "redakce s pracovními stoly a monitory" },
    { file: "Deutsche Welle Newsroom Bonn.jpg", sceneCs: "otevřená redakce zpravodajství" }
  ],
  cybersecurity: [
    { file: "Server room CoolIT.jpg", sceneCs: "serverovna se síťovými prvky" },
    { file: "Network switch rack.jpg", sceneCs: "rack se síťovými přepínači a kabeláží" },
    { file: "Padlock-blue-closed.svg.png", sceneCs: "detail zámku jako symbol zabezpečení" }
  ],
  "technology company office": [
    { file: "Googleplex HQ (cropped).jpg", sceneCs: "sídlo technologické firmy zvenčí" },
    { file: "Open plan office space.jpg", sceneCs: "otevřená kancelář s pracovními místy" }
  ],
  "research laboratory": [
    { file: "Laboratory glassware (5).jpg", sceneCs: "laboratorní sklo na pracovním stole" },
    { file: "CSIRO ScienceImage 11359 Research laboratory.jpg", sceneCs: "výzkumná laboratoř s přístroji" }
  ],
  courtroom: [
    { file: "Courtroom of the Supreme Court of Ireland.jpg", sceneCs: "prázdná soudní síň" },
    { file: "Gerichtssaal Landgericht.jpg", sceneCs: "jednací síň soudu bez lidí" }
  ],
  "rocket launch": [
    { file: "Falcon 9 launch (cropped).jpg", sceneCs: "start rakety z odpalovací rampy" },
    { file: "Ariane 5 liftoff.jpg", sceneCs: "raketa krátce po startu" }
  ],
  "artificial intelligence": [
    { file: "CERN Server 03.jpg", sceneCs: "řady serverových skříní v datovém centru" },
    { file: "Wikimedia Foundation Servers-8055 35.jpg", sceneCs: "chodba mezi servery s kabeláží" }
  ],
  "power station": [
    { file: "Power station cooling towers.jpg", sceneCs: "chladicí věže elektrárny" }
  ],
  "wind turbines": [
    { file: "Wind turbines in southern California 2016.jpg", sceneCs: "větrné turbíny v krajině" }
  ],
  "computer hardware": [
    { file: "Computer motherboard closeup.jpg", sceneCs: "detail základní desky počítače" }
  ],
  "stock exchange": [
    { file: "Frankfurt Stock Exchange trading floor.jpg", sceneCs: "obchodní parket burzy" }
  ]
};

/**
 * The alt text of a curated scene photograph.
 *
 * There is no parameter for a subject and there must never be one. The writer knows exactly what
 * the day's story is about, and an alt it produces for a stock photograph of a server hall is one
 * sentence from naming a company that is not in the frame. This function cannot write that
 * sentence, whoever calls it: two things are said, that the photograph illustrates the topic and
 * what is in the frame, and nothing else.
 */
export function illustrativeSceneAlt(sceneCs: string): string {
  return `Ilustrační fotografie k tématu: ${sceneCs}. Nejde o snímek konkrétní události, o níž článek pojednává.`.slice(0, 300);
}

export type SceneJsonFetcher = (url: string) => Promise<unknown>;

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
 * Every curated scene for a subject phrase, in the order this article tries them.
 *
 * `imageSubjectQuery` joins at most two concepts with a space, so the phrase is split back apart
 * and each concept's set contributes in order. The slug seeds the rotation, so one article always
 * shows the same photograph and neighbouring articles differ.
 */
export function sceneRotation(subjectQuery: string, seed: string): readonly IllustrativeScene[] {
  const concepts = Object.keys(ILLUSTRATIVE_SCENES)
    .filter((concept) => subjectQuery.includes(concept))
    // Longest first, so "data centre" is not shadowed by a shorter concept that is a substring
    // of the same phrase.
    .sort((left, right) => right.length - left.length);
  const set = concepts.flatMap((concept) => ILLUSTRATIVE_SCENES[concept] ?? []);
  const unique = set.filter((scene, index) => set.findIndex((other) => other.file === scene.file) === index);
  if (unique.length === 0) return [];
  const digest = createHash("sha256").update(seed).digest();
  const start = digest.readUInt32BE(0) % unique.length;
  return Array.from({ length: unique.length }, (_, index) => unique[(start + index) % unique.length]!);
}

async function resolve(
  scene: IllustrativeScene,
  fetchJson: SceneJsonFetcher
): Promise<LicensedPhotoCandidate | null> {
  const url = new URL(`https://${API_HOST}/w/api.php`);
  Object.entries({
    action: "query",
    format: "json",
    titles: `File:${scene.file}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "640"
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = await fetchJson(url.toString()) as { query?: { pages?: Record<string, unknown> } };
  const page = Object.values(payload.query?.pages ?? {})[0] as
    { pageid?: unknown; imageinfo?: unknown[] } | undefined;
  const info = (page?.imageinfo?.[0] ?? {}) as Record<string, unknown>;
  const metadata = (info.extmetadata ?? {}) as Record<string, unknown>;

  const license = wikimediaLicense(metadataValue(metadata.LicenseShortName));
  if (!license) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(text(info.mime))) return null;
  const pageId = positiveNumber(page?.pageid);
  if (!pageId) return null;
  const author = metadataValue(metadata.Artist) || metadataValue(metadata.Credit) || "Wikimedia Commons contributor";

  const candidate: LicensedPhotoCandidate = {
    id: `scene:${pageId}`,
    provider: "wikimedia",
    title: scene.file,
    thumbnailUrl: text(info.thumburl) || text(info.url),
    downloadUrl: text(info.url),
    width: positiveNumber(info.width),
    height: positiveNumber(info.height),
    license,
    author,
    sourceUrl: `https://commons.wikimedia.org/?curid=${pageId}`,
    attributionHtml: `${author} · ${license} · Wikimedia Commons`,
    illustrative: true,
    altCs: illustrativeSceneAlt(scene.sceneCs)
  };
  return heroReady(candidate) ? candidate : null;
}

/**
 * A curated scene photograph for the day's subject, or null.
 *
 * Null means the day's concepts have no curated set, or every file in it failed. The caller then
 * runs the live search, exactly as it did before this rung existed.
 */
export async function illustrativeScenePhoto(input: {
  subjectQuery: string;
  seed: string;
  fetchJson?: SceneJsonFetcher;
}): Promise<LicensedPhotoCandidate | null> {
  const fetchJson = input.fetchJson ?? defaultFetchJson;
  for (const scene of sceneRotation(input.subjectQuery, input.seed)) {
    const candidate = await resolve(scene, fetchJson).catch(() => null);
    if (candidate) return candidate;
  }
  return null;
}
