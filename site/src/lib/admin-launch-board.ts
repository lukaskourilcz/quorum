import type { VentureImageRung } from "./admin-image-rungs";

/**
 * One board over the ventures the owner is launching, and nothing else.
 *
 * The admin has around sixty-eight destinations and forty-six venture tabs, nine of which are
 * operationally load-bearing. Everything needed to answer "did it ship, what is next, what needs
 * me" already exists — spread across the deliveries record, the registry clock, the image ladder's
 * verdicts, the activation counters and the owner-attention feed — and the overview asked the
 * owner to visit five places to assemble it.
 *
 * This is a fold, not a loader. Every field arrives from the snapshot that already owns it, so
 * there is no second source to disagree with the first. What it adds is the reduction: one row per
 * venture, one verdict over the set, and the single item that is actually blocking each.
 */

export type LaunchState = "shipping" | "ready" | "held" | "attention";

export interface LaunchBoardRow {
  id: string;
  name: string;
  state: LaunchState;
  /** The word beside the dot. Status is never colour alone. */
  stateLabel: string;
  /** What the venture last put out, and where it went. */
  lastDelivery: { date: string; url: string | null } | null;
  /** The next hour this venture's room is due, in Prague, or null when it has no room. */
  nextSlot: { phase: string; hour: number; label: string } | null;
  /** How the last article's picture was chosen, straight from the ladder's own verdict. */
  image: VentureImageRung | null;
  /** Distance to this venture's own publishing gate, or null when it has no counter. */
  social: { counter: number; required: number; status: string } | null;
  /** The one thing stopping this venture, or null when nothing is. */
  blocking: { title: string; href: string } | null;
}

/**
 * The newest GoVIRAL brief, on the page the owner opens rather than in a tab nobody finds.
 *
 * Five desks parse `Trend call:` lines out of this plan and every one of them returned empty for
 * as long as the room had no scout data. The brief is what the owner reads to decide a week of
 * writing, so the board carries its date, its headline calls and where to read the rest — and,
 * when there is none, says which of the two reasons it is, because "no brief" and "the room has
 * never run" are different problems.
 */
export interface LaunchBriefSummary {
  date: string;
  title: string;
  /** The trend calls, already stripped of their `Trend call:` prefix, newest brief only. */
  calls: string[];
  href: string;
}

export interface LaunchBoard {
  rows: LaunchBoardRow[];
  /** The newest weekly brief, or the sentence explaining why there is not one. */
  brief: LaunchBriefSummary | { unavailable: string };
  /** The single sentence the owner reads first. */
  verdict: { tone: "success" | "warning" | "risk"; headline: string; detail: string };
  blockingCount: number;
  shippingCount: number;
  /** How old the "Needs you" column is. `stale` once the collector has missed more than a day. */
  attention: { asOf: string | null; ageDays: number | null; stale: boolean };
}

/**
 * The launch set, in the order the owner named it.
 *
 * A list rather than a registry query, deliberately. `config/ventures.json` marks twelve ventures
 * `operating` and one `exploration`, so nothing in it distinguishes the seven being launched from
 * the ones deferred — that is an owner decision from 2026-08-28, and writing it down here is
 * honest about which kind of fact it is. FightAIQ is absent because it supplies MMA Files rather
 * than publishing itself.
 */
export const LAUNCH_SET = [
  "caught-up",
  "mma-files",
  "marketingshark",
  "booksofhistory",
  "tehdejsi-svet",
  "kvorum",
  "personal-growth"
] as const;

export const HELD_VENTURES = ["titty-tuesdays", "door-money", "goviral", "webdev-signal"] as const;

/**
 * Which venture an inbox approval belongs to.
 *
 * `OwnerAttentionItem` carries no venture, so the id is the only handle there is. Three ventures
 * prefix theirs and two spell the venture out mid-id; both forms are read here rather than guessed,
 * and an id matching neither returns null and simply does not attach to a row. Failing closed
 * matters more than covering everything: an approval that lands on the wrong venture's row is worse
 * than one that stays where it already is, in the approvals panel.
 */
const APPROVAL_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["BH-", "booksofhistory"],
  ["TS-", "tehdejsi-svet"],
  ["KV-", "kvorum"],
  ["DM-", "door-money"],
  ["BOOK-", "door-money"],
  ["TT-", "titty-tuesdays"],
  ["APIFY-MMA-", "mma-files"],
  ["DEVSHARK-", "marketingshark"]
];

/**
 * An approval title cut to fit a table cell, at a word boundary.
 *
 * Cutting at a fixed character count reads as damage — "with th…" — where cutting at the last space
 * reads as a summary. The cell links to the full item either way, so the only job here is to stop
 * one long approval from setting the height of every row.
 */
