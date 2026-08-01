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

export async function sendBudgetAlert(input: {
  root: string;
  status: AllInBudgetStatus;
  dailyExhaustionDates: string[];
  sink: BudgetAlertSink;
  now: Date;
}): Promise<"not-needed" | "sent" | "failed"> {
  if (!input.status.exhausted && !threeConsecutiveExhaustions(input.dailyExhaustionDates)) return "not-needed";
  const relative = `notify/budget-alert/${input.status.month}.json`;
  const previous = await readJson<{ status?: string } | null>(input.root, relative, null);
  if (previous?.status === "sent") return "sent";
  const costBreakdown = breakdown(input.status);
  const text = `BoardlessAI spending has stopped. ${input.status.month} all-in use is $${input.status.spentUsd.toFixed(2)} of $${input.status.capUsd.toFixed(2)}. By project: ${costBreakdown}. Already reduced: incubator first, then the second magazine slot, then the first magazine slot, then FightAIQ analysis. Options for the owner: keep work paused; reduce article frequency; pause FightAIQ analysis; or countersign a new limit. The system cannot raise or move the limit.`;
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
