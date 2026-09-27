import {
  GOVIRAL_BRIEF_MAX_LESSONS,
  GOVIRAL_BRIEF_MAX_OPPORTUNITIES,
  GOVIRAL_BRIEF_SECTION_KEYS,
  GOVIRAL_BRIEF_WORDS_PER_MINUTE,
  GoViralWeeklyBriefSchema,
  readingTimeMinutes,
  type GoViralBriefOpportunity,
  type GoViralBriefSectionKey,
  type GoViralWeeklyBrief
} from "../contracts/goviral-weekly-brief.js";
import type { GoViralTrends } from "../sources/goviral-trends.js";
import { snapshotNoteFor, trendCalls, weeklyRhythm, type BriefContribution } from "./goviral-brief.js";
import { renderPlayLine, type PlayLibraryRead } from "./goviral-plays.js";

/**
 * The weekly brief as a document with a fixed skeleton.
 *
 * Every section has one declared source and no other. That is the whole point: the owner can look
 * at a heading and know what would have filled it, so an empty section is information rather than
 * an omission. Nothing here reads a seat's prose and decides where it belongs — a router that
 * guessed which sentence was a "prediction" would be inventing structure the room never stated.
 *
 * | Section       | Source                                                              |
 * | ------------- | ------------------------------------------------------------------- |
 * | Problem       | the chair's summary — the week's framing                            |
 * | Solution      | the shared weekly rhythm, the same four days the plan's calendar has |
 * | Players       | the desks named inside the trend calls, counted                     |
 * | Predictions   | only hashtags carrying a measured week-over-week delta              |
 * | Opportunities | the seats' ideas, numbered, at most three                           |
 * | Key Lessons   | the play library's top-rated plays, at most two                     |
 * | Haters        | vetoes, data staleness, and the standing measurement disclosure      |
 * | Links         | the evidence refs the seats cited                                   |
 *
 * There is no clock and no model call in this file. A brief built twice from the same inputs is
 * the same brief, apart from `generatedAt`, which the caller supplies.
 */

/** Said in every brief, because it is true in every brief and easy to forget between them. */
const MEASUREMENT_DISCLOSURE =
  "This brief measures no reach. The repository holds no follower, impression or click figure, so nothing here is a performance claim.";

const HEADINGS: Readonly<Record<GoViralBriefSectionKey, string>> = {
  problem: "Problem — what this week leaves unresolved",
  solution: "Solution — the week's rhythm",
  players: "Players — which desk each call belongs to",
  predictions: "Predictions — measured change, not forecast",
  opportunities: "Opportunities — numbered, at most three",
  "key-lessons": "Key Lessons — the plays that earned their rating",
  haters: "Haters — what could be wrong with all of this",
  links: "Links — everything cited above"
};

/** The desk a trend call belongs to is the first token inside its parentheses. */
function deskOf(call: string): string | null {
  return /\(([^,)]+)[^)]*\)/u.exec(call)?.[1]?.trim() ?? null;
}

