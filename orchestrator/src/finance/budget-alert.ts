import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";

export interface AllInCostEntry {
  at: string;
  ventureId: string;
  category: "model" | "avatar" | "media" | "source" | "service" | "subscription";
  usd: number;
  ref: string;
}

export interface AllInBudgetStatus {
  month: string;
  spentUsd: number;
  capUsd: number;
  ratio: number;
  warning: boolean;
  exhausted: boolean;
  byVenture: Record<string, number>;
}

export function allInBudgetStatus(
  entries: readonly AllInCostEntry[],
  month: string,
  capUsd: number
): AllInBudgetStatus {
  if (!/^\d{4}-\d{2}$/u.test(month) || !Number.isFinite(capUsd) || capUsd <= 0) throw new Error("All-in budget period or cap is invalid");
  const current = entries.filter((entry) => entry.at.startsWith(month));
  const byVenture: Record<string, number> = {};
  for (const entry of current) {
    if (!Number.isFinite(entry.usd) || entry.usd < 0) throw new Error(`Invalid all-in cost ${entry.ref}`);
    byVenture[entry.ventureId] = Number(((byVenture[entry.ventureId] ?? 0) + entry.usd).toFixed(8));
  }
  const spentUsd = Number(Object.values(byVenture).reduce((sum, value) => sum + value, 0).toFixed(8));
  const ratio = spentUsd / capUsd;
  return { month, spentUsd, capUsd, ratio, warning: ratio >= 0.8, exhausted: ratio >= 1, byVenture };
}

export function assertAllInSpendAvailable(status: AllInBudgetStatus, requestedUsd: number): void {
  if (!Number.isFinite(requestedUsd) || requestedUsd < 0) throw new Error("Requested all-in spend is invalid");
  if (status.spentUsd + requestedUsd > status.capUsd) throw new Error("Hard monthly all-in operating cap exceeded");
}

export function threeConsecutiveExhaustions(dates: readonly string[]): boolean {
  const unique = [...new Set(dates)].sort();
  if (unique.length < 3) return false;
  for (let index = 2; index < unique.length; index += 1) {
    const first = Date.parse(`${unique[index - 2]}T12:00:00.000Z`);
    const third = Date.parse(`${unique[index]}T12:00:00.000Z`);
    if (third - first === 2 * 86_400_000) return true;
  }
  return false;
}

export interface BudgetAlertSink {
  readonly mode: "log" | "resend";
  send(input: { date: string; subject: string; text: string; html: string }): Promise<void>;
}

function breakdown(status: AllInBudgetStatus): string {
  return Object.entries(status.byVenture).sort(([left], [right]) => left.localeCompare(right)).map(([venture, usd]) => `${venture}: $${usd.toFixed(2)}`).join(", ") || "no tagged costs";
}

async function addInboxOnce(root: string, id: string, detail: string): Promise<void> {
  const current = await readText(root, "INBOX.md", "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n");
  if (current.includes(id)) return;
  const item = `- [ ] HUMAN_APPROVAL ${id} — ${detail}`;
  const next = current.includes("## Pending\n\nNone.")
    ? current.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
    : current.replace("## Resolved", `${item}\n\n## Resolved`);
  await atomicWriteText(root, "INBOX.md", next);
}

export interface OfficeMode {
  schemaVersion: 1;
  mode: "open" | "read-only";
  month: string;
  since: string;
  spentUsd: number;
  capUsd: number;
}

export const OFFICE_MODE_PATH = "budget/office-mode.json";

/**
 * Record whether the month's limit has closed the office, so a run can stop before it starts.
 *
 * Nothing here decides anything new. `assertSharedReservation` already refuses every call once
 * the all-in cap is spent; what it cannot do is say so before a room has read its agenda, built
 * its packet and reached its first seat, and what the owner saw instead was a room that opened
 * and then stopped for no stated reason. This is that same fact, written down once a day.
 *
 * It is keyed to the month for a reason: a month that ends opens the office with no manual
 * step and no second decision. It is deliberately **not** keyed to the three-consecutive-day
 * rule, even though that rule also stops spending — `budget/exhaustions.json` accumulates dates
 * for the life of the repository, so `threeConsecutiveExhaustions` stays true forever once any
 * three consecutive days have ever exhausted the pace, and a read-only flag driven by it would
 * close the office permanently. The daily alert keeps owning that rule.
 */
export async function writeOfficeMode(input: {
  root: string;
  status: AllInBudgetStatus;
  now: Date;
}): Promise<OfficeMode["mode"]> {
  const mode: OfficeMode["mode"] = input.status.exhausted ? "read-only" : "open";
  const previous = await readJson<Partial<OfficeMode> | null>(input.root, OFFICE_MODE_PATH, null);
  // Keep the timestamp of the transition rather than of the last run, so "since" answers when
  // the office closed and not when something last looked at it.
  const since = previous?.mode === mode && previous.month === input.status.month && typeof previous.since === "string"
    ? previous.since
    : input.now.toISOString();
  await atomicWriteJson(input.root, OFFICE_MODE_PATH, {
    schemaVersion: 1,
    mode,
    month: input.status.month,
    since,
    spentUsd: Number(input.status.spentUsd.toFixed(8)),
    capUsd: input.status.capUsd
  } satisfies OfficeMode);
  return mode;
}

