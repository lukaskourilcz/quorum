import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import meetingFixture from "../../../contracts/fixtures/meeting-record.valid.json" with { type: "json" };
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import {
  buildMeetingEmail,
  meetingEmailSinkFromEnvironment,
  renderMeetingEmailHtml,
  sendMeetingEmail
} from "./email.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function payload() {
  return buildMeetingEmail({
    record: MeetingRecordSchema.parse(meetingFixture),
    boardlessBaseUrl: "https://boardless.example",
    editionUrl: "https://caught-up.example/en/articles/a-measured-model-price-cut"
  });
}

describe("meeting email notification", () => {
  it("builds a dark-mode-safe, escaped, measured-cost template", () => {
    const email = payload();
    expect(email.subject).toContain("BoardlessAI — Edition room — Story:");
    expect(email.voteLine).toContain("✓");
    expect(email.links.room).toBe("https://boardless.example/meetings/2026-08-04-cu-edition");
    const html = renderMeetingEmailHtml({ ...email, decisionLine: "Approve <script>" });
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain("background:#09090b");
    expect(html).toContain("Approve &lt;script&gt;");
    expect(html).toContain("Recorded meeting cost: $0.0300");
  });

  it("defaults to the zero-cost log sink until Resend is explicitly enabled", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-email-"));
    roots.push(root);
    const sink = meetingEmailSinkFromEnvironment({ stateRoot: root, environment: {}, allowHosts: ["api.resend.com"] });
    expect(sink.mode).toBe("log");
    expect(await sendMeetingEmail({ payload: payload(), sink, stateRoot: root, now: new Date("2026-08-04T04:00:00Z") })).toBe("sent");
    expect(JSON.parse(await readFile(path.join(root, "notify/email/meetings-2026-08-04-cu-edition.json"), "utf8"))).toMatchObject({ mode: "log", consumed: false });
  });

  it("fails closed with an immediate INBOX item when verified limits are too small", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-email-"));
    roots.push(root);
    const fetchImpl = vi.fn<typeof fetch>();
    const sink = meetingEmailSinkFromEnvironment({
      stateRoot: root,
      environment: {
        MEETING_EMAIL_MODE: "resend",
        RESEND_API_KEY: "secret-not-written",
        MEETING_EMAIL_FROM: "meetings@example.com",
        MEETING_EMAIL_TO: "owner@example.com",
        RESEND_FREE_TIER_MONTHLY: "100",
        RESEND_FREE_TIER_DAILY: "5"
      },
      allowHosts: ["api.resend.com"],
      fetchImpl
    });
    expect(await sendMeetingEmail({ payload: payload(), sink, stateRoot: root })).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("EMAIL-FREE-TIER-UNVERIFIED");
  });

  it("raises one INBOX item after three delivery failures without blocking the meeting", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-email-"));
    roots.push(root);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"message":"unavailable"}', {
      status: 503,
      headers: { "content-type": "application/json" }
    }));
    const sink = meetingEmailSinkFromEnvironment({
      stateRoot: root,
      environment: {
        MEETING_EMAIL_MODE: "resend",
        RESEND_API_KEY: "secret-not-written",
        MEETING_EMAIL_FROM: "meetings@example.com",
        MEETING_EMAIL_TO: "owner@example.com",
        RESEND_FREE_TIER_MONTHLY: "3000",
        RESEND_FREE_TIER_DAILY: "100"
      },
      allowHosts: ["api.resend.com"],
      fetchImpl,
      resolveImpl: async () => ["93.184.216.34"]
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await sendMeetingEmail({ payload: payload(), sink, stateRoot: root })).toBe("failed");
    }
    const inbox = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(inbox.match(/EMAIL-DELIVERY-FAILURES/g)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(warning).toHaveBeenCalledTimes(4);
  });

  it("sends once with Resend and keeps a sanitized permanent receipt", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-email-"));
    roots.push(root);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"id":"email_123"}', {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const sink = meetingEmailSinkFromEnvironment({
      stateRoot: root,
      environment: {
        MEETING_EMAIL_MODE: "resend",
        RESEND_API_KEY: "secret-not-written",
        MEETING_EMAIL_FROM: "BoardlessAI <meetings@example.com>",
        MEETING_EMAIL_TO: "owner@example.com",
        RESEND_FREE_TIER_MONTHLY: "3000",
        RESEND_FREE_TIER_DAILY: "100"
      },
      allowHosts: ["api.resend.com"],
      fetchImpl,
      resolveImpl: async () => ["93.184.216.34"]
    });
    const email = payload();
    expect(await sendMeetingEmail({ payload: email, sink, stateRoot: root, now: new Date("2026-08-04T04:00:00Z") })).toBe("sent");
    expect(await sendMeetingEmail({ payload: email, sink, stateRoot: root, now: new Date("2026-08-04T05:00:00Z") })).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({ "idempotency-key": expect.stringMatching(/^[a-f0-9]{64}$/) });
    const receipt = await readFile(path.join(root, "notify/email/meetings-2026-08-04-cu-edition.json"), "utf8");
    expect(receipt).toContain('"status": "sent"');
    expect(receipt).not.toContain("secret-not-written");
  });
});
