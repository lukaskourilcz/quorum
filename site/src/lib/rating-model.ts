export const ratingValues = ["perfect", "good", "bad"] as const;
export const ratingObjectKinds = ["idea", "plan", "visual", "niche-proposal", "slate", "article", "social-variant"] as const;

export type RatingValue = (typeof ratingValues)[number];
export type RatingObjectKind = (typeof ratingObjectKinds)[number];

export interface RatingRecord {
  schemaVersion: "rating/1";
  id: string;
  ventureId: string;
  objectKind: RatingObjectKind;
  objectRef: {
    id: string;
    contentHash: string;
  };
  rating: RatingValue;
  note?: string;
  ratedAt: string;
}

const venturePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ratingIdPattern = /^r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/;
const contentHashPattern = /^sha256:[a-f0-9]{12}$/;
const unsafeControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && candidate.length <= maximum && !unsafeControlCharacters.test(candidate)
    ? candidate
    : null;
}

export function parseRatingRecord(value: unknown): RatingRecord | null {
  const input = record(value);
  if (!input || input.schemaVersion !== "rating/1") return null;
  const id = boundedText(input.id, 80);
  const ventureId = boundedText(input.ventureId, 80);
  const objectKind = typeof input.objectKind === "string" && ratingObjectKinds.includes(input.objectKind as RatingObjectKind)
    ? input.objectKind as RatingObjectKind
    : null;
  const objectRef = record(input.objectRef);
  const objectId = boundedText(objectRef?.id, 160);
  const contentHash = boundedText(objectRef?.contentHash, 80);
  const rating = typeof input.rating === "string" && ratingValues.includes(input.rating as RatingValue)
    ? input.rating as RatingValue
    : null;
  const ratedAt = boundedText(input.ratedAt, 80);
  const note = input.note === undefined ? undefined : boundedText(input.note, 500);
  if (
    !id || !ratingIdPattern.test(id) ||
    !ventureId || !venturePattern.test(ventureId) ||
    !objectKind || !objectId || !contentHash || !contentHashPattern.test(contentHash) ||
    !rating || !ratedAt || Number.isNaN(Date.parse(ratedAt)) ||
    (input.note !== undefined && note === null)
  ) return null;
  return {
    schemaVersion: "rating/1",
    id,
    ventureId,
    objectKind,
    objectRef: { id: objectId, contentHash },
    rating,
    ...(note ? { note } : {}),
    ratedAt
  };
}

export function parseRatingLedger(raw: string): RatingRecord[] | null {
  const ratings: RatingRecord[] = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const parsed = parseRatingRecord(JSON.parse(line));
      if (!parsed) return null;
      ratings.push(parsed);
    } catch {
      return null;
    }
  }
  return ratings;
}

export function currentRating(
  ratings: readonly RatingRecord[],
  objectId: string
): RatingRecord | null {
  return [...ratings]
    .filter((rating) => rating.objectRef.id === objectId)
    .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt) || right.id.localeCompare(left.id))[0] ?? null;
}
