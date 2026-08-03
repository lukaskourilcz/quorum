import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { allInBudgetStatus } from "../src/finance/budget-alert.js";
import { loadMeetingRecords, mondayOfWeek } from "../src/meetings/calendar.js";
import {
  buildDailyDigest,
  dailyDigestSinkFromEnvironment,
  finalizeDigestText,
  renderDailyDigestHtml,
  renderDailyDigestText,
  sendDailyDigest,
  type DailyDigestSink
} from "../src/notify/digest.js";
import { repoRoot } from "../src/paths.js";
import { loadVentureRegistry, resolveScheduledClock } from "../src/ventures/registry.js";
import { DigestOperationSchema } from "../src/contracts/daily-digest.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureDigest(finalMeetingFailed = false) {
  const registry = await loadVentureRegistry();
  const records = (await loadMeetingRecords(path.join(repoRoot, "state")))
    .filter((record) => record.date === "2026-08-01")
    .map((record) => MeetingRecordSchema.parse(record));
  return buildDailyDigest({
    date: "2026-08-01",
    weekOf: mondayOfWeek("2026-08-01"),
    records,
    schedule: resolveScheduledClock(registry),
    dailyBudgetUsd: 0.7,
    finalMeetingFailed
  });
}

describe("one daily portfolio digest", () => {
  it("groups the full fifteen-slot schedule and records missed work in one line", async () => {
    const digest = await fixtureDigest();
    expect(digest.meetings).toHaveLength(15);
    expect(digest.meetings.filter((meeting) => !meeting.held).length).toBeGreaterThan(0);
    expect(digest.meetings.every((meeting) => meeting.bullets.length === 1)).toBe(true);
    expect(digest.bodyWordCount).toBeLessThanOrEqual(400);
    expect(renderDailyDigestText(digest)).toContain("Skipped:");
    expect(digest.meetings.filter((meeting) => meeting.kind.startsWith("mma-")).every((meeting) => meeting.ventureId === "fightaiq")).toBe(true);
    expect(digest.meetings.filter((meeting) => meeting.kind.startsWith("article-")).every((meeting) => meeting.ventureId === "mma-files")).toBe(true);
    expect(renderDailyDigestHtml(digest, renderDailyDigestText(digest))).toContain("background:#09090b");
  });

  it("reports a final-cycle failure in the digest instead of suppressing delivery", async () => {
    const digest = await fixtureDigest(true);
    const final = digest.meetings.at(-1)!;
    expect(final.held).toBe(false);
    expect(final.bullets[0]?.text).toContain("Final scheduled cycle failed");
  });

  it("includes deliveries, release proofs, failures and social unlock counters", async () => {
    const base = await fixtureDigest();
    const operation = (type: "delivery" | "release-proof" | "failure" | "social-gate", text: string) => DigestOperationSchema.parse({
      ventureId: "caught-up",
      type,
      status: "recorded",
      text,
      ref: null
    });
    const digest = buildDailyDigest({
      date: base.date,
      weekOf: mondayOfWeek(base.date),
      records: [],
      schedule: [],
      dailyBudgetUsd: 0.7,
      operations: [
        operation("delivery", "DNESKAi delivery recorded."),
        operation("release-proof", "DNESKAi release proof passed."),
        operation("failure", "No delivery failure was recorded."),
        operation("social-gate", "DNESKAi health counter 4/7.")
      ]
    });
    const text = renderDailyDigestText(digest);
    expect(text).toContain("release-proof");
    expect(text).toContain("health counter 4/7");
    expect(digest.bodyWordCount).toBeLessThanOrEqual(400);
  });

  it("replaces the narrow API line with an all-in warning and project breakdown at 80 percent", async () => {
    const base = await fixtureDigest();
    const registry = await loadVentureRegistry();
    const digest = buildDailyDigest({
      date: base.date,
      weekOf: mondayOfWeek(base.date),
      records: [],
      schedule: resolveScheduledClock(registry),
      dailyBudgetUsd: 2.2,
      allInBudget: allInBudgetStatus([
        { at: "2026-08-01T08:00:00.000Z", ventureId: "caught-up", category: "model", usd: 20, ref: "a" },
        { at: "2026-08-01T09:00:00.000Z", ventureId: "mma-files", category: "service", usd: 20, ref: "b" }
      ], "2026-08", 50)
    });
    expect(digest.portfolioLine).toContain("All-in warning: $40.00 of $50.00 used");
    expect(digest.portfolioLine).toContain("mma-files: $20.00");
  });

  it("compresses once and then truncates a still-oversized 401-word draft with the rooms link", async () => {
    const draft = Array.from({ length: 401 }, (_, index) => `word${index}`).join(" ");
    const compress = vi.fn(async () => Array.from({ length: 401 }, (_, index) => `short${index}`).join(" "));
    const finalized = await finalizeDigestText(draft, "https://boardless.example/calendar/2026-07-27", compress);
    expect(compress).toHaveBeenCalledTimes(1);
    expect(finalized.truncated).toBe(true);
    expect(finalized.text.split(/\s+/)).toHaveLength(400);
    expect(finalized.text).toContain("https://boardless.example/calendar/2026-07-27");
  });

  it("sends exactly once per Prague date, including across a replay", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-digest-"));
    roots.push(root);
    const send = vi.fn(async () => undefined);
    const sink: DailyDigestSink = { mode: "log", send };
    const digest = await fixtureDigest();
    expect(await sendDailyDigest({ digest, sink, stateRoot: root, roomsLink: "https://boardless.example/calendar/2026-07-27" })).toBe("sent");
    expect(await sendDailyDigest({ digest, sink, stateRoot: root, roomsLink: "https://boardless.example/calendar/2026-07-27" })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    const receipt = JSON.parse(await readFile(path.join(root, "notify", "digest", "2026-08-01.json"), "utf8"));
    expect(receipt).toMatchObject({ mode: "log", status: "sent", subject: "[BoardlessAI] Digest — 2026-08-01" });
  });

  it("uses the verified 3000/month and 100/day free allowance without authorizing a paid tier", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-digest-tier-"));
    roots.push(root);
    const fetchImpl = vi.fn<typeof fetch>();
    const sink = dailyDigestSinkFromEnvironment({
      environment: {
        DAILY_DIGEST_EMAIL_MODE: "resend",
        RESEND_API_KEY: "not-written",
        DAILY_DIGEST_EMAIL_FROM: "digest@example.com",
        DAILY_DIGEST_EMAIL_TO: "owner@example.com",
        RESEND_FREE_TIER_MONTHLY: "30",
        RESEND_FREE_TIER_DAILY: "1"
      },
      allowHosts: ["api.resend.com"],
      fetchImpl
    });
    expect(await sendDailyDigest({ digest: await fixtureDigest(), sink, stateRoot: root, roomsLink: "https://boardless.example/calendar/2026-07-27" })).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("DAILY-DIGEST-TIER-UNVERIFIED");
  });
});