function playersLines(calls: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const desk = deskOf(call);
    if (desk) counts.set(desk, (counts.get(desk) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return ["No call this week named a desk, so no desk is claimed here."];
  }
  return [...counts.entries()]
    .sort(([leftDesk, leftCount], [rightDesk, rightCount]) =>
      rightCount - leftCount || leftDesk.localeCompare(rightDesk, "en"))
    .map(([desk, count]) => `${desk}: ${count} call${count === 1 ? "" : "s"} this week.`);
}

function predictionLines(trends: GoViralTrends | null): string[] {
  const measured = (trends?.signals.topHashtags ?? [])
    .filter((signal) => signal.weekOverWeekDelta !== null)
    .slice(0, 3);
  if (measured.length === 0) {
    return ["No hashtag carries a comparison with a previous snapshot, so the room predicts nothing this week."];
  }
  return [
    ...measured.map((signal) => {
      const delta = signal.weekOverWeekDelta!;
      return `${signal.hashtag} (${signal.topicSet}) is ${delta >= 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)} against the previous snapshot, now ${signal.engagementPerHour.toFixed(1)} engagements/hour.`;
    }),
    "Each line is the difference between two snapshots. Nothing above is a forecast of what happens next."
  ];
}

function opportunitiesFor(date: string, contributions: readonly BriefContribution[]): GoViralBriefOpportunity[] {
  return contributions
    .filter((contribution): contribution is BriefContribution & { idea: NonNullable<BriefContribution["idea"]> } =>
      contribution.idea !== null)
    .slice(0, GOVIRAL_BRIEF_MAX_OPPORTUNITIES)
    .map((contribution, index) => ({
      id: `GV-${date}-O${index + 1}`,
      number: index + 1,
      title: contribution.idea.title,
      detail: contribution.idea.summary,
      evidenceRefs: [...new Set(contribution.evidenceRefs)].slice(0, 12)
    }));
}

function lessonLines(plays: PlayLibraryRead): string[] {
  const lines = plays.plays.slice(0, GOVIRAL_BRIEF_MAX_LESSONS).map(renderPlayLine);
  if (lines.length === 0) {
    return [
      plays.reason ?? "No play is rated well enough to print.",
      "A play is added by hand: a screenshot, a category, a read time, the benchmark it beat and a RICE rating. Until one exists this section stays empty rather than repeating advice nobody here has tested."
    ];
  }
  return plays.dropped > 0
    ? [...lines, `${plays.dropped} stored play${plays.dropped === 1 ? "" : "s"} did not match goviral-play-library/1 and ${plays.dropped === 1 ? "was" : "were"} dropped.`]
    : lines;
}

/**
 * Haters is the mandatory uncertainty note, and it is built so it cannot come out empty: the
 * measurement disclosure is always true and always last. Everything above it is a real objection —
 * a veto AUDIT actually cast, a snapshot that is not this week's, a library entry that lost its
 * screenshot — never a manufactured counterpoint.
 */
function hatersLines(input: {
  vetoed: boolean;
  auditSummary: string | null;
  snapshotNote: string;
  hasCalls: boolean;
  plays: PlayLibraryRead;
}): string[] {
  const lines: string[] = [];
  if (input.vetoed) {
    lines.push(`AUDIT vetoed this brief${input.auditSummary ? `: ${input.auditSummary}` : "."} It is a draft until the owner reads it.`);
  } else if (input.auditSummary) {
    lines.push(`AUDIT's review: ${input.auditSummary}`);
  }
  if (!input.snapshotNote.startsWith("Scout data from")) {
    lines.push(input.snapshotNote);
  }
  if (!input.hasCalls) {
    lines.push("No trend call cleared the week's data, so anything below the calls rests on the seats alone.");
  }
  const withoutBenchmark = input.plays.plays.filter(({ play }) => play.benchmark === null).length;
  if (withoutBenchmark > 0) {
    lines.push(`${withoutBenchmark} play${withoutBenchmark === 1 ? "" : "s"} in the library ${withoutBenchmark === 1 ? "has" : "have"} no benchmark, so ${withoutBenchmark === 1 ? "its" : "their"} rating is an opinion held at 50% confidence.`);
  }
  const withoutFile = input.plays.plays.filter(({ screenshotMissing }) => screenshotMissing).length;
  if (withoutFile > 0) {
    lines.push(`${withoutFile} play${withoutFile === 1 ? "" : "s"} name${withoutFile === 1 ? "s" : ""} a screenshot whose file is not in the repository.`);
  }
  lines.push(MEASUREMENT_DISCLOSURE);
  return lines;
}

function countWords(values: readonly string[]): number {
  return values.reduce((total, value) => total + value.split(/\s+/u).filter(Boolean).length, 0);
}

export interface GoViralBriefSkeletonInput {
  date: string;
  trends: GoViralTrends | null;
  contributions: readonly BriefContribution[];
  vetoed: boolean;
  plays: PlayLibraryRead;
  generatedAt: string;
}

export function buildGoViralBriefSkeleton(input: GoViralBriefSkeletonInput): GoViralWeeklyBrief {
  const calls = trendCalls(input.trends);
  const snapshotNote = snapshotNoteFor(input.date, input.trends);
  const chair = input.contributions.find((contribution) => contribution.agent === "PULSE");
  const audit = input.contributions.find((contribution) => contribution.agent === "AUDIT");
  const opportunities = opportunitiesFor(input.date, input.contributions);
  const evidenceRefs = [...new Set(input.contributions.flatMap((contribution) => contribution.evidenceRefs))];

  const lines: Readonly<Record<GoViralBriefSectionKey, string[]>> = {
    problem: [chair?.summary ?? "The chair recorded no framing this week.", snapshotNote],
    solution: weeklyRhythm(snapshotNote),
    players: playersLines(calls),
    predictions: predictionLines(input.trends),
    opportunities: opportunities.length > 0
      ? opportunities.map((opportunity) => `${opportunity.id} — ${opportunity.title}: ${opportunity.detail}`)
      : ["No seat recorded an opportunity this week."],
    "key-lessons": lessonLines(input.plays),
    haters: hatersLines({
      vetoed: input.vetoed,
      auditSummary: audit?.summary ?? null,
      snapshotNote,
      hasCalls: calls.length > 0,
      plays: input.plays
    }),
    links: evidenceRefs.length > 0 ? evidenceRefs : ["No seat cited an evidence ref this week."]
  };

  const sections = GOVIRAL_BRIEF_SECTION_KEYS.map((key) => ({
    key,
    heading: HEADINGS[key],
    // The cap is the schema's, and clipping is what the contribution schema already does with an
    // over-long summary: losing the twelfth line of a section is cheaper than losing the brief.
    lines: lines[key].slice(0, 12).map((line) => line.slice(0, 600))
  }));
  const wordCount = countWords(sections.flatMap((section) => [section.heading, ...section.lines]));

  return GoViralWeeklyBriefSchema.parse({
    schemaVersion: "goviral-weekly-brief/1",
    ventureId: "goviral",
    date: input.date,
    title: `Weekly brief — ${input.date}`,
    planRef: `state/ventures/goviral/plans/plan-${input.date}-weekly-brief.json`,
    wordCount,
    readingTimeMinutes: readingTimeMinutes(wordCount),
    sections,
    opportunities,
    status: input.vetoed ? "draft" : "approved",
    generatedAt: input.generatedAt
  });
}

/**
 * The document the owner actually opens. Reading time first, because that is the point of it, and
 * then the one thing to start with — opportunities are numbered in seat order, so O1 is the chair's
 * idea when the chair filed one. That line is derived from the numbering rather than chosen: the
 * brief is not allowed a favourite nobody can recompute.
 */
export function renderGoViralBriefMarkdown(brief: GoViralWeeklyBrief): string {
  const first = brief.opportunities[0];
  return [
    `# ${brief.title}`,
    "",
    `${brief.readingTimeMinutes} min read · ${brief.wordCount} words at ${GOVIRAL_BRIEF_WORDS_PER_MINUTE} words per minute · status: ${brief.status}`,
    "",
    first
      ? `Start here: ${first.id} — ${first.title}.`
      : "Nothing is numbered this week, so there is no first thing to do.",
    "",
    `Plan: \`${brief.planRef}\``,
    "",
    ...brief.sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.lines.map((line) => `- ${line}`),
      ""
    ]),
    "This is a planning document. It does not authorize publishing, paid ads, outreach or spending.",
    ""
  ].join("\n");
}
