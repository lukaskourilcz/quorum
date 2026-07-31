import { createHash } from "node:crypto";
import {
  MeetingEmailSchema,
  type MeetingEmail
} from "../contracts/meeting-email.js";
import type { MeetingRecord } from "../contracts/meeting-record.js";
import { safeFetch } from "../security/url.js";
import {
  atomicWriteJson,
  atomicWriteText,
  readJson,
  readText
} from "../state.js";
import { meetingRef } from "../meetings/record.js";

const REQUIRED_MEETING_EMAILS_PER_MONTH = 150;
const REQUIRED_MEETING_EMAILS_PER_DAY = 5;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function meetingLabel(kind: MeetingEmail["kind"]): string {
  if (kind === "cu-edition") return "Edition room";
  if (kind === "cu-product") return "Product room";
  return "Venture standup";
}

function firstSentences(value: string, maximum = 3): string {
  return value.trim().split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, maximum).join(" ").slice(0, 900);
}

function subjectDecision(record: MeetingRecord): string {
  const summary = record.decision.summary
    .replace(new RegExp(`^${record.decision.outcome}[.:]?\\s*`, "i"), "")
    .trim();
  if (record.kind === "cu-edition") {
    return record.decision.outcome === "NO_EDITION"
      ? `No edition: ${summary}`
      : `Story: ${summary}`;
  }
  if (record.kind === "cu-product") return `Verdict: ${summary}`;
  return `Decision: ${summary}`;
}

export function buildMeetingEmail(input: {
  record: MeetingRecord;
  boardlessBaseUrl: string;
  editionUrl?: string;
}): MeetingEmail {
  const cost = input.record.ledger.actualCycleUsd;
  if (cost === null) throw new Error("Meeting email requires a measured meeting cost");
  const kind = input.record.kind;
  if (kind === "tt-marketing") {
    throw new Error("Titty Tuesdays meetings use the daily portfolio digest, not per-meeting email");
  }
  const reference = kind === "venture"
    ? `standups/${input.record.cycleId}`
    : meetingRef(input.record.date, kind);
  const roomPath = kind === "venture" ? `${reference}/room` : reference;
  const votes = input.record.voteMatrix.map(
    (vote) => `${vote.veto ? "⛔" : "✓"} ${vote.voter}: ${vote.firstChoice}`
  );
  const bestTurn = input.record.roomTranscript.turns.find((turn) => turn.agent === "STET")
    ?? input.record.roomTranscript.turns.find((turn) => turn.mode === "raises-concern")
    ?? input.record.roomTranscript.turns.find((turn) => turn.mode === "response");
  const prefix = `BoardlessAI — ${meetingLabel(kind)} — `;
  const subject = `${prefix}${subjectDecision(input.record)}`.slice(0, 180);
  return MeetingEmailSchema.parse({
    schemaVersion: "meeting-email/1",
    meetingRef: reference,
    kind,
    subject,
    decisionLine: input.record.decision.summary.slice(0, 280),
    voteLine: `${votes.join(" · ")} · ${input.record.voteMatrix.some((vote) => vote.veto) ? "veto flag: yes" : "veto flag: no"}`.slice(0, 280),
    summary: firstSentences(input.record.operatingBrief),
    ...(bestTurn ? { bestExchange: { agent: bestTurn.agent, text: bestTurn.text } } : {}),
    links: {
      room: `${input.boardlessBaseUrl.replace(/\/$/, "")}/${roomPath}`,
      ...(input.editionUrl ? { edition: input.editionUrl } : {})
    },
    meetingCostUsd: cost
  });
}

