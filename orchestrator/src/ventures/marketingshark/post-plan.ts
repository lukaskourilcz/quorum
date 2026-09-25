import { readAnnouncementCopy } from "./announcement.js";
import { difficultyLabel, loadChallengeSnapshot, selectChallenge, slideText, TRACK_LABELS, type Challenge } from "./challenges.js";
import { brandLocales, factSheetFor, factSheetText, scheduledKind, type Brand, type FactSheet } from "./config.js";
import {
  clipToWords,
  fillPattern,
  weekdayOf,
  weekIndexOf,
  type PostDeckKind,
  type RotationKind,
  type Weekday
} from "./kinds.js";
import type { PostPackage, PostWriterOutput } from "./package.js";
import { codeSlideAlt, codeSlidesClip, type CodeSlide } from "./post-render.js";
import { planWeek } from "./week.js";

/**
 * What the day's room drafts, decided before anything is spent (quorum#576).
 *
 * The rotation names a kind per weekday. A kind beyond the quiz needs a source — a screen the fact
 * sheet names, an imported challenge, a week with something in it — and when its source is missing
 * the day falls back to the quiz carousel and says why, rather than drafting a thinner post or
 * none. The owner's launch announcement, when its copy file exists for the date, takes the day
 * whatever the rotation says. All of it is $0.
 */

export interface PostDayPlan {
  kind: PostDeckKind;
  weekday: Weekday;
  scheduled: RotationKind | null;
  subject: { ref: string; label: string };
  hook: { patternId: string; en: string };
  codeSlides: Readonly<Record<string, CodeSlide>>;
  provenance: Pick<PostPackage, "spotlight" | "challenge" | "week" | "announcement">;
  /** The packet section that states today's subject: the facts the writer may use, and no others. */
  brief: string;
  /** Text whose numbers the post may repeat; a number from anywhere else is refused. */
  numberSource: string;
  /** The owner's copy, for the announcement; the writer's reply stands in its place otherwise. */
  ownerCopy: PostWriterOutput | null;
}

export type DayPlan =
  | { kind: "none"; weekday: Weekday; reason: string }
  | { kind: "quiz"; weekday: Weekday; fallback: { scheduled: RotationKind; reason: string } | null }
  | { kind: "invalid"; weekday: Weekday; reason: string }
  | PostDayPlan;

function footerSlide(line: string): CodeSlide {
  return { headline: line, body: "", alt: codeSlideAlt(5, line) };
}

/** The fact-sheet sentences that name a term, which is all the writer is told about that screen. */
function linesNaming(facts: FactSheet, term: string): string[] {
  const needle = term.toLowerCase();
  return [facts.whatVisitorsCanDo, ...facts.allowedClaims]
    .flatMap((text) => text.split(/(?<=\.)\s+/u))
    .filter((sentence) => sentence.toLowerCase().includes(needle));
}

/** Tuesday: one screen the fact sheet names, a new one each week. */
export function planSpotlight(brand: Brand, date: string): PostDayPlan | string {
  const settings = brand.postKinds["feature-spotlight"];
  const facts = factSheetFor(brand, date);
  if (!settings) return "no feature spotlight is configured";
  if (!facts) return `${brand.displayName} has no fact sheet, and a spotlight may say nothing else`;
  const named = settings.screens.filter((screen) => linesNaming(facts, screen.factTerm).length > 0);
  if (named.length === 0) return "the fact sheet in effect names none of the spotlight's screens";
  const screen = named[weekIndexOf(date) % named.length]!;
  const hook = fillPattern(settings.hookPattern.en, { displayName: brand.displayName, screen: screen.name });
  const codeSlides = { hook: { headline: hook, body: "", alt: codeSlideAlt(1, hook) }, footer: footerSlide(settings.footer.en) };
  const clipped = codeSlidesClip(brand, "feature-spotlight", codeSlides);
  if (clipped.length > 0) return `the spotlight's own slides would clip (${clipped.join(", ")})`;
  return {
    kind: "feature-spotlight",
    weekday: weekdayOf(date),
    scheduled: "feature-spotlight",
    subject: { ref: `marketingshark:feature:${screen.id}`, label: screen.name },
    hook: { patternId: settings.hookPattern.id, en: hook },
    codeSlides,
    provenance: { spotlight: { screen, factSheetEffectiveFrom: facts.effectiveFrom } },
    brief: `## Today's post: a feature spotlight of ${screen.name}\n`
      + `Slide 1 and slide 5 are written. Slides 2 to 4 describe ${screen.name}: what it is, how a visitor uses it, and why it helps a`
      + ` developer, from the product facts above and nothing else. These are the lines of the fact sheet that name it:\n`
      + linesNaming(facts, screen.factTerm).map((line) => `- ${line}`).join("\n")
      + `\nWhere the facts say little about it, say little. A short slide is better than a detail the facts do not give.`,
    numberSource: [factSheetText(facts), screen.name, brand.displayName].join("\n"),
    ownerCopy: null
  };
}

/** The slides code writes for a challenge: slide 1's label, the prompt and the first hint. */
export function challengeCodeSlides(brand: Brand, challenge: Challenge): Record<string, CodeSlide> {
  const settings = brand.postKinds["challenge-teaser"]!;
  const label = difficultyLabel(challenge.difficulty);
  const hook = fillPattern(settings.hookPattern.en, { difficulty: label, title: challenge.title });
  const prompt = slideText(challenge.prompt);
  const hint = slideText(challenge.firstHint);
  return {
    hook: { headline: hook, body: TRACK_LABELS[challenge.track], alt: codeSlideAlt(1, hook) },
    prompt: { headline: `${label} · ${TRACK_LABELS[challenge.track]}`, body: prompt, alt: codeSlideAlt(2, `the challenge. ${prompt}`) },
    hint: { headline: "Hint 1", body: hint, alt: codeSlideAlt(3, `the first hint. ${hint}`) },
    footer: footerSlide(settings.footer.en)
  };
}

