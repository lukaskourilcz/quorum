#!/usr/bin/env node
// A pre-check that runs before pnpm install, so a firing with nothing to do costs one minute
// instead of five.
//
// Measured over 5-6 August: a dispatch run averages 5.8 billable minutes, and a large share of
// them are slots whose answer was already on disk before the runner started — a slot that
// already ran today, or a gated slot whose skip record was written by the first firing. Every
// one of those still paid for checkout, pnpm and a full workspace install to reach the in-process
// guard that said no.
//
// This imports nothing. Not from the workspace, not from npm — node:fs and node:path only, so it
// runs on the runner's bundled Node before any install. That constraint is the point: anything
// that needs the workspace has already cost what this exists to save.
//
// It is a pre-check, never a replacement. It answers "false" only where the in-process guards
// would certainly have written nothing; everything it is unsure about proceeds, and the real
// guards decide. The double-fire semantics are unchanged — this is the same question asked
// earlier and more cheaply, against the same committed records.

import { appendFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mirrors orchestrator/src/meetings/slot-record.ts.
 *
 * Copied rather than imported, because importing it would need the workspace this script exists
 * to run before. Exported so slot-guard.test.ts can compare the two outputs phase by phase — a
 * copy nothing checks drifts silently, and a guard looking under a path nothing writes lets
 * every firing through.
 */
export function slotRecordPath(phase, date) {
  if (phase === "morning" || phase === "afternoon" || phase === "night") {
    return `standups/${date}-${phase}.json`;
  }
  if (phase === "article-am") return `ventures/mma-files/runs/${date}-am.json`;
  if (phase === "article-pm") return `ventures/mma-files/runs/${date}-pm.json`;
  return `meetings/${date}-${phase}.json`;
}

function pragueDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Prague"
  }).format(now);
}

function pragueHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Prague"
    }).format(now)
  );
}

function isFile(absolute) {
  try {
    return statSync(absolute).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether the heavy steps should run, and why not when they should not.
 *
 * Pure, so the test can drive it without a runner or a clock.
 */
export function slotGuardVerdict(input) {
  const { eventName, trigger, phase, deliveryOnly, stateRoot, now } = input;

  // A delivery-only dispatch is the delivery path itself: it has work by definition.
  if (deliveryOnly === "true") return { proceed: true, reason: "delivery run" };

  // Only a firing that claims a calendar slot can be answered from committed records. A plain
  // manual dispatch is somebody asking on purpose and always runs.
  const scheduled = eventName === "schedule" || trigger === "vercel-cron";
  if (!scheduled) return { proceed: true, reason: "manual dispatch" };

  // The GitHub crons are backstop sweeps that name no single slot, so there is nothing to look
  // up: the sweep's own logic decides what, if anything, it rescues.
  if (eventName === "schedule") return { proceed: true, reason: "backstop sweep" };

  if (!phase || phase === "skip") return { proceed: true, reason: "no slot named" };

  const date = pragueDate(now);

  // The edition retry is the one deliberate second firing of a slot that already has a record.
  // It exists precisely to run on a morning that produced nothing, and it decides that itself.
  if (phase === "cu-edition" && pragueHour(now) === 9) {
    return { proceed: true, reason: "edition retry" };
  }

  const record = slotRecordPath(phase, date);
  if (isFile(path.join(stateRoot, record))) {
    return { proceed: false, reason: `state/${record} already exists for today` };
  }

  // A skip record means an earlier firing already asked the gate and wrote the answer. A later
  // firing would write the identical file, stage nothing, and commit nothing — after paying for
  // the install to find out. If the gate has since opened, the room still gets its chance: the
  // slot record above is what stops a meeting, and a skip is not one.
  const skip = `meetings/skips/${date}-${phase}.json`;
  if (isFile(path.join(stateRoot, skip))) {
    return { proceed: false, reason: `state/${skip} already states why this slot is closed` };
  }

  return { proceed: true, reason: "no record for this slot today" };
}

function main() {
  const verdict = slotGuardVerdict({
    eventName: process.env.EVENT_NAME ?? "",
    trigger: process.env.INPUT_TRIGGER ?? "",
    phase: process.env.INPUT_PHASE ?? "",
    deliveryOnly: process.env.INPUT_DELIVERY_ONLY ?? "",
    stateRoot: path.join(process.cwd(), "state"),
    now: new Date()
  });
  console.log(`${verdict.proceed ? "proceeding" : "stopping early"}: ${verdict.reason}`);
  const output = process.env.GITHUB_OUTPUT;
  // Appended rather than written: a step may already have written to this file.
  if (output) appendFileSync(output, `proceed=${verdict.proceed}\nreason=${verdict.reason}\n`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
