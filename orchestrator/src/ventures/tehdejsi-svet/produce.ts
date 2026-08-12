import { z } from "zod";
import type { TsStoryBrief } from "../../contracts/ts-story-brief.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { craftFindings, type LintFinding, type TerminologyTable } from "./lints.js";

/**
 * Day B: two editorial passes over one plan, and a backstop that catches the blatant failure.
 *
 * The Czech pass reads the canonical brief. The Ukrainian pass reads the same brief *and* the
 * Czech copy — as reference, with an explicit instruction to adapt rather than translate. The
 * reference is deliberate: withholding it would produce two features that happen to be about the
 * same fact, and showing it without the instruction would produce a translation. Neither is what
 * the venture promised.
 */
export const TS_MAX_SLIDE_WORDS = 20;

const LanguagePassSchema = z.strictObject({
  slides: z.array(z.strictObject({
    ordinal: z.number().int().min(1).max(10),
    text: z.string().trim().min(1).max(400)
  })).min(2).max(10),
  caption: z.string().trim().min(1).max(2_200),
  /** Present only on the Czech pass; the Ukrainian pass inherits the decision. */
  contextLine: z.string().trim().min(1).max(300).nullable().optional()
});

export type LanguagePass = z.infer<typeof LanguagePassSchema>;

export function parseLanguagePass(text: string): LanguagePass {
  return LanguagePassSchema.parse(JSON.parse(text));
}

/** The Czech pass sees the plan and nothing else. */
export function czechPacket(brief: TsStoryBrief): string {
  return JSON.stringify({
    language: "cs",
    angle: brief.angle,
    slideBeats: brief.slideBeats,
    claims: brief.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      singleSourceFraming: claim.singleSourceFraming
    })),
    ctaKind: brief.ctaKind,
    contextLineRequired: brief.contextLineRequired,
    maxWordsPerSlide: TS_MAX_SLIDE_WORDS
  });
}

/**
 * The Ukrainian pass sees the plan, the Czech copy, and the rule about what to do with it.
 *
 * `antiMirror` is carried in the packet rather than left in the system prompt so that the
 * instruction travels with the request into the model-call ledger. A reviewer reading a bad
 * package can see whether the rule was actually sent.
 */
export function ukrainianPacket(brief: TsStoryBrief, czech: LanguagePass): string {
  return JSON.stringify({
    language: "uk",
    angle: brief.angle,
    slideBeats: brief.slideBeats,
    claims: brief.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      singleSourceFraming: claim.singleSourceFraming
    })),
    ctaKind: brief.ctaKind,
    contextLineRequired: brief.contextLineRequired,
    maxWordsPerSlide: TS_MAX_SLIDE_WORDS,
    czechReference: {
      slides: czech.slides,
      caption: czech.caption
    },
    antiMirror:
      "The Czech copy is reference, not source. Write the Ukrainian feature for a Ukrainian "
      + "reader: choose its own opening, its own examples and its own rhythm. A sentence-by-"
      + "sentence rendering of the Czech fails the gate. The terminology table is authoritative "
      + "over anything the Czech copy implies about naming."
  });
}

function words(text: string): string[] {
  return text.trim().split(/\s+/u).filter((word) => word.length > 0);
}

