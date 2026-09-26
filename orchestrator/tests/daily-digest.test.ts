import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingRecordSchema, type MeetingRecord } from "../src/contracts/meeting-record.js";
import { allInBudgetStatus } from "../src/finance/budget-alert.js";
import { loadMeetingRecords, mondayOfWeek } from "../src/meetings/calendar.js";
import { MEETING_CLOCK } from "../src/meetings/clock.js";
import {
  buildDailyDigest,
  dailyDigestSinkFromEnvironment,
  finalizeDigestText,
  renderDailyDigestHtml,
  renderDailyDigestText,
  sendDailyDigest,
  type DailyDigestSink
} from "../src/notify/digest.js";
import { resolveDigestDay } from "../src/notify/digest-day.js";
import { repoRoot } from "../src/paths.js";
import { ScheduledPhaseSchema } from "../src/types.js";
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
  it("groups the whole day's schedule and records missed work in one line", async () => {
    const digest = await fixtureDigest();
    // Counted off the clock rather than pinned to a number: the digest's promise is that it
    // accounts for every slot the day has, not that the day has any particular count.
    expect(digest.meetings).toHaveLength(MEETING_CLOCK.length);
    expect(digest.meetings.filter((meeting) => !meeting.held).length).toBeGreaterThan(0);
    expect(digest.meetings.every((meeting) => meeting.bullets.length === 1)).toBe(true);
    expect(digest.bodyWordCount).toBeLessThanOrEqual(400);
    expect(renderDailyDigestText(digest)).toContain("Skipped:");
    expect(renderDailyDigestHtml(digest, renderDailyDigestText(digest))).toContain("background:#09090b");
  });

  it("reads a venture day through the rooms it dispatched, since the day writes no record", async () => {
    // Every digest from the day kinds' arrival on 2026-08-29 said the DNESKAi desk was not held
    // at $0, because it looked for a `cu-day` record nothing writes. Its rooms record under
    // `cu-edition` and `cu-product`, and those are what the day's line has to read.
    const registry = await loadVentureRegistry();
    const venture = registry.ventures.find((candidate) => candidate.day?.kind === "cu-day");
    expect(venture?.day?.steps).toEqual(["cu-edition", "cu-product"]);
    const archive = (await loadMeetingRecords(path.join(repoRoot, "state")))
      .filter((record) => record.date === "2026-08-01");
    const room = (kind: "cu-edition" | "cu-product", status: string, usd: number) => {
      const source = archive.find((record) => record.kind === kind)!;
      return MeetingRecordSchema.parse({ ...source, status, ledger: { ...source.ledger, actualCycleUsd: usd } });
    };
    const schedule = [{
      phase: ScheduledPhaseSchema.parse("cu-day"),
      hour: 5,
      label: venture!.day!.label,
      ventureId: venture!.id
    }];
    const digestFor = (records: MeetingRecord[]) => buildDailyDigest({
      date: "2026-08-01",
      weekOf: mondayOfWeek("2026-08-01"),
      records,
      schedule,
      dailyBudgetUsd: 0.7
    }).meetings[0]!;

    const edition = room("cu-edition", "HELD", 0.2988915);
    const product = room("cu-product", "HELD", 0.0125);
    const both = digestFor([product, edition]);
    expect(both).toMatchObject({ kind: "cu-day", ventureId: "caught-up", held: true, costUsd: 0.3113915 });
    // The edition is the day's first room, so its decision is the line and its room the link.
    expect(both.bullets[0]?.text).toBe(digestFor([edition]).bullets[0]?.text);
    expect(both.bullets[0]?.text).not.toContain("was not held");
    expect(both.bullets[0]?.roomLink).toBe("/meetings/2026-08-01-cu-edition");

    // A paused edition does not make the day unheld when the product room met.
    const pausedEdition = digestFor([room("cu-edition", "PAUSED", 0), product]);
    expect(pausedEdition).toMatchObject({ held: true, costUsd: 0.0125 });
    expect(pausedEdition.bullets[0]?.roomLink).toBe("/meetings/2026-08-01-cu-product");

    // Only a day with no room record at all is a day that did not happen.
    const none = digestFor([]);
    expect(none).toMatchObject({ held: false, costUsd: 0 });
    expect(none.bullets[0]?.text).toContain("DNESKAi daily desk was not held");
  });

  it("files every slot under the venture config/ventures.json names for it", async () => {
    // A prefix list used to decide this and sent ms-daily, gv-brief and pg-desk to "global". The
    // expectation is derived from the registry here, independently of the clock, so a new room
    // or day cannot fall through to the board again without this failing.
    const registry = await loadVentureRegistry();
    const owner = (phase: string): string => registry.ventures.find((venture) =>
      venture.day?.kind === phase
      || venture.meetings.some((meeting) => meeting.kind === phase)
      || (phase.startsWith("article-") && venture.productionJobs?.some((job) => job.kind === "article-production"))
    )?.id ?? "global";
    const filed = (schedule: ReturnType<typeof resolveScheduledClock>) => new Map(buildDailyDigest({
      date: "2026-09-25",
      weekOf: mondayOfWeek("2026-09-25"),
      records: [],
      schedule,
      dailyBudgetUsd: 1
    }).meetings.map((meeting) => [meeting.kind, meeting.ventureId]));

    const today = resolveScheduledClock(registry);
    const todayFiled = filed(today);
    for (const slot of today) expect(todayFiled.get(slot.phase), slot.phase).toBe(owner(slot.phase));
    for (const [phase, venture] of [["ms-daily", "marketingshark"], ["gv-brief", "goviral"], ["cu-day", "caught-up"]] as const) {
      if (todayFiled.has(phase)) expect(todayFiled.get(phase), phase).toBe(venture);
    }
    expect(todayFiled.get("morning")).toBe("global");

    // With every paused venture resumed, the owner-only Personal Growth desk is filed under its own
    // id, which is what lets /results keep it off the public page.
    const resumed = {
      ...registry,
      ventures: registry.ventures.map((venture) => ({
        ...venture,
        status: venture.status === "paused" ? "operating" as const : venture.status
      }))
    };
    const everySlot = resolveScheduledClock(resumed);
    const everyFiled = filed(everySlot);
    for (const slot of everySlot) expect(everyFiled.get(slot.phase), slot.phase).toBe(owner(slot.phase));
    expect(everyFiled.get("pg-desk")).toBe("personal-growth");
    expect(everyFiled.get("mma-day")).toBe("mma-files");
    expect(everyFiled.get("dm-day")).toBe("door-money");
    expect(everyFiled.get("tt-marketing")).toBe("titty-tuesdays");
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
        operation("delivery", "Caught Up delivery recorded."),
        operation("release-proof", "Caught Up release proof passed."),
        operation("failure", "No delivery failure was recorded."),
        operation("social-gate", "Caught Up health counter 4/7.")
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

describe("the day a digest run is about", () => {
  it("digests the finished Prague day and reads the caps against the run's own month", () => {
    // The 06:00 morning on the first of a month digests the last day of the closed one, while the
    // caps and the office mode it writes belong to the month the run is in (90f175c0).
    expect(resolveDigestDay(["--previous-day"], new Date("2026-10-01T04:05:00.000Z")))
      .toEqual({ date: "2026-09-30", month: "2026-10" });
    // 00:30 Prague is still the previous UTC date; the day boundary is Prague's.
    expect(resolveDigestDay(["--", "--previous-day", "--dry"], new Date("2026-09-24T22:30:00.000Z")))
      .toEqual({ date: "2026-09-24", month: "2026-09" });
    // The morning after daylight saving ends is 25 hours from the one before it.
    expect(resolveDigestDay(["--previous-day"], new Date("2026-10-26T05:00:00.000Z")))
      .toEqual({ date: "2026-10-25", month: "2026-10" });
    // A hand-run replay names its day; without a flag the run digests its own date.
    expect(resolveDigestDay(["--date", "2026-08-15"], new Date("2026-09-25T04:00:00.000Z")))
      .toEqual({ date: "2026-08-15", month: "2026-09" });
    expect(resolveDigestDay([], new Date("2026-09-25T04:00:00.000Z")))
      .toEqual({ date: "2026-09-25", month: "2026-09" });
  });
});
