import { MarketingPlanSchema, type MarketingPlan } from "../contracts/marketing-plan.js";
import type { GoViralTrends } from "../sources/goviral-trends.js";
import { normalizeTopic, type ScoredSignal } from "../sources/goviral-signal-score.js";
import type { RetiredSignal } from "../sources/goviral-signal-register.js";

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

/** How fresh the week's data is, said the same way wherever it is said. */
export function snapshotNoteFor(date: string, trends: GoViralTrends | null): string {
  if (!trends) return "No scout data was available this week.";
  return trends.date === date
    ? `Scout data from ${trends.date}.`
    : `No fresh scout this week — working from the ${trends.date} snapshot.`;
}

/**
 * The seven-day skeleton, not a schedule: the owner decides what lands where, and nothing in this
 * system can post to a day even if it wanted to. Shared with the brief document so the plan and
 * the brief cannot describe two different weeks.
 */
export function weeklyRhythm(snapshotNote: string): string[] {
  return [
    `Mon–Tue: the strongest trend call from this week's data. ${snapshotNote}`,
    "Wed–Thu: the searchable piece — something that answers a question people type, and earns for months rather than days.",
    "Fri: the shareable piece — rides the moment, dies in days, and that is fine as long as it is not the whole week.",
    "Sat–Sun: nothing scheduled. A quiet weekend is a real editorial choice."
  ];
}

/** The trends worth naming, in the order the scout ranked them. */
export function trendCalls(trends: GoViralTrends | null): string[] {
  if (!trends) return [];
  const paid = trends.signals.topHashtags.slice(0, 5).map((signal) => {
    const delta = signal.weekOverWeekDelta === null
      ? "no prior week to compare against"
      : `${signal.weekOverWeekDelta >= 0 ? "up" : "down"} ${Math.abs(signal.weekOverWeekDelta).toFixed(1)} on last week`;
    return `${signal.hashtag} (${signal.topicSet}): ${signal.engagementPerHour.toFixed(1)} engagements/hour across ${signal.posts} post${signal.posts === 1 ? "" : "s"}, ${delta}.`;
  });
  const scopedFree = trends.freeSignals
    .flatMap((result) => result.status === "success" ? result.signals : [])
    .filter((signal) => signal.scope?.startsWith("topic-set:"))
    .sort((left, right) => right.value - left.value || left.topic.localeCompare(right.topic, "en"))
    .slice(0, 12)
    .map((signal) => {
      const [, topicSet = "unknown", locale = "unknown"] = signal.scope!.split(":");
      return `${signal.topic} (${topicSet}, free ${signal.kind}, ${locale}): ${signal.value}.`;
    });
  const doorMoneyFree = trends.freeSignals.flatMap((result) => result.status === "success"
    ? result.signals
      .filter((signal) => signal.topicSets.includes("door-money"))
      .map((signal) => {
        const measurement = signal.kind === "rank"
          ? `rank ${signal.value}${signal.scope ? ` in ${signal.scope}` : ""}`
          : signal.kind === "velocity"
            ? `${signal.value.toFixed(1)} measured events/hour`
            : result.provider === "google-news"
              ? `${signal.value} article${signal.value === 1 ? "" : "s"} in the keyless news reading`
              : `${signal.value} in the keyless search-volume reading`;
        return `${signal.topic} (door-money, free ${result.provider} signal): ${measurement}.`;
      })
    : []);
  return [...paid, ...scopedFree, ...doorMoneyFree.slice(0, 5)];
}

/**
 * Whether AUDIT's veto named this signal.
 *
 * The fad veto has always existed as a whole-room verdict: an AUDIT veto drops the plan to draft.
 * What it could not do was name one call, so the room either kept everything or downgraded
 * everything. This reads AUDIT's own words for the signals it mentioned, and it fires only when
 * AUDIT actually voted veto — the room's verdict stays the gate, and this only says which calls it
 * was about. A vetoed signal is printed with its reason rather than quietly dropped.
 */
function vetoedByAudit(topic: string, auditSummary: string): boolean {
  const named = normalizeTopic(topic);
  return named.length >= 4 && normalizeTopic(auditSummary).includes(named);
}

