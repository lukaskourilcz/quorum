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

/** The all-in monthly operating limit from `budget-2026-08e`. */
const ALL_IN_CAP_USD = 30;

export async function readFooterFacts(): Promise<FooterFacts> {
  const [money, standups] = await Promise.all([
    getPublicMoneySnapshot().catch(() => null),
    getPublicStandups().catch(() => [])
  ]);
  const updates = standups
    .filter((standup) => !standup.fixture)
    .map((standup) => ({
      at: standup.generatedAt ?? standup.roomTranscript.closedAt,
      title: `${standup.phase} meeting`,
      detail: standup.decision.summary
    }))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 5);
  return {
    capUsd: ALL_IN_CAP_USD,
    month: money?.costs.api.month ?? new Date().toISOString().slice(0, 7),
    monthlyUsd: money?.costs.api.monthlyUsd ?? 0,
    updates
  };
}
