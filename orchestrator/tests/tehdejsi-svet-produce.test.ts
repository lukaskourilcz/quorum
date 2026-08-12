import { describe, expect, it } from "vitest";
import { TsStoryBriefSchema, type TsStoryBrief } from "../src/contracts/ts-story-brief.js";
import { loadTerminologyTable } from "../src/ventures/tehdejsi-svet/lints.js";
import {
  antiMirrorVerdict,
  czechPacket,
  produceBilingualDraft,
  ukrainianPacket,
  wordCount,
  type LanguagePass
} from "../src/ventures/tehdejsi-svet/produce.js";
import type { guardedJsonCall } from "../src/llm/call.js";

const table = await loadTerminologyTable();

const BRIEF: TsStoryBrief = TsStoryBriefSchema.parse({
  schemaVersion: "ts-story-brief/1",
  briefId: "2026-08-13-cs-1970s-vecernicek",
  cycleId: "cycle-2026-08-13-ts",
  date: "2026-08-13",
  factsHash: "a".repeat(64),
  factIds: ["cs-1970s-vecernicek"],
  shortlistRef: "state/ventures/tehdejsi-svet/shortlists/2026-08-13.json",
  dossierRefs: [],
  sensitivityTier: 0,
  tierRaisedBy: [],
  angle: "A few minutes before bed that a household set its evening by, opened on the tune.",
  slideBeats: [
    { ordinal: 1, beat: "Open on the minutes before bed and the tune that ended the day.", claimIds: ["ran-from-1965"] },
    { ordinal: 2, beat: "Place it in the household evening around it.", claimIds: [] },
    { ordinal: 3, beat: "Ask who put it on and what was for supper.", claimIds: [] }
  ],
  claims: [{
    claimId: "ran-from-1965",
    statement: "The programme ran from 1965 and its slot fixed the household evening.",
    factIds: ["cs-1970s-vecernicek"],
    dossierRefs: [],
    singleSourceFraming: true
  }],
  ctaKind: "ask-your-parents",
  contextLineRequired: false,
  generatedAt: "2026-08-13T18:00:00.000Z"
});

const CALL_CONFIG = {
  czech: {
    stateRoot: "/tmp/unused", cycleId: "c", phase: "ts-desk", ventureId: "tehdejsi-svet",
    agent: "LETOPIS", provider: "anthropic" as const, model: "claude-test", system: "cs",
    maxOutputTokens: 1_500, budgetContext: { phase: "ts-desk" }
  },
  ukrainian: {
    stateRoot: "/tmp/unused", cycleId: "c", phase: "ts-desk", ventureId: "tehdejsi-svet",
    agent: "VERBA", provider: "anthropic" as const, model: "claude-test", system: "uk",
    maxOutputTokens: 1_500, budgetContext: { phase: "ts-desk" }
  }
} as never;

/** An adaptation: its own opening, its own rhythm, three sentences where the Czech has four. */
const ADAPTED: LanguagePass = {
  slides: [
    { ordinal: 1, text: "Кілька хвилин перед сном. За ними звіряли годинник." },
    { ordinal: 2, text: "З 1965 року. Вечір у домі складався навколо цих хвилин, і всі про це знали." },
    { ordinal: 3, text: "Хто вмикав його вам?" }
  ],
  caption: "Кілька хвилин, які ділили день. Що пам'ятаєте ви?"
};

const CZECH: LanguagePass = {
  slides: [
    { ordinal: 1, text: "Pár minut před spaním. Znělka, která končila den." },
    { ordinal: 2, text: "Od roku 1965. Rodiny podle něj poznaly, kolik je hodin." },
    { ordinal: 3, text: "Kdo vám ho pouštěl?" }
  ],
  caption: "Pár minut, které rozdělily den. Na co si vzpomínáte vy?",
  contextLine: null
};

/** A mirror: the same sentence count, the same lengths, the same numbers in the same places. */
const MIRRORED: LanguagePass = {
  slides: [
    { ordinal: 1, text: "Кілька хвилин перед сном. Мелодія, що завершувала день." },
    { ordinal: 2, text: "Від 1965 року. Родини за ним дізнавалися, котра година." },
    { ordinal: 3, text: "Хто вам його вмикав?" }
  ],
  caption: "Кілька хвилин, що розділили день. Що ви пам'ятаєте?"
};

function twoCall(czech: LanguagePass, ukrainian: LanguagePass, usd = 0.075): typeof guardedJsonCall {
  const replies = [czech, ukrainian];
  let index = 0;
  return (async (request: { parse: (text: string) => unknown }) => ({
    value: request.parse(JSON.stringify(replies[index++])),
    cached: false,
    usd
  })) as unknown as typeof guardedJsonCall;
}

