import {
  ContestRecordSchema,
  type ContestCandidate,
  type ContestKind,
  type ContestRecord
} from "../../contracts/contest-radar.js";
import type { ContestCluster } from "./canonical.js";

/**
 * Deterministic extraction: what can be known from a listing without paying anybody.
 *
 * This is the rung the founding decision's free path depends on. It reads dates, prizes, purchase
 * requirements and mechanics out of the text the adapters already collected, marks each with the
 * confidence it earned, and leaves everything it could not read as unavailable *with a reason*.
 * No model call and no network request happens here.
 *
 * Nothing it produces is `stated` unless the source said it outright. A date parsed from a phrase
 * is `derived`; a kind guessed from a keyword is `inferred`, and `inferred` may never satisfy a
 * hard gate — a deadline nobody wrote down is not a deadline anybody can enter by.
 */

const CZECH_MONTHS: Record<string, number> = {
  ledna: 1, unora: 2, února: 2, brezna: 3, března: 3, dubna: 4, kvetna: 5, května: 5, cervna: 6,
  června: 6, cervence: 7, července: 7, srpna: 8, zari: 9, září: 9, rijna: 10, října: 10,
  listopadu: 11, prosince: 12
};

function unavailable(reason: "not-stated" | "unparseable" | "conflicting" | "requires-owner-check" | "not-collected") {
  return { value: null, confidence: null, unavailableReason: reason, evidenceRefs: [] };
}

function stated<T>(value: T, evidenceRefs: string[] = []) {
  return { value, confidence: "stated" as const, unavailableReason: null, evidenceRefs };
}

function derived<T>(value: T, evidenceRefs: string[] = []) {
  return { value, confidence: "derived" as const, unavailableReason: null, evidenceRefs };
}

function inferred<T>(value: T, evidenceRefs: string[] = []) {
  return { value, confidence: "inferred" as const, unavailableReason: null, evidenceRefs };
}

/**
 * A date out of Czech, Slovak or ISO text.
 *
 * `derived` rather than `stated` throughout, because the source wrote a sentence and this computed
 * a date from it. The distinction matters at the gate: a derived deadline is good enough to sort
 * by and not good enough to promise the owner they can still enter.
 */