export function renderMeetingEmailHtml(payload: MeetingEmail): string {
  const exchange = payload.bestExchange
    ? `<blockquote style="margin:24px 0;padding:16px 18px;border-left:3px solid #fe45e2;background:#18181b;color:#f4f4f5"><strong style="color:#fe45e2">${escapeHtml(payload.bestExchange.agent)}</strong><br><span style="line-height:1.6">${escapeHtml(payload.bestExchange.text)}</span></blockquote>`
    : "";
  const edition = payload.links.edition
    ? ` · <a href="${escapeHtml(payload.links.edition)}" style="color:#ff7a33">Edition</a>`
    : "";
  return `<!doctype html><html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif"><main style="max-width:640px;margin:0 auto;padding:36px 24px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#fe45e2">BoardlessAI · ${escapeHtml(meetingLabel(payload.kind))}</p><h1 style="font-size:26px;line-height:1.25;margin:22px 0;color:#f4f4f5">${escapeHtml(payload.decisionLine)}</h1><p style="line-height:1.65;color:#d4d4d8">${escapeHtml(payload.voteLine)}</p><p style="line-height:1.65;color:#d4d4d8">${escapeHtml(payload.summary)}</p>${exchange}<p><a href="${escapeHtml(payload.links.room)}" style="color:#ff7a33">Room record</a>${edition}</p><p style="font-size:12px;color:#a1a1aa">Recorded meeting cost: $${payload.meetingCostUsd.toFixed(4)}</p><div style="height:4px;background:#ff5a00;margin-top:28px"></div></main></body></html>`;
}

export interface MeetingEmailSink {
  readonly mode: "log" | "resend";
  send(payload: MeetingEmail, html: string): Promise<void>;
}

export class MeetingEmailLogSink implements MeetingEmailSink {
  readonly mode = "log" as const;

  constructor(private readonly root: string) {}

  async send(payload: MeetingEmail, html: string): Promise<void> {
    const file = payload.meetingRef.replaceAll("/", "-");
    await atomicWriteJson(this.root, `notify/email/${file}.json`, {
      schemaVersion: 1,
      mode: "log",
      consumed: false,
      payload,
      html
    });
  }
}

export class EmailTierError extends Error {}

export class ResendMeetingEmailSink implements MeetingEmailSink {
  readonly mode = "resend" as const;

  constructor(
    private readonly input: {
      apiKey: string;
      from: string;
      to: string[];
      allowHosts: readonly string[];
      freeTierMonthly: number;
      freeTierDaily: number;
      fetchImpl?: typeof fetch;
      resolveImpl?: (hostname: string) => Promise<string[]>;
    }
  ) {}