/**
 * Whether a stored office-mode record closes the office for `month`.
 *
 * Every unreadable shape answers "open". A malformed flag must not be able to halt the company
 * — the caps that actually refuse spending are unaffected either way, so the only thing a
 * strict read could buy here is an outage caused by a typo.
 */
export function officeIsReadOnly(record: unknown, month: string): boolean {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Partial<OfficeMode>;
  return candidate.mode === "read-only" && candidate.month === month;
}

/**
 * Open one owner notice when the month passes 80% of the all-in limit.
 *
 * `budget-2026-08d` requires the daily summary to warn at 80% and an approval item at 100%, and
 * both already exist. The gap was between them: the warning lives in one day's digest, so an
 * owner who does not read that morning's email meets the limit as a refusal. This puts the same
 * sentence somewhere that persists, once per month, and it is a notice rather than a gate —
 * nothing is blocked, nothing is approved and no money moves, which is why it needs no new
 * authority. At and beyond 100% it stands down so `sendBudgetAlert` is the only voice.
 */
export async function sendBudgetPaceWarning(input: {
  root: string;
  status: AllInBudgetStatus;
  now: Date;
}): Promise<"not-needed" | "opened" | "already-open"> {
  if (!input.status.warning || input.status.exhausted) return "not-needed";
  const relative = `notify/budget-pace/${input.status.month}.json`;
  const previous = await readJson<{ status?: string } | null>(input.root, relative, null);
  if (previous?.status === "opened") return "already-open";
  const line = budgetWarningLine(input.status);
  if (!line) return "not-needed";
  await addInboxOnce(
    input.root,
    `BUDGET-PACE-${input.status.month}`,
    `${line} This is a notice, not a request: nothing is blocked and no approval is needed. Spending stops on its own at $${input.status.capUsd.toFixed(2)} under state/decisions/2026-08-04-budget-fifty.md.`
  );
  await atomicWriteJson(input.root, relative, {
    schemaVersion: 1,
    status: "opened",
    month: input.status.month,
    spentUsd: Number(input.status.spentUsd.toFixed(8)),
    capUsd: input.status.capUsd,
    openedAt: input.now.toISOString()
  });
  return "opened";
}

export async function sendBudgetAlert(input: {
  root: string;
  status: AllInBudgetStatus;
  dailyExhaustionDates: string[];
  sink: BudgetAlertSink;
  now: Date;
}): Promise<"not-needed" | "sent" | "failed"> {
  await writeOfficeMode({ root: input.root, status: input.status, now: input.now });
  if (!input.status.exhausted && !threeConsecutiveExhaustions(input.dailyExhaustionDates)) return "not-needed";
  const relative = `notify/budget-alert/${input.status.month}.json`;
  const previous = await readJson<{ status?: string } | null>(input.root, relative, null);
  if (previous?.status === "sent") return "sent";
  const costBreakdown = breakdown(input.status);
  const text = `BoardlessAI spending has stopped. ${input.status.month} all-in use is $${input.status.spentUsd.toFixed(2)} of $${input.status.capUsd.toFixed(2)}. By project: ${costBreakdown}. Already reduced: the second magazine slot first, then the first magazine slot, then FightAIQ analysis. Options for the owner: keep work paused; reduce article frequency; pause FightAIQ analysis; or countersign a new limit. The system cannot raise or move the limit.`;
  const subject = `[BoardlessAI] Spending stopped for ${input.status.month}`;
  await addInboxOnce(input.root, `BUDGET-EXHAUSTED-${input.status.month}`, `${text} Review state/decisions/2026-08-04-budget-fifty.md before changing any number.`);
  try {
    await input.sink.send({ date: input.now.toISOString().slice(0, 10), subject, text, html: `<p>${text}</p>` });
    await atomicWriteJson(input.root, relative, { schemaVersion: 1, status: "sent", subject, breakdown: input.status.byVenture, sentAt: input.now.toISOString() });
    return "sent";
  } catch {
    await atomicWriteJson(input.root, relative, { schemaVersion: 1, status: "failed", subject, breakdown: input.status.byVenture, failedAt: input.now.toISOString() });
    return "failed";
  }
}

export function budgetWarningLine(status: AllInBudgetStatus): string | null {
  if (!status.warning) return null;
  return `All-in warning: $${status.spentUsd.toFixed(2)} of $${status.capUsd.toFixed(2)} used. By project: ${breakdown(status)}.`;
}
