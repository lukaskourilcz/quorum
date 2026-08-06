import { createHash } from "node:crypto";
import {
  DailyDigestSchema,
  countWords,
  type DailyDigest
} from "../contracts/daily-digest.js";
import type { MeetingRecord } from "../contracts/meeting-record.js";
import type { ResolvedMeetingSlot } from "../ventures/registry.js";
import { safeFetch } from "../security/url.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { budgetWarningLine, type AllInBudgetStatus } from "../finance/budget-alert.js";
import type { DigestOperation } from "../contracts/daily-digest.js";

const REQUIRED_DIGESTS_PER_MONTH = 31;
const REQUIRED_DIGESTS_PER_DAY = 1;

function truncateWords(value: string, maximum: number): string {
  const words = value.trim().replaceAll(/\s+/g, " ").split(" ").filter(Boolean);
  const wordLimited = words.length <= maximum
    ? words.join(" ")
    : `${words.slice(0, maximum - 1).join(" ")}…`;
  if (wordLimited.length <= 240) return wordLimited;
  return `${wordLimited.slice(0, 239).trimEnd()}…`;
}

function slotRecord(records: readonly MeetingRecord[], date: string, phase: string) {
  return records.find((record) =>
    record.date === date && (record.kind === phase || (record.kind === "venture" && record.phase === phase))
  );
}

function ventureId(record: MeetingRecord | undefined, phase: string): string {
  if (record?.kind === "venture" || ["morning", "afternoon", "night"].includes(phase)) return "global";
  if (phase.startsWith("cu-")) return "caught-up";
  if (phase === "tt-marketing") return "titty-tuesdays";
  if (phase.startsWith("mma-")) return "fightaiq";
  if (phase.startsWith("mag-") || phase.startsWith("article-")) return "mma-files";
  // Every live phase is named above. A record whose phase is not — one of the two retired
  // incubator kinds, read back from the August archive — belongs to no current venture.
  return "global";
}

function roomLink(date: string, record: MeetingRecord | undefined, phase: string, weekOf: string): string {
  if (!record) return `/calendar/${weekOf}`;
  if (record.kind === "venture") return `/standups/${record.cycleId}/room`;
  return `/meetings/${date}-${phase}`;
}

export function buildDailyDigest(input: {
  date: string;
  weekOf: string;
  records: readonly MeetingRecord[];
  schedule: readonly ResolvedMeetingSlot[];
  dailyBudgetUsd: number;
  allInBudget?: AllInBudgetStatus;
  finalMeetingFailed?: boolean;
  operations?: readonly DigestOperation[];
  /** What the two article slots did. They have no meeting record to read. */
  articleSlots?: readonly { date: string; slot: "am" | "pm"; status: string; reason?: string }[];
  /** The day's recorded API spend, from the ledger rather than from per-meeting totals. */
  spentUsd?: number;
}): DailyDigest {
  const articleOutcome = (phase: string) => phase === "article-am" || phase === "article-pm"
    ? (input.articleSlots ?? []).find((entry) => entry.date === input.date && `article-${entry.slot}` === phase)
    : undefined;
  const meetings = input.schedule.map((slot, index) => {
    const article = articleOutcome(slot.phase);
    if (article) {
      // Article production writes a run file and no meeting record, so both slots reported
      // "was not held" on the day one of them published.
      return {
        ventureId: "mma-files",
        kind: slot.phase,
        held: article.status === "published",
        bullets: [{
          text: truncateWords(article.status === "published"
            ? "The desk published this slot's article."
            : article.reason ?? `The desk did not publish this slot: ${article.status}.`, 20),
          roomLink: `/calendar/${input.weekOf}`
        }],
        costUsd: 0
      };
    }
    const record = slotRecord(input.records, input.date, slot.phase);
    const finalFailure = input.finalMeetingFailed === true && index === input.schedule.length - 1;
    const held = Boolean(record && !finalFailure && !["PAUSED", "FAILED"].includes(record.status));
    const summary = finalFailure
      ? "Final scheduled cycle failed; inspect the workflow and public room index."
      : record
        ? record.decision.summary
        : `${slot.label} was not held; inspect the public week schedule.`;
    return {
      ventureId: ventureId(record, slot.phase),
      kind: slot.phase,
      held,
      bullets: [{
        text: truncateWords(summary, 20),
        roomLink: roomLink(input.date, record, slot.phase, input.weekOf)
      }],
      costUsd: record?.ledger.actualCycleUsd ?? 0
    };
  });
  // The day's real spend. Summing per-meeting totals missed every phase without a meeting
  // record — article production above all — and missed a room whose record carries 0, so the
  // digest reported $0.0693 on a day the ledger held $0.6767.
  const spend = input.spentUsd ?? meetings.reduce((sum, meeting) => sum + meeting.costUsd, 0);
  const warning = input.allInBudget ? budgetWarningLine(input.allInBudget) : null;
  const portfolioLine = warning ?? `Recorded API spend $${spend.toFixed(4)} against the $${input.dailyBudgetUsd.toFixed(2)} daily budget.`;
  const operations = [...(input.operations ?? [])];
  const bodyWordCount = countWords(portfolioLine) + meetings.reduce(
    (sum, meeting) => sum + meeting.bullets.reduce((total, bullet) => total + countWords(bullet.text), 0),
    0
  ) + operations.reduce((sum, operation) => sum + countWords(operation.text), 0);
  return DailyDigestSchema.parse({
    schemaVersion: "daily-digest/1",
    date: input.date,
    meetings,
    operations,
    portfolioLine,
    bodyWordCount
  });
}

