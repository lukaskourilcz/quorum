import "server-only";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicMoneySnapshot } from "@/lib/money-records";
import type { FooterFacts } from "@/components/footer-dialogs";

/**
 * The handful of numbers the footer's dialogs state.
 *
 * Resolved on the server and handed across as plain JSON, the same sanitising boundary the office
 * walkthrough uses. Nothing here is a constant typed into a component: the cap comes from the
 * countersigned budget decision the money snapshot carries, the month's spend is what the ledger
 * actually recorded, and the updates are the newest recorded meetings.
 */

/** The all-in monthly operating limit from `budget-2026-08f`. */
const ALL_IN_CAP_USD = 50;

export async function readFooterFacts(): Promise<FooterFacts> {
  const [money, standups] = await Promise.all([
    getPublicMoneySnapshot().catch(() => null),
    getPublicStandups().catch(() => [])
  ]);
  // Fixtures are excluded: they exist to exercise the software without paid calls, and a list of
  // "recent events" that included them would be reporting tests as company activity.
  const real = standups.filter((standup) => !standup.fixture);
  const updates = real
    .map((standup) => ({
      at: standup.generatedAt ?? standup.roomTranscript.closedAt,
      title: `${standup.phase} meeting`,
      detail: standup.decision.summary,
      costUsd: standup.ledger.actual
    }))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 6);
  return {
    capUsd: ALL_IN_CAP_USD,
    month: money?.costs.api.month ?? new Date().toISOString().slice(0, 7),
    monthlyUsd: money?.costs.api.monthlyUsd ?? 0,
    cumulativeUsd: money?.costs.api.cumulativeUsd ?? 0,
    fixedMonthlyUsd: money?.costs.fixed.monthlyUsd ?? 0,
    meetingCount: real.length,
    updates
  };
}