export function wordCount(text: string): number {
  return words(text).length;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function numerals(text: string): string {
  return (text.match(/\d+/gu) ?? []).join(".");
}

function normalisedLetters(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export interface AntiMirrorVerdict {
  mirrored: boolean;
  /** Why the verdict is what it is, including "not enough sentences to judge". */
  detail: string;
  alignedSentences: number;
}

/**
 * The blatant-case backstop, and honest about being one.
 *
 * What actually prevents mirroring is the instruction in `ukrainianPacket`. No lexical measure
 * can tell a close adaptation from a loose translation without reading both, and pretending
 * otherwise would mean rejecting good Ukrainian copy for resembling good Czech copy. What this
 * catches is the failure mode that costs the venture its premise: a pass that rendered the Czech
 * sentence by sentence.
 *
 * A mirror preserves sentence-level alignment, so all three must hold before it says so — equal
 * sentence counts in *every* slide, aligned word counts within a quarter in *every* sentence
 * pair, and the same numerals in the same sentences. An adaptation that merges two sentences,
 * splits one, or moves a date to a different slide breaks the first or the third immediately.
 *
 * Below three aligned sentences there is not enough signal, and the verdict says that rather
 * than guessing. A two-slide package is judged by the reviewer, not by this.
 */
export function antiMirrorVerdict(
  slides: ReadonlyArray<{ cs: string; ua: string }>
): AntiMirrorVerdict {
  // A slide that is character-identical between the two languages is not a translation at all.
  // This needs no statistics and is checked first.
  const copied = slides.filter((slide) =>
    normalisedLetters(slide.cs).length > 0 &&
    normalisedLetters(slide.cs) === normalisedLetters(slide.ua));
  if (copied.length > 0) {
    return {
      mirrored: true,
      detail: `${copied.length} slide(s) carry the same text in both languages`,
      alignedSentences: 0
    };
  }

  const pairs: Array<{ cs: string; ua: string }> = [];
  for (const slide of slides) {
    const csSentences = sentences(slide.cs);
    const uaSentences = sentences(slide.ua);
    if (csSentences.length !== uaSentences.length) {
      return {
        mirrored: false,
        detail: "Sentence counts differ between the languages, which a mirror does not do",
        alignedSentences: pairs.length
      };
    }
    for (const [index, cs] of csSentences.entries()) {
      pairs.push({ cs, ua: uaSentences[index]! });
    }
  }
  if (pairs.length < 3) {
    return {
      mirrored: false,
      detail: "Fewer than three aligned sentences: too little signal to judge, so this defers to review",
      alignedSentences: pairs.length
    };
  }
  for (const pair of pairs) {
    const csWords = wordCount(pair.cs);
    const uaWords = wordCount(pair.ua);
    if (csWords === 0 || Math.abs(uaWords - csWords) / csWords > 0.25) {
      return {
        mirrored: false,
        detail: "Aligned sentence lengths diverge, which a sentence-by-sentence rendering does not",
        alignedSentences: pairs.length
      };
    }
    if (numerals(pair.cs) !== numerals(pair.ua)) {
      return {
        mirrored: false,
        detail: "Numbers fall in different sentences, which a mirror keeps in place",
        alignedSentences: pairs.length
      };
    }
  }
  return {
    mirrored: true,
    detail: `All ${pairs.length} sentences align one to one in count, length and numbers`,
    alignedSentences: pairs.length
  };
}

export interface TsProductionCallConfig {
  czech: Omit<GuardedCallInput<LanguagePass>, "input" | "parse">;
  ukrainian: Omit<GuardedCallInput<LanguagePass>, "input" | "parse">;
}

export interface TsBilingualDraft {
  slides: Array<{ ordinal: number; cs: string; ua: string }>;
  captionCs: string;
  captionUa: string;
  contextLine: string | null;
  antiMirror: AntiMirrorVerdict;
  findings: LintFinding[];
  usd: number;
}

/**
 * Both passes, in order, with the Czech one first because the second reads it.
 *
 * Findings from both languages are returned together and the caller drops the package on any of
 * them. Running the Ukrainian pass after a failed Czech one is deliberate: the pair is the
 * deliverable, and half of it has no use, but the second call is already the cheaper half and
 * stopping early would hide whether the Ukrainian side had its own problems. When the Czech pass
 * itself does not return a usable shape, nothing is spent on the second.
 */
export async function produceBilingualDraft(input: {
  brief: TsStoryBrief;
  table: TerminologyTable;
  callConfig: TsProductionCallConfig;
  wartimeSubject?: boolean;
  call?: typeof guardedJsonCall;
}): Promise<TsBilingualDraft> {
  const invoke = input.call ?? guardedJsonCall;
  const czech = await invoke({
    ...input.callConfig.czech,
    input: czechPacket(input.brief),
    parse: parseLanguagePass
  });
  const ukrainian = await invoke({
    ...input.callConfig.ukrainian,
    input: ukrainianPacket(input.brief, czech.value),
    parse: parseLanguagePass
  });

  const byOrdinal = new Map(ukrainian.value.slides.map((slide) => [slide.ordinal, slide.text]));
  const slides = czech.value.slides.map((slide) => ({
    ordinal: slide.ordinal,
    cs: slide.text,
    // An absent Ukrainian slide becomes an empty string rather than a missing key, so the gate
    // fails it as copy rather than the shape failing as a type error.
    ua: byOrdinal.get(slide.ordinal) ?? ""
  }));

  const tier = input.brief.sensitivityTier;
  const findings = [
    ...craftFindings({
      copy: [...slides.map((slide) => slide.cs), czech.value.caption].join("\n"),
      language: "cs",
      tier,
      table: input.table,
      wartimeSubject: input.wartimeSubject
    }),
    ...craftFindings({
      copy: [...slides.map((slide) => slide.ua), ukrainian.value.caption].join("\n"),
      language: "uk",
      tier,
      table: input.table,
      wartimeSubject: input.wartimeSubject
    })
  ];

  const antiMirror = antiMirrorVerdict(slides);
  if (antiMirror.mirrored) {
    findings.push({
      rule: "bilingual:mirror-translation",
      detail: `The Ukrainian pass rendered the Czech rather than adapting it. ${antiMirror.detail}.`
    });
  }

  return {
    slides,
    captionCs: czech.value.caption,
    captionUa: ukrainian.value.caption,
    contextLine: czech.value.contextLine ?? null,
    antiMirror,
    findings,
    usd: Number((czech.usd + ukrainian.usd).toFixed(6))
  };
}
