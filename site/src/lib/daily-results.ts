import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { publicAgentText } from "@/components/agent-language";
import { readsAsMachineText } from "@/lib/public-prose";
import { publicKindLabel } from "@/lib/slot-labels";

/**
 * The daily results ledger, read from the digest receipts the night cycle already writes.
 *
 * These receipts were built to be emailed. The email path is dropped, but the data is the
 * honest record of what each venture produced in a day and what it cost, so it is rendered
 * here instead. Nothing new is computed: a row is one meeting a venture held, and the
 * failure column is the digest's own failure operations for that venture.
 */
export interface DailyResultRow {
  ventureId: string;
  ventureLabel: string;
  kind: string;
  output: string;
  roomLink: string | null;
  status: "produced" | "no-output" | "failed" | "not-held";
  costUsd: number;
  failureReason: string | null;
}

export interface DailyResult {
  date: string;
  portfolioLine: string;
  rows: DailyResultRow[];
  totalCostUsd: number;
  /**
   * True when no digest exists for this date at all.
   *
   * A day with no digest is not a day with nothing on it — 4 and 6 August both produced work —
   * it is a night cycle that did not write its summary. The page said nothing about either, so
   * the gaps read as days the company did nothing.
   */
  missing?: boolean;
}

/** How each project's quarterly outcomes stood on the morning of a given day. */
export interface VentureKpiStatus {
  ventureId: string;
  ventureLabel: string;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  unavailable: number;
}

const VENTURE_LABELS: Record<string, string> = {
  global: "Global board",
  "caught-up": "DNESKAi",
  "mma-files": "MMA Files",
  fightaiq: "FightAIQ",
  "titty-tuesdays": "Titty Tuesdays",
  "carousel-studio": "Carousel Studio"
};

export function ventureLabel(ventureId: string): string {
  return VENTURE_LABELS[ventureId] ?? ventureId;
}

interface DigestBullet { text?: unknown; roomLink?: unknown }
interface DigestMeeting {
  ventureId?: unknown;
  kind?: unknown;
  held?: unknown;
  bullets?: unknown;
  costUsd?: unknown;
}
interface DigestOperation { ventureId?: unknown; type?: unknown; status?: unknown; text?: unknown }
interface DigestReceipt {
  mode?: unknown;
  status?: unknown;
  digest?: {
    date?: unknown;
    meetings?: unknown;
    operations?: unknown;
    portfolioLine?: unknown;
  };
}

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * A meeting that was held but produced nothing is not the same as one that failed, and
 * neither is the same as a slot that never ran. Keeping them distinct is the point of the
 * column: "no-output" is frequently the correct outcome under the evidence gates.
 */
function rowStatus(held: boolean, output: string, failure: string | null): DailyResultRow["status"] {
  if (!held) return "not-held";
  if (failure) return "failed";
  if (/^NO_EDITION|^NO_ACTION|\bno externally consequential\b|\bzero candidate\b/iu.test(output)) return "no-output";
  return "produced";
}

export function parseDailyResult(raw: unknown): DailyResult | null {
  const receipt = raw as DigestReceipt;
  const digest = receipt.digest;
  if (!digest || typeof digest !== "object") return null;
  const date = text(digest.date);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;

  const operations = Array.isArray(digest.operations) ? (digest.operations as DigestOperation[]) : [];
  const failureByVenture = new Map<string, string>();
  for (const operation of operations) {
    if (text(operation.type) !== "failure") continue;
    // A failure operation with status "none" is the digest saying nothing went wrong — for
    // example "No social publishing failure was recorded today." Treating it as a failure
    // reason marked every global meeting Failed on /results.
    if (text(operation.status) === "none") continue;
    const venture = text(operation.ventureId);
    const detail = text(operation.text).trim();
    if (!venture || !detail || failureByVenture.has(venture)) continue;
    const plain = publicAgentText(detail);
    if (readsAsMachineText(plain)) continue;
    failureByVenture.set(venture, plain);
  }

  const meetings = Array.isArray(digest.meetings) ? (digest.meetings as DigestMeeting[]) : [];
  const rows: DailyResultRow[] = meetings.map((meeting) => {
    const ventureId = text(meeting.ventureId, "global");
    const bullets = Array.isArray(meeting.bullets) ? (meeting.bullets as DigestBullet[]) : [];
    // The digest writes these bullets for an operator and they reached the public results
    // table verbatim, machine slugs and idea references included.
    // The digests already committed were written before the plain-at-source fix, so they still
    // carry a CI runner path, a failing command line and stop codes. The word list cannot turn
    // those into sentences; what it cannot rescue is dropped rather than shown to a reader.
    const output = bullets
      .map((bullet) => publicAgentText(text(bullet.text).trim()))
      .filter((line) => line.length > 0 && !readsAsMachineText(line))
      .join(" · ") || "No summary recorded.";
    const roomLink = bullets.map((bullet) => text(bullet.roomLink)).find((link) => link.startsWith("/")) ?? null;
    const held = meeting.held === true;
    const failureReason = failureByVenture.get(ventureId) ?? null;
    return {
      ventureId,
      ventureLabel: ventureLabel(ventureId),
      kind: publicKindLabel(text(meeting.kind, "unknown")),
      output,
      roomLink,
      status: rowStatus(held, output, failureReason),
      costUsd: num(meeting.costUsd),
      failureReason
    };
  });

  return {
    date,
    portfolioLine: text(digest.portfolioLine).trim(),
    rows: rows.sort((left, right) => left.ventureLabel.localeCompare(right.ventureLabel)),
    totalCostUsd: Number(rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(6))
  };
}