export function parseContestDate(text: string | null, year: number): string | null {
  if (!text) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dotted = /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})?/u.exec(text);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const resolved = dotted[3] ? Number(dotted[3]) : year;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${resolved}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const named = /(\d{1,2})\.?\s+([a-záčďéěíňóřšťúůýž]+)(?:\s+(\d{4}))?/iu.exec(text);
  if (named) {
    const month = CZECH_MONTHS[named[2]!.toLowerCase()];
    const day = Number(named[1]);
    if (month && day >= 1 && day <= 31) {
      const resolved = named[3] ? Number(named[3]) : year;
      return `${resolved}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

/** A prize amount and its currency, only where both are written together. */
export function parsePrize(text: string | null): { amount: number; currency: "CZK" | "EUR" | "USD" } | null {
  if (!text) return null;
  const match = /(\d[\d\s.,]*)\s*(kč|czk|€|eur|\$|usd)/iu.exec(text)
    ?? /(?:kč|czk|€|eur|\$|usd)\s*(\d[\d\s.,]*)()/iu.exec(text);
  if (!match) return null;
  const amount = Number(match[1]!.replace(/[\s.]/gu, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] ?? text).toLowerCase();
  const currency = /kč|czk/u.test(unit) ? "CZK" : /€|eur/u.test(unit) ? "EUR" : "USD";
  return { amount, currency };
}

const KIND_HINTS: ReadonlyArray<readonly [RegExp, ContestKind]> = [
  [/hackathon|hack\b/iu, "hackathon"],
  [/kaggle|competition|dataset|leaderboard/iu, "data-competition"],
  [/bounty/iu, "bounty"],
  [/grant|stipend/iu, "grant"],
  [/kviz|kvíz|quiz/iu, "quiz"],
  [/fotograf|video|kresl|design|creative|napiš|napis/iu, "creative-contest"],
  [/slosov|losov|sweepstake|giveaway|vyhraj|vyhrajte|súťaž|soutěž/iu, "sweepstakes"]
];

/** Words that mean an entry costs something. Purchase-required contests rank below free ones. */
const PURCHASE_HINTS = /nákup|nakup|zakoup|účtenk|uctenk|purchase required|proof of purchase|kúp/iu;

const MECHANIC_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/sledu|follow/iu, "follow"],
  [/lajk|like\b/iu, "like"],
  [/koment|comment/iu, "comment"],
  [/sdíl|sdil|share|zdieľ/iu, "share"],
  [/označ|oznac|tag\b/iu, "tag"],
  [/registr|sign\s?up|prihlás|prihlas/iu, "register"],
  [/nahraj|upload|submit/iu, "submit"],
  [/účtenk|uctenk|receipt/iu, "receipt"]
];

export function extractContestRecord(input: {
  cluster: ContestCluster;
  now: string;
  extractionVersion?: string;
}): ContestRecord | null {
  const members = input.cluster.members;
  const primary = members[0];
  if (!primary) return null;

  const year = Number(input.now.slice(0, 4));
  const text = members
    .map((member) => [member.title, member.snippet, member.hints.prizeText, member.hints.deadlineText].filter(Boolean).join(" "))
    .join(" ");

  const deadlineText = members.map((member) => member.hints.deadlineText).find(Boolean) ?? null;
  const deadline = parseContestDate(deadlineText, year);
  const prize = parsePrize(members.map((member) => member.hints.prizeText).find(Boolean) ?? text);
  // The adapter's own hint wins over a keyword sweep. Devpost's endpoint says an item is a
  // hackathon by being the hackathons endpoint, and re-guessing from the title threw that away —
  // "RevenueCat Shipaton" contains no word this text search knows.
  const kind = members.map((member) => member.hints.kind).find(Boolean)
    ?? KIND_HINTS.find(([pattern]) => pattern.test(text))?.[1]
    ?? null;
  const mechanics = MECHANIC_HINTS.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
  const purchase = PURCHASE_HINTS.test(text);

  // Two members disagreeing about a deadline is recorded, not resolved. Picking one silently is
  // how the owner misses an entry window that the other listing had right.
  const deadlines = new Set(
    members.map((member) => parseContestDate(member.hints.deadlineText, year)).filter((value): value is string => value !== null)
  );
  const conflicts = deadlines.size > 1
    ? [{ field: "dates.deadline", values: [...deadlines], sourceIds: members.map((member) => member.sourceId) }]
    : [];

  const evidence = [primary.listingUrl];
  const record = {
    schemaVersion: "contest-record/1" as const,
    id: input.cluster.id,
    canonicalUrl: input.cluster.canonicalUrl,
    sourceRefs: members.map((member) => ({
      sourceId: member.sourceId,
      sourceItemId: member.sourceItemId,
      listingUrl: member.listingUrl
    })),
    title: primary.title,
    organizer: primary.organizer,
    track: primary.hints.track ?? "consumer",
    kind: kind ?? "other",
    categories: [],
    language: primary.hints.language,
    eligibility: {
      facts: [],
      // Nothing on a listing page states an age limit or a residency rule reliably. Both wait for
      // the rules page, and saying so is better than an inferred number somebody plans around.
      minimumAge: unavailable("requires-owner-check"),
      residency: unavailable("requires-owner-check")
    },
    dates: {
      registrationOpens: unavailable("not-stated"),
      submissionCloses: unavailable("not-stated"),
      eventStarts: unavailable("not-stated"),
      deadline: conflicts.length > 0
        ? unavailable("conflicting")
        : deadline
          ? derived(deadline, evidence)
          : unavailable(deadlineText ? "unparseable" : "not-stated"),
      resultsAnnounced: unavailable("not-stated")
    },
    prize: {
      description: primary.hints.prizeText ? stated(primary.hints.prizeText, evidence) : unavailable("not-stated"),
      valueAmount: prize ? derived(prize.amount, evidence) : unavailable(primary.hints.prizeText ? "unparseable" : "not-stated"),
      currency: prize ? derived(prize.currency, evidence) : unavailable("not-stated")
    },
    cost: {
      // Only a positive signal is recorded. Absence of the word "nákup" is not evidence that a
      // contest is free, and treating it as such is how the owner buys something to enter.
      purchaseRequired: purchase ? inferred(true, evidence) : unavailable("requires-owner-check"),
      entryFee: unavailable("not-stated")
    },
    mechanics,
    repeatHints: [],
    judging: unavailable("not-stated"),
    participation: unavailable("not-collected"),
    effort: {
      tier: mechanics.length === 0 ? "unknown" as const : mechanics.length <= 2 ? "minutes" as const : "short" as const,
      minutes: unavailable("not-stated"),
      basis: mechanics.length === 0
        ? "No mechanic was readable from the listing."
        : `Estimated from ${mechanics.length} readable ${mechanics.length === 1 ? "mechanic" : "mechanics"}.`
    },
    legitimacy: {
      state: "unverified" as const,
      reasons: ["Read from a listing page; the contest's own rules have not been checked."]
    },
    // Every freshly extracted record needs its rules page read before an entry is prepared, so
    // readiness is the same value either way. It becomes `ready` only after that check.
    readiness: "needs-detail" as const,
    readinessReasons: [
      "Eligibility and purchase requirements need the rules page before an entry is prepared."
    ],
    conflicts,
    rankingRefs: [],
    preparationRefs: [],
    firstSeenAt: primary.observedAt,
    lastSeenAt: members.map((member) => member.observedAt).sort().at(-1) ?? primary.observedAt,
    lifecycle: "discovered" as const,
    staleAfter: null,
    versions: {
      source: "1.0.0",
      extraction: input.extractionVersion ?? "1.0.0",
      enrichment: null,
      ranking: null
    },
    lockedFields: [],
    supersedesRef: null
  };

  const parsed = ContestRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}
