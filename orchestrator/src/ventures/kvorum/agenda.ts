import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../../budget.js";
import type { KvorumFollowUpRequest } from "../../contracts/kvorum-desk.js";
import type { KvorumMonitorReceipt } from "../../contracts/kvorum-monitor.js";
import type { MeetingAgenda } from "../../contracts/meeting-agenda.js";
import { pragueClockParts } from "../../meetings/clock.js";
import {
  MEETING_AGENDA_PATH,
  consumeMeetingAgenda,
  dueMeetingAgenda,
  loadMeetingPolicy,
  nextAgendaDate,
  readMeetingAgendaQueue,
  requestMeetingAgenda
} from "../../meetings/agenda.js";
import { loadEffectivePortfolioSchedule } from "../../portfolio/limits.js";
import { phaseEnabled } from "../../portfolio/schedule.js";
import { readJson } from "../../state.js";
import {
  getVentureMeetingDefinition,
  loadVentureRegistry,
  parseCadenceHour
} from "../registry.js";

export async function loadDueKvorumAgenda(input: {
  root: string;
  date: string;
  now: Date;
}): Promise<MeetingAgenda | null> {
  return dueMeetingAgenda(await readMeetingAgendaQueue(input.root, input.now), "kv-desk", input.date);
}

/** Consume one incoming agenda and, when every guard passes, queue one cited GoVIRAL follow-up. */
export async function applyKvorumAgendaEffects(input: {
  root: string;
  cycleId: string;
  date: string;
  now: Date;
  result: {
    status: "packages" | "quiet" | "paused" | "model-failed" | "failed";
    droppedPackages: number;
    receipt: KvorumMonitorReceipt | null;
    agenda: MeetingAgenda | null;
    followUpRequest: KvorumFollowUpRequest | null;
  };
}): Promise<string[]> {
  let changed = false;
  if (input.result.agenda) {
    await consumeMeetingAgenda({
      root: input.root,
      agendaId: input.result.agenda.id,
      cycleId: input.cycleId,
      now: input.now
    });
    changed = true;
  }
  const followUp = input.result.followUpRequest;
  if (
    !followUp
    || input.result.status === "failed"
    || input.result.status === "model-failed"
    || input.result.droppedPackages > 0
    || !input.result.receipt
  ) {
    return changed ? [MEETING_AGENDA_PATH] : [];
  }
  const allowedRefs = new Set(input.result.receipt.clusters.flatMap((cluster) => cluster.itemRefs));
  if (followUp.evidenceRefs.some((ref) => !allowedRefs.has(ref))) {
    console.warn("Kvórum follow-up was not queued: at least one evidence ref is outside the retained digest");
    return changed ? [MEETING_AGENDA_PATH] : [];
  }
  const ledger = (await readJson<{ entries: BudgetLedgerEntry[] }>(input.root, "budget/ledger.json", { entries: [] }))
    .entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const monthSpend = ledger
    .filter((entry) => entry.ts.slice(0, 7) === input.date.slice(0, 7))
    .reduce((sum, entry) => sum + entry.usd, 0);
  if (!phaseEnabled(await loadEffectivePortfolioSchedule(monthSpend), "gv-brief")) {
    console.warn("Kvórum follow-up was not queued: gv-brief is outside the effective budget shape");
    return changed ? [MEETING_AGENDA_PATH] : [];
  }
  const [policy, registry] = await Promise.all([loadMeetingPolicy(), loadVentureRegistry()]);
  const target = getVentureMeetingDefinition(registry, "gv-brief");
  try {
    await requestMeetingAgenda({
      root: input.root,
      policy,
      ventureId: target.ventureId,
      phase: "gv-brief",
      requestedBy: "TRIBUN",
      sourcePhase: "kv-desk",
      sourceMeetingRef: `meetings/${input.date}-kv-desk`,
      summary: followUp.summary,
      evidenceRefs: followUp.evidenceRefs,
      notBefore: nextAgendaDate({
        currentDate: input.date,
        currentHour: pragueClockParts(input.now).hour,
        targetHour: parseCadenceHour(target.meeting.cadence)
      }),
      now: input.now
    });
    changed = true;
  } catch (error) {
    console.warn(`Kvórum follow-up was not queued: ${error instanceof Error ? error.message : "unknown scheduler error"}`);
  }
  return changed ? [MEETING_AGENDA_PATH] : [];
}