/**
 * The morning KPI snapshot, grouped by project.
 *
 * A day's table says what each project produced; this says whether producing it is moving the
 * outcome the project is measured on. One is the work and the other is whether the work counts,
 * and they were on two different pages.
 */
export async function getVentureKpiStatuses(root = repositoryRoot()): Promise<VentureKpiStatus[]> {
  let snapshot: { statuses?: unknown };
  try {
    snapshot = JSON.parse(
      await readFile(path.join(root, "state/kpis/latest.json"), "utf8")
    ) as { statuses?: unknown };
  } catch {
    return [];
  }
  const statuses = Array.isArray(snapshot.statuses) ? snapshot.statuses : [];
  const byVenture = new Map<string, VentureKpiStatus>();
  for (const entry of statuses as Array<{ venture?: unknown; status?: unknown }>) {
    const ventureId = text(entry.venture);
    const status = text(entry.status);
    if (!ventureId) continue;
    const current = byVenture.get(ventureId) ?? {
      ventureId,
      ventureLabel: ventureLabel(ventureId),
      onTrack: 0,
      atRisk: 0,
      offTrack: 0,
      unavailable: 0
    };
    if (status === "on-track") current.onTrack += 1;
    else if (status === "at-risk") current.atRisk += 1;
    else if (status === "off-track") current.offTrack += 1;
    else current.unavailable += 1;
    byVenture.set(ventureId, current);
  }
  return [...byVenture.values()].sort((left, right) =>
    left.ventureLabel.localeCompare(right.ventureLabel));
}

/**
 * Every day from the newest digest back to the oldest, with the ones that have no digest named.
 *
 * The page used to render only the days a digest exists for, so a missing summary was invisible:
 * 4 and 6 August simply were not on the list, and a reader had no way to tell a quiet day from
 * an unrecorded one.
 */
export function withMissingDays(days: readonly DailyResult[]): DailyResult[] {
  if (days.length === 0) return [];
  const known = new Map(days.map((day) => [day.date, day]));
  const dates = [...known.keys()].sort();
  const first = Date.parse(`${dates[0]!}T00:00:00.000Z`);
  const last = Date.parse(`${dates.at(-1)!}T00:00:00.000Z`);
  const filled: DailyResult[] = [];
  for (let at = first; at <= last; at += 86_400_000) {
    const date = new Date(at).toISOString().slice(0, 10);
    filled.push(known.get(date) ?? {
      date,
      portfolioLine: "",
      rows: [],
      totalCostUsd: 0,
      missing: true
    });
  }
  return filled.reverse();
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

export async function getDailyResults(root = repositoryRoot()): Promise<DailyResult[]> {
  const directory = path.join(root, "state/notify/digest");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name));
  } catch {
    return [];
  }
  const parsed = await Promise.all(
    files.map(async (name) => {
      try {
        return parseDailyResult(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      } catch {
        return null;
      }
    })
  );
  // Most recent first.
  return parsed.filter((entry): entry is DailyResult => entry !== null).sort((left, right) => right.date.localeCompare(left.date));
}
