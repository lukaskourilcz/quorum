import { MarketingPlanSchema, type MarketingPlan } from "../contracts/marketing-plan.js";
import type { GoViralTrends } from "../sources/goviral-trends.js";

/**
 * The owner's weekly content brief, written as a marketing-plan/1.
 *
 * It reuses the plan contract rather than inventing a ninth artifact shape: the admin already
 * renders plans with rating widgets, `renderMarketingPlanMarkdown` already turns one into
 * readable markdown, and the KPI collector already counts them. A new contract would have needed
 * all three built again to say the same thing.
 *
 * Everything in it comes from a seat or from the snapshot. There is no fallback that invents a
 * trend call: a room whose seats said nothing usable produces a brief that says so, because a
 * brief nobody can act on is better than a brief nobody can check.
 */
export interface BriefContribution {
  agent: string;
  summary: string;
  evidenceRefs: readonly string[];
  idea: { title: string; summary: string } | null;
}

export function goViralBriefId(date: string): string {
  return `plan-${date}-weekly-brief`;
}

/** The trends worth naming, in the order the scout ranked them. */
function trendCalls(trends: GoViralTrends | null): string[] {
  if (!trends) return [];
  const paid = trends.signals.topHashtags.slice(0, 5).map((signal) => {
    const delta = signal.weekOverWeekDelta === null
      ? "no prior week to compare against"
      : `${signal.weekOverWeekDelta >= 0 ? "up" : "down"} ${Math.abs(signal.weekOverWeekDelta).toFixed(1)} on last week`;
    return `${signal.hashtag} (${signal.topicSet}): ${signal.engagementPerHour.toFixed(1)} engagements/hour across ${signal.posts} post${signal.posts === 1 ? "" : "s"}, ${delta}.`;
  });
  const free = trends.freeSignals
    .flatMap((result) => result.status === "success" ? result.signals : [])
    .filter((signal) => signal.scope?.startsWith("topic-set:"))
    .sort((left, right) => right.value - left.value || left.topic.localeCompare(right.topic, "en"))
    .slice(0, 6)
    .map((signal) => {
      const [, topicSet = "unknown", locale = "unknown"] = signal.scope!.split(":");
      return `${signal.topic} (${topicSet}, free ${signal.kind}, ${locale}): ${signal.value}.`;
    });
  return [...paid, ...free];
}

export function buildGoViralWeeklyBrief(input: {
  date: string;
  trends: GoViralTrends | null;
  contributions: readonly BriefContribution[];
  vetoed: boolean;
}): MarketingPlan {
  const chair = input.contributions.find((contribution) => contribution.agent === "PULSE");
  const calls = trendCalls(input.trends);
  const ideas = input.contributions.filter((contribution) => contribution.idea);
  const evidenceRefs = [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))];
  const snapshotNote = input.trends
    ? input.trends.date === input.date
      ? `Scout data from ${input.trends.date}.`
      : `No fresh scout this week — working from the ${input.trends.date} snapshot.`
    : "No scout data was available this week.";

  return MarketingPlanSchema.parse({
    schemaVersion: "marketing-plan/1",
    id: goViralBriefId(input.date),
    ventureId: "goviral",
    title: `Weekly content brief — ${input.date}`,
    summary: (chair?.summary ?? "The room recorded no chair contribution this week.").slice(0, 280),
    objective: "Give the owner a week of things to write, and the magazine desks the trends worth acting on. Drafts and plans only: nothing here publishes, schedules, buys or opens an account.",
    // One tactic per seat contribution plus one per trend call, which is what the room actually
    // produced. `type: "content"` throughout — "paid" would misdescribe a room that cannot spend.
    tactics: [
      ...calls.map((call) => ({
        type: "content" as const,
        description: `Trend call: ${call}`,
        assetsNeeded: [],
        platformPolicyNote: "A trend call, not a publishing instruction. Nothing is posted or scheduled from this line."
      })),
      ...ideas.map((contribution) => ({
        type: "content" as const,
        description: `${contribution.idea!.title} — ${contribution.idea!.summary}`,
        assetsNeeded: ["owner review"],
        platformPolicyNote: "Draft only. No posting, scheduling, advertising or outreach is authorized."
      })),
      ...(calls.length === 0 && ideas.length === 0
        ? [{
            type: "content" as const,
            description: `${snapshotNote} The room produced no trend call it could support with a number, which is a correct answer to a quiet week.`,
            assetsNeeded: [],
            platformPolicyNote: "Nothing to publish, and nothing invented to fill the gap."
          }]
        : [])
    ],
    // A seven-day skeleton, not a schedule: the owner decides what lands where, and nothing in
    // this system can post to a day even if it wanted to.
    calendar: [
      { week: 1, focus: `Mon–Tue: the strongest trend call from this week's data. ${snapshotNote}` },
      { week: 2, focus: "Wed–Thu: the searchable piece — something that answers a question people type, and earns for months rather than days." },
      { week: 3, focus: "Fri: the shareable piece — rides the moment, dies in days, and that is fine as long as it is not the whole week." },
      { week: 4, focus: "Sat–Sun: nothing scheduled. A quiet weekend is a real editorial choice." }
    ],
    audienceRefs: [],
    // Readings that exist on disk. Nothing here is a target the room can talk itself into
    // having met.
    kpis: [
      "Trend snapshots stored in state/goviral/trends/ this week.",
      "Ideas recorded on state/ideas/goviral/ledger.jsonl this week.",
      "Agendas in the queue whose sourcePhase is gv-brief."
    ],
    // The schema requires at least one asset and CarouselEngine needs a live template id. This
    // is the same stub the TT fallback uses: a real deck is composed elsewhere, gated, when a
    // channel exists to receive it.
    postable_assets: [{
      id: `asset-${input.date.replaceAll("-", "")}-weekly-brief`,
      captions: {
        instagram: {
          A: "This week's read on what is actually rising, and what is worth writing about it.",
          B: "Velocity beats volume: a small trend still climbing beats a big one that already peaked."
        },
        threads: {
          A: "What is rising this week, with the numbers behind it.",
          B: "Most weeks some trends are worth skipping. This is one of the ones that isn't."
        }
      },
      visual: {
        template_id: "cover-cta",
        version: "1.0.0",
        content: {
          locale: "en",
          strings: {
            "cover-title": "WHAT IS RISING",
            "cover-dek": "This week's trend calls, with the numbers behind them.",
            cta: "Read the weekly brief",
            destination: "boardless-ai.vercel.app"
          }
        }
      }
    }],
    // A vetoed room's brief is a draft. AUDIT's veto is about the content of the calls, and a
    // draft is what the owner should see rather than a plan stamped ready.
    status: input.vetoed ? "draft" : "approved",
    originMeetingRef: `${input.date}-gv-brief`,
    ...(evidenceRefs.length > 0 ? { evidenceRefs } : {})
  });
}