  async send(payload: MeetingEmail, html: string): Promise<void> {
    if (!this.input.apiKey || !this.input.from || this.input.to.length === 0) {
      throw new Error("Resend meeting email configuration is incomplete");
    }
    if (!/(?:^|<)meetings@[^>\s]+>?$/i.test(this.input.from)) {
      throw new Error("Meeting email sender must use meetings@<verified-domain>");
    }
    const requiredMonthly = REQUIRED_MEETING_EMAILS_PER_MONTH * this.input.to.length;
    const requiredDaily = REQUIRED_MEETING_EMAILS_PER_DAY * this.input.to.length;
    if (this.input.freeTierMonthly < requiredMonthly || this.input.freeTierDaily < requiredDaily) {
      throw new EmailTierError(
        `Verified Resend limits ${this.input.freeTierMonthly}/month and ${this.input.freeTierDaily}/day do not cover ${requiredMonthly}/month and ${requiredDaily}/day`
      );
    }
    await safeFetch("https://api.resend.com/emails", {
      allowHosts: this.input.allowHosts,
      method: "POST",
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": createHash("sha256").update(payload.meetingRef).digest("hex")
      },
      body: JSON.stringify({
        from: this.input.from,
        to: this.input.to,
        subject: payload.subject,
        html
      }),
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

export function meetingEmailSinkFromEnvironment(input: {
  stateRoot: string;
  environment?: NodeJS.ProcessEnv;
  allowHosts: readonly string[];
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}): MeetingEmailSink {
  const environment = input.environment ?? process.env;
  if (environment.MEETING_EMAIL_MODE !== "resend") {
    return new MeetingEmailLogSink(input.stateRoot);
  }
  const recipients = (environment.MEETING_EMAIL_TO ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);
  return new ResendMeetingEmailSink({
    apiKey: environment.RESEND_API_KEY ?? "",
    from: environment.MEETING_EMAIL_FROM ?? "",
    to: recipients,
    allowHosts: input.allowHosts,
    freeTierMonthly: positiveInteger(environment.RESEND_FREE_TIER_MONTHLY),
    freeTierDaily: positiveInteger(environment.RESEND_FREE_TIER_DAILY),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
}

interface EmailHealth {
  schemaVersion: 1;
  consecutiveFailures: number;
  lastStatus: "sent" | "failed";
  lastMeetingRef: string;
  updatedAt: string;
  inboxRaisedAt: string | null;
}

async function addInboxOnce(root: string, id: string, detail: string): Promise<void> {
  const current = await readText(
    root,
    "INBOX.md",
    "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n"
  );
  if (current.includes(id)) return;
  const item = `- [ ] INBOX ${id} — ${detail}`;
  const next = current.includes("## Pending\n\nNone.")
    ? current.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
    : current.replace("## Resolved", `${item}\n\n## Resolved`);
  await atomicWriteText(root, "INBOX.md", next);
}

async function raiseInboxOnce(root: string, health: EmailHealth): Promise<EmailHealth> {
  if (health.inboxRaisedAt || health.consecutiveFailures < 3) return health;
  await addInboxOnce(
    root,
    "EMAIL-DELIVERY-FAILURES",
    "Meeting email failed three consecutive times. Verify Resend credentials, domain DNS and free-tier availability before retrying."
  );
  return { ...health, inboxRaisedAt: health.updatedAt };
}

async function recordOutcome(
  root: string,
  payload: MeetingEmail,
  status: "sent" | "failed",
  now: Date
): Promise<void> {
  const previous = await readJson<EmailHealth>(root, "notify/health.json", {
    schemaVersion: 1,
    consecutiveFailures: 0,
    lastStatus: "sent",
    lastMeetingRef: payload.meetingRef,
    updatedAt: now.toISOString(),
    inboxRaisedAt: null
  });
  let next: EmailHealth = {
    schemaVersion: 1,
    consecutiveFailures: status === "sent" ? 0 : previous.consecutiveFailures + 1,
    lastStatus: status,
    lastMeetingRef: payload.meetingRef,
    updatedAt: now.toISOString(),
    inboxRaisedAt: status === "sent" ? null : previous.inboxRaisedAt
  };
  next = await raiseInboxOnce(root, next);
  await atomicWriteJson(root, "notify/health.json", next);
}

interface EmailReceipt {
  mode?: "log" | "resend";
  status?: "sent" | "failed";
}

export async function sendMeetingEmail(input: {
  payload: MeetingEmail;
  sink: MeetingEmailSink;
  stateRoot: string;
  now?: Date;
}): Promise<"sent" | "failed"> {
  const now = input.now ?? new Date();
  const relativePath = `notify/email/${input.payload.meetingRef.replaceAll("/", "-")}.json`;
  const previous = await readJson<EmailReceipt | null>(input.stateRoot, relativePath, null);
  if (input.sink.mode === "resend" && previous?.mode === "resend" && previous.status === "sent") {
    return "sent";
  }
  try {
    await input.sink.send(input.payload, renderMeetingEmailHtml(input.payload));
    if (input.sink.mode === "resend") {
      await atomicWriteJson(input.stateRoot, relativePath, {
        schemaVersion: 1,
        mode: "resend",
        status: "sent",
        payload: input.payload,
        sentAt: now.toISOString()
      });
    }
    await recordOutcome(input.stateRoot, input.payload, "sent", now);
    return "sent";
  } catch (error) {
    console.warn(`Meeting email failed for ${input.payload.meetingRef}: ${error instanceof Error ? error.message : "unknown error"}`);
    try {
      if (error instanceof EmailTierError) {
        await addInboxOnce(
          input.stateRoot,
          "EMAIL-FREE-TIER-UNVERIFIED",
          "The configured free-tier limits do not cover the meeting-email volume. No email was sent; do not enable a paid tier without HUMAN_APPROVAL."
        );
      }
      if (input.sink.mode === "resend") {
        await atomicWriteJson(input.stateRoot, relativePath, {
          schemaVersion: 1,
          mode: "resend",
          status: "failed",
          payload: input.payload,
          failedAt: now.toISOString()
        });
      }
      await recordOutcome(input.stateRoot, input.payload, "failed", now);
    } catch {
      // Email and its health record never block the completed meeting.
    }
    return "failed";
  }
}