describe("Tehdejsi svet Day B passes", () => {
  it("shows the Czech pass the plan and nothing else", () => {
    const packet = czechPacket(BRIEF);
    expect(packet).toContain("slideBeats");
    expect(packet).toContain("maxWordsPerSlide");
    expect(packet).not.toContain("czechReference");
  });

  it("carries the anti-mirror instruction in the packet, not only in the system prompt", () => {
    // A reviewer reading a bad package has to be able to see whether the rule was actually sent.
    const packet = ukrainianPacket(BRIEF, CZECH);
    expect(packet).toContain("czechReference");
    expect(packet).toContain("reference, not source");
    expect(packet).toContain("terminology table is authoritative");
  });

  it("pairs the two passes by slide ordinal and sums what both cost", async () => {
    const draft = await produceBilingualDraft({
      brief: BRIEF, table, callConfig: CALL_CONFIG, call: twoCall(CZECH, ADAPTED)
    });
    expect(draft.slides).toHaveLength(3);
    expect(draft.slides[0]).toMatchObject({ ordinal: 1, cs: CZECH.slides[0]!.text, ua: ADAPTED.slides[0]!.text });
    expect(draft.usd).toBe(0.15);
    expect(draft.findings).toEqual([]);
  });

  it("empties a missing Ukrainian slide rather than losing it, so the gate fails it as copy", async () => {
    const short: LanguagePass = { slides: ADAPTED.slides.slice(0, 2), caption: ADAPTED.caption };
    const draft = await produceBilingualDraft({
      brief: BRIEF, table, callConfig: CALL_CONFIG, call: twoCall(CZECH, short)
    });
    expect(draft.slides).toHaveLength(3);
    expect(draft.slides[2]!.ua).toBe("");
  });

  it("runs both languages through the craft gate", async () => {
    const banned: LanguagePass = {
      ...ADAPTED,
      slides: [
        { ordinal: 1, text: "Це була велика вітчизняна війна. Так тоді казали." },
        ...ADAPTED.slides.slice(1)
      ]
    };
    const draft = await produceBilingualDraft({
      brief: BRIEF, table, callConfig: CALL_CONFIG, call: twoCall(CZECH, banned)
    });
    expect(draft.findings.map((finding) => finding.rule)).toContain("terminology:great-patriotic-war");
  });
});

describe("the anti-mirror rule", () => {
  it("passes a native adaptation", async () => {
    const draft = await produceBilingualDraft({
      brief: BRIEF, table, callConfig: CALL_CONFIG, call: twoCall(CZECH, ADAPTED)
    });
    expect(draft.antiMirror.mirrored).toBe(false);
    expect(draft.findings.map((finding) => finding.rule)).not.toContain("bilingual:mirror-translation");
  });

  it("fails a sentence-by-sentence rendering of the Czech", async () => {
    const draft = await produceBilingualDraft({
      brief: BRIEF, table, callConfig: CALL_CONFIG, call: twoCall(CZECH, MIRRORED)
    });
    expect(draft.antiMirror.mirrored).toBe(true);
    expect(draft.findings.map((finding) => finding.rule)).toContain("bilingual:mirror-translation");
  });

  it("catches a slide that was not even translated", () => {
    const verdict = antiMirrorVerdict([
      { cs: "Pár minut před spaním.", ua: "Pár minut před spaním." },
      { cs: "Od roku 1965.", ua: "Від 1965 року." }
    ]);
    expect(verdict.mirrored).toBe(true);
    expect(verdict.detail).toContain("same text in both languages");
  });

  it("clears a package whose sentence counts differ, because a mirror does not restructure", () => {
    const verdict = antiMirrorVerdict([
      { cs: "Pár minut. Znělka. Konec dne.", ua: "Кілька хвилин перед сном, і день закінчено." },
      { cs: "Od roku 1965.", ua: "Від 1965 року." },
      { cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
    ]);
    expect(verdict.mirrored).toBe(false);
    expect(verdict.detail).toContain("Sentence counts differ");
  });

  it("clears a package where a number moved to a different sentence", () => {
    const verdict = antiMirrorVerdict([
      { cs: "Pár minut před spaním. Od roku 1965 to bylo tak.", ua: "З 1965 року так було. Кілька хвилин перед сном." },
      { cs: "Rodiny podle toho poznaly čas.", ua: "Родини за цим знали час." }
    ]);
    expect(verdict.mirrored).toBe(false);
    expect(verdict.detail).toContain("Numbers fall in different sentences");
  });

  it("declines to judge below three aligned sentences instead of guessing", () => {
    // A lexical measure cannot tell a close adaptation from a loose translation on two
    // sentences, and pretending it can would reject good Ukrainian for resembling good Czech.
    const verdict = antiMirrorVerdict([
      { cs: "Pár minut před spaním.", ua: "Кілька хвилин перед сном." },
      { cs: "Od roku 1965.", ua: "Від 1965 року." }
    ]);
    expect(verdict).toMatchObject({ mirrored: false, alignedSentences: 2 });
    expect(verdict.detail).toContain("too little signal");
  });
});

describe("word counting", () => {
  it("counts words the way the slide cap will", () => {
    expect(wordCount("Pár minut před spaním")).toBe(4);
    expect(wordCount("  spaced   out  words  ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