export function renderDailyDigestText(digest: DailyDigest): string {
  const groups = new Map<string, DailyDigest["meetings"]>();
  for (const meeting of digest.meetings) {
    groups.set(meeting.ventureId, [...(groups.get(meeting.ventureId) ?? []), meeting]);
  }
  return [
    digest.portfolioLine,
    ...[...groups.entries()].flatMap(([venture, meetings]) => [
      venture,
      ...meetings.flatMap((meeting) => meeting.bullets.map((bullet) =>
        `- ${meeting.held ? "Held" : "Skipped"}: ${bullet.text} ${bullet.roomLink}`
      ))
    ]),
    "operations",
    ...digest.operations.map((operation) =>
      `- ${operation.type}: ${operation.text}${operation.ref ? ` [${operation.ref}]` : ""}`
    )
  ].join("\n");
}

export async function finalizeDigestText(
  draft: string,
  roomsLink: string,
  compress?: (value: string) => Promise<string>
): Promise<{ text: string; compressed: boolean; truncated: boolean }> {
  if (countWords(draft) <= 400) return { text: draft, compressed: false, truncated: false };
  const compressed = compress ? await compress(draft) : draft;
  if (countWords(compressed) <= 400) return { text: compressed, compressed: true, truncated: false };
  const words = compressed.trim().split(/\s+/u).filter(Boolean).slice(0, 397);
  return {
    text: `${words.join(" ")} Full rooms: ${roomsLink}`,
    compressed: true,
    truncated: true
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderDailyDigestHtml(digest: DailyDigest, text: string): string {
  return `<!doctype html><html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif"><main style="max-width:640px;margin:0 auto;padding:36px 24px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#fe45e2">BoardlessAI · Daily digest · ${escapeHtml(digest.date)}</p><pre style="white-space:pre-wrap;font:15px/1.65 Arial,Helvetica,sans-serif;color:#d4d4d8">${escapeHtml(text)}</pre><div style="height:4px;background:#ff5a00;margin-top:28px"></div></main></body></html>`;
}

export interface DailyDigestSink {
  readonly mode: "log" | "resend";
  send(input: { date: string; subject: string; text: string; html: string }): Promise<void>;
}

export class DailyDigestLogSink implements DailyDigestSink {
  readonly mode = "log" as const;
  async send(): Promise<void> {}
}

export class DigestTierError extends Error {}

export class ResendDailyDigestSink implements DailyDigestSink {
  readonly mode = "resend" as const;
  constructor(private readonly input: {
    apiKey: string;
    from: string;
    to: string[];
    allowHosts: readonly string[];
    freeTierMonthly: number;
    freeTierDaily: number;
    fetchImpl?: typeof fetch;
    resolveImpl?: (hostname: string) => Promise<string[]>;
  }) {}

  async send(message: { date: string; subject: string; text: string; html: string }): Promise<void> {
    if (!this.input.apiKey || !this.input.from || this.input.to.length === 0) throw new Error("Daily digest email configuration is incomplete");
    if (!/(?:^|<)digest@[^>\s]+>?$/i.test(this.input.from)) throw new Error("Daily digest sender must use digest@<verified-domain>");
    const monthly = REQUIRED_DIGESTS_PER_MONTH * this.input.to.length;
    const daily = REQUIRED_DIGESTS_PER_DAY * this.input.to.length;
    if (this.input.freeTierMonthly < monthly || this.input.freeTierDaily < daily) {
      throw new DigestTierError(`Verified Resend limits do not cover ${monthly}/month and ${daily}/day`);
    }
    await safeFetch("https://api.resend.com/emails", {
      allowHosts: this.input.allowHosts,
      method: "POST",
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": createHash("sha256").update(`daily-digest:${message.date}`).digest("hex")
      },
      body: JSON.stringify({ from: this.input.from, to: this.input.to, subject: message.subject, text: message.text, html: message.html }),
      maxBytes: 100_000,
      ...(this.input.fetchImpl ? { fetchImpl: this.input.fetchImpl } : {}),
      ...(this.input.resolveImpl ? { resolveImpl: this.input.resolveImpl } : {})
    });
  }
}

function positiveInteger(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function dailyDigestSinkFromEnvironment(input: {
  environment?: NodeJS.ProcessEnv;
  allowHosts: readonly string[];
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}): DailyDigestSink {
  const environment = input.environment ?? process.env;
  if (environment.DAILY_DIGEST_EMAIL_MODE !== "resend") return new DailyDigestLogSink();
  return new ResendDailyDigestSink({
    apiKey: environment.RESEND_API_KEY ?? "",
    from: environment.DAILY_DIGEST_EMAIL_FROM ?? "",
    to: (environment.DAILY_DIGEST_EMAIL_TO ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 50),
    allowHosts: input.allowHosts,
    freeTierMonthly: positiveInteger(environment.RESEND_FREE_TIER_MONTHLY),
    freeTierDaily: positiveInteger(environment.RESEND_FREE_TIER_DAILY),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
}

async function addInboxOnce(root: string, id: string, detail: string): Promise<void> {
  const current = await readText(root, "INBOX.md", "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n");
  if (current.includes(id)) return;
  const item = `- [ ] INBOX ${id} — ${detail}`;
  const next = current.includes("## Pending\n\nNone.")
    ? current.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
    : current.replace("## Resolved", `${item}\n\n## Resolved`);
  await atomicWriteText(root, "INBOX.md", next);
}

export async function sendDailyDigest(input: {
  digest: DailyDigest;
  sink: DailyDigestSink;
  stateRoot: string;
  roomsLink: string;
  now?: Date;
  compress?: (value: string) => Promise<string>;
}): Promise<"sent" | "failed"> {
  const relative = `notify/digest/${input.digest.date}.json`;
  const previous = await readJson<{ status?: string } | null>(input.stateRoot, relative, null);
  if (previous?.status === "sent") return "sent";
  const finalized = await finalizeDigestText(renderDailyDigestText(input.digest), input.roomsLink, input.compress);
  const subject = `[BoardlessAI] Digest — ${input.digest.date}`;
  try {
    await input.sink.send({ date: input.digest.date, subject, text: finalized.text, html: renderDailyDigestHtml(input.digest, finalized.text) });
    await atomicWriteJson(input.stateRoot, relative, {
      schemaVersion: 1,
      mode: input.sink.mode,
      status: "sent",
      subject,
      digest: input.digest,
      bodyWordCount: countWords(finalized.text),
      compressed: finalized.compressed,
      truncated: finalized.truncated,
      sentAt: (input.now ?? new Date()).toISOString()
    });
    return "sent";
  } catch (error) {
    if (error instanceof DigestTierError) {
      await addInboxOnce(input.stateRoot, "DAILY-DIGEST-TIER-UNVERIFIED", "Configured Resend limits do not cover one daily digest. No paid tier is authorized.");
    }
    await atomicWriteJson(input.stateRoot, relative, {
      schemaVersion: 1,
      mode: input.sink.mode,
      status: "failed",
      subject,
      failedAt: (input.now ?? new Date()).toISOString()
    });
    return "failed";
  }
}