/** Wednesday: one challenge of the configured label, its prompt and first hint and never more. */
export async function planChallenge(brand: Brand, date: string, repoRoot: string): Promise<PostDayPlan | string> {
  const settings = brand.postKinds["challenge-teaser"];
  if (!settings) return "no challenge teaser is configured";
  const snapshot = await loadChallengeSnapshot(settings.challengeBank.snapshotPath, repoRoot);
  if (!snapshot) return "no challenge snapshot has been imported yet; devShark's difficulty labels (its step D5) come first";
  const challenge = selectChallenge({
    snapshot,
    difficulty: settings.challengeBank.difficulty,
    date,
    fits: (candidate) => codeSlidesClip(brand, "challenge-teaser", challengeCodeSlides(brand, candidate)).length === 0
  });
  if (!challenge) return `the challenge snapshot has no ${difficultyLabel(settings.challengeBank.difficulty)} challenge whose words fit its slides`;
  const facts = factSheetFor(brand, date);
  const label = difficultyLabel(challenge.difficulty);
  const codeSlides = challengeCodeSlides(brand, challenge);
  return {
    kind: "challenge-teaser",
    weekday: weekdayOf(date),
    scheduled: "challenge-teaser",
    subject: { ref: `marketingshark:challenge:${challenge.id}`, label: challenge.title },
    hook: { patternId: settings.hookPattern.id, en: codeSlides.hook!.headline },
    codeSlides,
    provenance: {
      challenge: {
        id: challenge.id,
        track: challenge.track,
        title: challenge.title,
        difficulty: challenge.difficulty,
        snapshotContentHash: snapshot.contentHash,
        sourceCommit: snapshot.sourceCommit
      }
    },
    brief: `## Today's post: a challenge teaser\n`
      + `challenge: ${challenge.title} (${label}, ${TRACK_LABELS[challenge.track]})\n`
      + `Slide 2 shows its prompt and slide 3 its first hint, exactly as below; code has written both, and slides 1 and 5.\n`
      + `prompt: ${slideText(challenge.prompt)}\n`
      + `first hint: ${slideText(challenge.firstHint)}\n`
      + `Slide 4 invites the reader to try it in devShark. The solution is not given to you and must not be written: no code,`
      + ` no sketch of it, and no method, operator or function that the prompt and the hint do not name.`,
    numberSource: [challenge.title, challenge.prompt, challenge.firstHint, factSheetText(facts)].join("\n"),
    ownerCopy: null
  };
}

/**
 * The day's plan. `stateRoot` holds this run's own packages (the dry-run tree in a dry run);
 * `factStateRoot` is the committed state read in every run: GoVIRAL's snapshots and the owner's copy.
 */
export async function planDay(input: {
  brand: Brand;
  date: string;
  stateRoot: string;
  factStateRoot: string;
  repoRoot: string;
  configRoot: string;
}): Promise<DayPlan> {
  const { brand, date } = input;
  const weekday = weekdayOf(date);
  const englishOnly = brandLocales(brand).join(",") === "en";

  const announcement = await readAnnouncementCopy(input.factStateRoot, date, brand.id);
  if (announcement.status === "invalid") {
    return { kind: "invalid", weekday, reason: `The owner's announcement copy at ${announcement.copyRef} was not drafted: ${announcement.reason}.` };
  }
  if (announcement.status === "ready") {
    if (!brand.postKinds.announcement || !englishOnly) {
      return { kind: "invalid", weekday, reason: `The owner's announcement copy at ${announcement.copyRef} was not drafted: ${brand.displayName} has no English-only announcement kind configured.` };
    }
    const { copy } = announcement;
    const hook = copy.slides[0]?.headline ?? "";
    return {
      kind: "announcement",
      weekday,
      scheduled: scheduledKind(brand, date),
      subject: { ref: `marketingshark:announcement:${date}`, label: clipToWords(hook || "Launch announcement", 160) },
      hook: { patternId: "owner", en: hook },
      codeSlides: {},
      provenance: { announcement: { copyRef: announcement.copyRef } },
      brief: "",
      numberSource: [factSheetText(factSheetFor(brand, date)), brand.displayName].join("\n"),
      ownerCopy: { slides: copy.slides, descriptions: copy.descriptions, hashtags: copy.hashtags }
    };
  }

  const scheduled = scheduledKind(brand, date);
  if (!scheduled) {
    return { kind: "none", weekday, reason: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} has no marketingShark room: the rotation drafts Monday to Friday (quorum#576).` };
  }
  if (scheduled === "quiz") return { kind: "quiz", weekday, fallback: null };
  const fallback = (reason: string): DayPlan => ({ kind: "quiz", weekday, fallback: { scheduled, reason: `The ${scheduled} was scheduled; ${reason}.` } });
  if (!englishOnly) return fallback(`it is written in English only, and ${brand.displayName} also writes Czech`);

  const planned = scheduled === "feature-spotlight"
    ? planSpotlight(brand, date)
    : scheduled === "challenge-teaser"
      ? await planChallenge(brand, date, input.repoRoot)
      : await planWeek({ brand, date, stateRoot: input.stateRoot, factStateRoot: input.factStateRoot, configRoot: input.configRoot });
  return typeof planned === "string" ? fallback(planned) : planned;
}
