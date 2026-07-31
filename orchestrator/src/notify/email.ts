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

export function buildMeetingEmail(input: {
  record: MeetingRecord;
  boardlessBaseUrl: string;
  editionUrl?: string;
}): MeetingEmail {
  const cost = input.record.ledger.actualCycleUsd;
  if (cost === null) throw new Error("Meeting email requires a measured meeting cost");
  const kind = input.record.kind;
  const reference = input.record.kind === "venture"
    ? `meetings/${input.record.cycleId}`
    : meetingRef(input.record.date, input.record.kind);
  const votes = input.record.voteMatrix.map(
    (vote) => `${vote.voter} ${vote.veto ? "veto" : vote.firstChoice}`
  );
  const bestTurn = input.record.roomTranscript.turns.find((turn) => turn.agent === "STET")
    ?? input.record.roomTranscript.turns.find((turn) => turn.mode === "response");
  return MeetingEmailSchema.parse({
    schemaVersion: "meeting-email/1",
    meetingRef: reference,
    kind,
    subject: `BoardlessAI — ${meetingLabel(kind)} — ${input.record.decision.outcome}`,
    decisionLine: input.record.decision.summary,
    voteLine: `${votes.join(" · ")} · ${input.record.voteMatrix.some((vote) => vote.veto) ? "veto recorded" : "no veto"}`,
    summary: input.record.operatingBrief,
    ...(bestTurn ? { bestExchange: { agent: bestTurn.agent, text: bestTurn.text } } : {}),
    links: {
      room: `${input.boardlessBaseUrl.replace(/\/$/, "")}/${reference}`,
      ...(input.editionUrl ? { edition: input.editionUrl } : {})
    },
    meetingCostUsd: cost
  });
}

export function renderMeetingEmailHtml(payload: MeetingEmail): string {
  const exchange = payload.bestExchange
    ? `<blockquote style="margin:20px 0;padding:12px 16px;border-left:3px solid #d34b4b;background:#f5f1e8;color:#241f1a"><strong>${escapeHtml(payload.bestExchange.agent)}</strong><br>${escapeHtml(payload.bestExchange.text)}</blockquote>`
    : "";
  const edition = payload.links.edition
    ? ` · <a href="${escapeHtml(payload.links.edition)}" style="color:#8f2f2f">Edition</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f1e8;color:#241f1a;font-family:Arial,sans-serif"><main style="max-width:640px;margin:0 auto;padding:32px 24px"><p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase">BoardlessAI · ${escapeHtml(meetingLabel(payload.kind))}</p><h1 style="font-size:24px;line-height:1.25">${escapeHtml(payload.decisionLine)}</h1><p>${escapeHtml(payload.voteLine)}</p><p>${escapeHtml(payload.summary)}</p>${exchange}<p><a href="${escapeHtml(payload.links.room)}" style="color:#8f2f2f">Room record</a>${edition}</p><p style="font-size:12px;color:#61584f">Recorded meeting cost: $${payload.meetingCostUsd.toFixed(4)}</p></main></body></html>`;
}

export interface MeetingEmailSink {
  send(payload: MeetingEmail, html: string): Promise<void>;
}

export class MeetingEmailLogSink implements MeetingEmailSink {
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

export class ResendMeetingEmailSink implements MeetingEmailSink {
  constructor(
    private readonly input: {
      apiKey: string;
      from: string;
      to: string[];
      allowHosts: readonly string[];
    }
  ) {}

  async send(payload: MeetingEmail, html: string): Promise<void> {
    if (!this.input.apiKey || !this.input.from || this.input.to.length === 0) {
      throw new Error("Resend meeting email configuration is incomplete");
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
      maxBytes: 100_000
    });
  }
}

interface EmailHealth {
  schemaVersion: 1;
  consecutiveFailures: number;
  lastStatus: "sent" | "failed";
  lastMeetingRef: string;
  updatedAt: string;
  inboxRaisedAt: string | null;
}

async function raiseInboxOnce(root: string, health: EmailHealth): Promise<EmailHealth> {
  if (health.inboxRaisedAt || health.consecutiveFailures < 3) return health;
  const id = "EMAIL-DELIVERY-FAILURES";
  const current = await readText(
    root,
    "INBOX.md",
    "# Human approval queue\n\n## Pending\n\nNone.\n\n## Resolved\n"
  );
  if (!current.includes(id)) {
    const item = `- [ ] INBOX ${id} — Meeting email failed three consecutive times. Verify Resend credentials, domain DNS and free-tier availability before retrying.`;
    const next = current.includes("## Pending\n\nNone.")
      ? current.replace("## Pending\n\nNone.", `## Pending\n\n${item}`)
      : current.replace("## Resolved", `${item}\n\n## Resolved`);
    await atomicWriteText(root, "INBOX.md", next);
  }
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
    inboxRaisedAt: previous.inboxRaisedAt
  };
  next = await raiseInboxOnce(root, next);
  await atomicWriteJson(root, "notify/health.json", next);
}

export async function sendMeetingEmail(input: {
  payload: MeetingEmail;
  sink: MeetingEmailSink;
  stateRoot: string;
  now?: Date;
}): Promise<"sent" | "failed"> {
  const now = input.now ?? new Date();
  try {
    await input.sink.send(input.payload, renderMeetingEmailHtml(input.payload));
    await recordOutcome(input.stateRoot, input.payload, "sent", now);
    return "sent";
  } catch {
    try {
      await recordOutcome(input.stateRoot, input.payload, "failed", now);
    } catch {
      // Email and its health record never block the completed meeting.
    }
    return "failed";
  }
}