/** The status word, the window and the first-flagged date, on lines of their own. */
function signalStatusLines(signals: readonly ScoredSignal[]): string[] {
  return signals.slice(0, 8).map((signal) => {
    const breadth = signal.breadthProviders.length;
    const lasted = signal.lastedHours > 0 ? `, lasted over ${signal.lastedHours}h` : "";
    const breakout = signal.breakout ? ", breakout growth" : "";
    // The source kind is part of the name, not decoration: one subject can be measured as a search
    // spike and as a viral post at once, and those are two readings with two different windows.
    return `Signal status: ${signal.topic} (${signal.sourceKind}) — ${signal.status}, ${signal.window}${lasted}${breakout}, first flagged ${signal.firstFlaggedOn}, breadth ${breadth} independent ${breadth === 1 ? "source" : "sources"}, score ${signal.score}, expires ${signal.expiresAt.slice(0, 10)}.`;
  });
}

export function buildGoViralWeeklyBrief(input: {
  date: string;
  trends: GoViralTrends | null;
  contributions: readonly BriefContribution[];
  vetoed: boolean;
  /** What PULSE let go this week, each with the reason it went. */
  retired?: readonly RetiredSignal[];
}): MarketingPlan {
  const chair = input.contributions.find((contribution) => contribution.agent === "PULSE");
  const calls = trendCalls(input.trends);
  const auditSummary = input.vetoed
    ? input.contributions.find((contribution) => contribution.agent === "AUDIT")?.summary ?? ""
    : "";
  const scored = input.trends?.scoredSignals ?? [];
  const vetoedSignals = scored.filter((signal) => vetoedByAudit(signal.topic, auditSummary));
  const survivingSignals = scored.filter((signal) => !vetoedSignals.includes(signal));
  const statusLines = signalStatusLines(survivingSignals);
  const vetoLines = vetoedSignals.slice(0, 5).map((signal) =>
    `Signal vetoed: ${signal.topic} — named in AUDIT's fad veto and dropped from this week's calls. It scored ${signal.score} as ${signal.status} before the veto; the number is recorded, the call is not made.`);
  const retiredLines = (input.retired ?? []).slice(0, 5).map((signal) =>
    `Signal retired: ${signal.topic} — ${signal.reason} First flagged ${signal.firstFlaggedOn}, last scored ${signal.lastScore} as ${signal.lastStatus}.`);
  const ideas = input.contributions.filter((contribution) => contribution.idea);
  const evidenceRefs = [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))];
  const snapshotNote = snapshotNoteFor(input.date, input.trends);

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
      // Ratings live on their own lines rather than inside the `Trend call:` text. Three ventures
      // parse those calls with anchored regexes — BOOKSOFHISTORY, Tehdejší svět and Kvórum — and
      // two of them end at `$`, so appending a status word would not throw, it would silently
      // return zero trend signals and cost those desks their GoVIRAL crossover.
      ...[...statusLines, ...vetoLines, ...retiredLines].map((line) => ({
        type: "content" as const,
        description: line,
        assetsNeeded: [],
        platformPolicyNote: "A rating, a veto or a retirement. It ranks and expires inventory; it publishes nothing."
      })),
      ...ideas.map((contribution) => ({
        type: "content" as const,
        description: `${contribution.idea!.title} — ${contribution.idea!.summary}`,
        assetsNeeded: ["owner review"],
        platformPolicyNote: "Draft only. No posting, scheduling, advertising or outreach is authorized."
      })),
      ...(calls.length === 0 && ideas.length === 0 && statusLines.length === 0 && vetoLines.length === 0 && retiredLines.length === 0
        ? [{
            type: "content" as const,
            description: `${snapshotNote} The room produced no trend call it could support with a number, which is a correct answer to a quiet week.`,
            assetsNeeded: [],
            platformPolicyNote: "Nothing to publish, and nothing invented to fill the gap."
          }]
        : [])
    ],
    calendar: weeklyRhythm(snapshotNote).map((focus, index) => ({ week: index + 1, focus })),
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