export function shortTitle(title: string, limit = 68): string {
  if (title.length <= limit) return title;
  const cut = title.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit / 2 ? cut.slice(0, boundary) : cut).replace(/[,;:.\s]+$/u, "")}…`;
}

export function ventureForApproval(id: string): string | null {
  // Longest prefix first, so APIFY-MMA- is not shadowed by a shorter neighbour later.
  const match = [...APPROVAL_PREFIXES]
    .sort((left, right) => right[0].length - left[0].length)
    .find(([prefix]) => id.startsWith(prefix));
  return match?.[1] ?? null;
}

const STATE_LABELS: Record<LaunchState, string> = {
  shipping: "Shipping",
  ready: "Ready",
  attention: "Needs you",
  held: "Held"
};

export interface LaunchBoardInputs {
  ventures: ReadonlyArray<{ id: string; name: string }>;
  /** Newest delivery per venture, from the record that already owns it. */
  deliveries: Record<string, { date: string; url: string | null } | undefined>;
  slots: Record<string, { phase: string; hour: number; label: string } | undefined>;
  images: Record<string, VentureImageRung | undefined>;
  social: Record<string, { counter: number; required: number; status: string } | undefined>;
  /** Blocking owner items, already reduced to one per venture by the caller. */
  blocking: Record<string, { title: string; href: string } | undefined>;
  /** Ventures whose rooms are held by a countersigned decision rather than by a fault. */
  heldIds?: readonly string[];
  /**
   * When the owner-attention collector last wrote, and today, so the board can say how old the
   * "Needs you" column is. A board that reports a stale blocker as current is worse than one that
   * reports it with its age, so the age travels with the figure rather than being assumed fresh.
   */
  attentionAsOf?: string | null;
  today?: string;
  /** The newest approved GoVIRAL plan, already read by the caller that owns that directory. */
  brief?: {
    date: string;
    title: string;
    tactics: ReadonlyArray<{ description: string }>;
    href: string;
  } | null;
}

/** Whole days between two `YYYY-MM-DD` dates, or null when either is unusable. */
function ageInDays(asOf: string | null | undefined, today: string | undefined): number | null {
  if (!asOf || !today) return null;
  const from = Date.parse(`${asOf}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * How a venture reads at a glance.
 *
 * `held` outranks everything: a room the owner deliberately stopped is not a problem to solve, and
 * showing it as one is how a board trains its reader to ignore it. After that a blocking item wins
 * over a delivery, because the point of the board is what needs a person.
 */
function stateFor(input: {
  held: boolean;
  blocking: boolean;
  delivered: boolean;
}): LaunchState {
  if (input.held) return "held";
  if (input.blocking) return "attention";
  return input.delivered ? "shipping" : "ready";
}

export function buildLaunchBoard(inputs: LaunchBoardInputs): LaunchBoard {
  const held = new Set(inputs.heldIds ?? []);
  const rows = inputs.ventures.map((venture): LaunchBoardRow => {
    const blocking = inputs.blocking[venture.id] ?? null;
    const lastDelivery = inputs.deliveries[venture.id] ?? null;
    const state = stateFor({
      held: held.has(venture.id),
      blocking: blocking !== null,
      delivered: lastDelivery !== null
    });
    return {
      id: venture.id,
      name: venture.name,
      state,
      stateLabel: STATE_LABELS[state],
      lastDelivery,
      nextSlot: inputs.slots[venture.id] ?? null,
      image: inputs.images[venture.id] ?? null,
      social: inputs.social[venture.id] ?? null,
      blocking
    };
  });

  const blockingCount = rows.filter((row) => row.state === "attention").length;
  const shippingCount = rows.filter((row) => row.state === "shipping").length;
  const plateFalls = rows.filter((row) => row.image?.fellToPlate === true).length;

  const ageDays = ageInDays(inputs.attentionAsOf, inputs.today);
  const stale = ageDays !== null && ageDays > 1;

  // One sentence, and it names a number rather than a mood. "Needs you" beats "some pictures fell
  // back", because a person can only act on the first.
  //
  // The blocking count is only as fresh as the collector that produced it, so when that file is
  // behind, the headline says as of when rather than asserting today. A loud red number the owner
  // has already cleared is how a board loses its reader on the first look.
  const verdict = blockingCount > 0
    ? {
        tone: "risk" as const,
        headline: stale
          ? `${blockingCount} of ${rows.length} ventures needed you as of ${inputs.attentionAsOf}`
          : `${blockingCount} of ${rows.length} ventures need you`,
        detail: stale
          ? `Everything else is running. That reading is ${ageDays} days old — anything cleared since still appears below.`
          : "Everything else is running. The blocking item is on each row."
      }
    : plateFalls > 0
      ? {
          tone: "warning" as const,
          headline: "Nothing is blocked",
          detail: `${plateFalls} ${plateFalls === 1 ? "venture" : "ventures"} last shipped the drawn plate rather than a photograph.`
        }
      : {
          tone: "success" as const,
          headline: "Nothing is blocked",
          detail: `${shippingCount} of ${rows.length} ventures have shipped.`
        };

  /*
   * The brief, or the reason there is not one.
   *
   * A missing plan directory and a room that met and found nothing are different facts, and the
   * one the owner needs is which. The caller reads the directory; a null from it means no approved
   * plan exists at all, which for this venture has been true since it was founded.
   */
  const brief: LaunchBoard["brief"] = inputs.brief
    ? {
        date: inputs.brief.date,
        title: inputs.brief.title,
        calls: inputs.brief.tactics
          .map(({ description }) => description)
          .filter((description) => description.startsWith("Trend call:"))
          .map((description) => description.slice("Trend call:".length).trim())
          .slice(0, 4),
        href: inputs.brief.href
      }
    : { unavailable: "GoVIRAL has not produced a weekly brief yet. The Monday room opens, finds no scout data and spends nothing until its source quota has a token to spend." };

  return {
    rows,
    brief,
    verdict,
    blockingCount,
    shippingCount,
    attention: { asOf: inputs.attentionAsOf ?? null, ageDays, stale }
  };
}
