import { describe, expect, it } from "vitest";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import { TsStoryBriefSchema, type TsStoryBrief } from "../src/contracts/ts-story-brief.js";
import {
  draftPath,
  gateTsPackage,
  tallyDrops,
  type TsPriorFeature,
  type TsProductionGateInput
} from "../src/ventures/tehdejsi-svet/production-gates.js";
import type { TsBilingualDraft } from "../src/ventures/tehdejsi-svet/produce.js";

const FACT: TehdejsiFact = {
  id: "cs-1970s-vecernicek",
  kind: "media",
  country: "cz",
  place: null,
  yearFrom: 1965,
  yearTo: 1995,
  sensitivityTier: 0,
  shareSafe: true,
  text: "The programme ran for a few minutes before bed and its tune ended the household day.",
  sources: [{ title: "Archive listing", url: null, note: null }],
  verified: null
};

function brief(overrides: Partial<TsStoryBrief> = {}): TsStoryBrief {
  return TsStoryBriefSchema.parse({
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
      { ordinal: 1, beat: "Open on the minutes before bed and the tune.", claimIds: ["ran-from-1965"] },
      { ordinal: 2, beat: "Ask who put it on and what was for supper.", claimIds: [] }
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
    generatedAt: "2026-08-13T18:00:00.000Z",
    ...overrides
  });
}

function draft(overrides: Partial<TsBilingualDraft> = {}): TsBilingualDraft {
  return {
    slides: [
      { ordinal: 1, cs: "Pár minut před spaním a znělka, která končila den.", ua: "Кілька хвилин перед сном. За ними звіряли час." },
      { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам щовечора?" }
    ],
    captionCs: "Pár minut, které rozdělily den. Na co si vzpomínáte vy?",
    captionUa: "Кілька хвилин, які ділили день. Що пам'ятаєте ви?",
    contextLine: null,
    antiMirror: { mirrored: false, detail: "too little signal", alignedSentences: 2 },
    findings: [],
    usd: 0.15,
    ...overrides
  };
}

function input(overrides: Partial<TsProductionGateInput> = {}): TsProductionGateInput {
  return {
    brief: brief(),
    draft: draft(),
    facts: [FACT],
    priorFeatures: [],
    date: "2026-08-14",
    ...overrides
  };
}

function rules(verdict: { issues: ReadonlyArray<{ rule: string }> }): string[] {
  return [...new Set(verdict.issues.map((issue) => issue.rule))].sort();
}

function prior(overrides: Partial<TsPriorFeature> = {}): TsPriorFeature {
  return {
    id: "ts-2026-08-01-something",
    date: "2026-08-01",
    factIds: ["ua-1970s-kyiv-fares"],
    ctaKind: "none",
    slidesCs: ["Něco úplně jiného."],
    slidesUa: ["Щось зовсім інше."],
    ...overrides
  };
}

describe("Tehdejsi svet production gates", () => {
  it("passes a clean package", () => {
    const verdict = gateTsPackage(input());
    expect(verdict).toEqual({ passed: true, issues: [] });
  });

  it("caps slide length in each language independently", () => {
    const long = "slovo ".repeat(21).trim();
    expect(rules(gateTsPackage(input({
      draft: draft({ slides: [
        { ordinal: 1, cs: long, ua: "Кілька хвилин перед сном." },
        { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
      ] })
    })))).toEqual(["slides:word-cap"]);

    const verdict = gateTsPackage(input({
      draft: draft({ slides: [
        { ordinal: 1, cs: "Pár minut před spaním.", ua: "слово ".repeat(25).trim() },
        { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
      ] })
    }));
    expect(verdict.issues[0]?.detail).toContain("uk runs to 25 words");
  });

  it("fails an empty slide in either language", () => {
    expect(rules(gateTsPackage(input({
      draft: draft({ slides: [
        { ordinal: 1, cs: "Pár minut před spaním.", ua: "" },
        { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
      ] })
    })))).toEqual(["slides:empty"]);
  });

  it("fails a package whose slide count left the plan behind", () => {
    expect(rules(gateTsPackage(input({
      draft: draft({ slides: [
        ...draft().slides,
        { ordinal: 3, cs: "Ještě jeden slide navíc.", ua: "Ще один слайд." }
      ] })
    })))).toContain("slides:beat-count");
  });

  it("refuses a claim that resolves to nothing, and one sourced once without the framing", () => {
    expect(rules(gateTsPackage(input({ facts: [] })))).toContain("claims:unresolved");
    expect(rules(gateTsPackage(input({
      brief: brief({
        claims: [{
          claimId: "ran-from-1965",
          statement: "The programme ran from 1965 and its slot fixed the household evening.",
          factIds: ["cs-1970s-vecernicek"],
          dossierRefs: [],
          singleSourceFraming: false
        }]
      })
    })))).toContain("claims:single-source-unframed");
  });

  it("accepts a claim behind two sources without the single-source framing", () => {
    const twoSourced: TehdejsiFact = {
      ...FACT,
      sources: [
        { title: "Archive listing", url: null, note: null },
        { title: "Broadcast schedule", url: null, note: null }
      ]
    };
    expect(gateTsPackage(input({
      facts: [twoSourced],
      brief: brief({
        claims: [{
          claimId: "ran-from-1965",
          statement: "The programme ran from 1965 and its slot fixed the household evening.",
          factIds: ["cs-1970s-vecernicek"],
          dossierRefs: [],
          singleSourceFraming: false
        }]
      })
    })).passed).toBe(true);
  });

  it("refuses a quotation that appears in no permitted source, in either language", () => {
    expect(rules(gateTsPackage(input({
      draft: draft({ slides: [
        { ordinal: 1, cs: "Říkal: „Tohle nikdo nikdy neřekl.“", ua: "Кілька хвилин перед сном." },
        { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
      ] })
    })))).toEqual(["quotes:unsourced"]);

    // The same quotation with its source present passes, on a substring match.
    expect(gateTsPackage(input({
      permittedQuotes: ["V archivu stojí: Tohle nikdo nikdy neřekl, a přesto se to traduje."],
      draft: draft({ slides: [
        { ordinal: 1, cs: "Říkal: „Tohle nikdo nikdy neřekl.“", ua: "Кілька хвилин перед сном." },
        { ordinal: 2, cs: "Kdo vám ho pouštěl?", ua: "Хто вмикав його вам?" }
      ] })
    })).passed).toBe(true);
  });

  it("holds tag prompts to one a week and counts the package being judged", () => {
    const tagging = brief({ ctaKind: "tag-a-friend" });
    // A limit that excludes the package under judgement is a limit the package always passes.
    expect(gateTsPackage(input({ brief: tagging })).passed).toBe(true);
    expect(rules(gateTsPackage(input({
      brief: tagging,
      priorFeatures: [prior({ date: "2026-08-11", ctaKind: "tag-a-friend" })]
    })))).toEqual(["cta:tag-prompt-frequency"]);
    // Eight days back is outside the window.
    expect(gateTsPackage(input({
      brief: tagging,
      priorFeatures: [prior({ date: "2026-08-06", ctaKind: "tag-a-friend" })]
    })).passed).toBe(true);
  });

  it("holds product links to half of features", () => {
    const linking = brief({ ctaKind: "product-link" });
    expect(rules(gateTsPackage(input({ brief: linking })))).toEqual(["cta:product-link-share"]);
    expect(gateTsPackage(input({
      brief: linking,
      priorFeatures: [prior({ id: "a" }), prior({ id: "b", ctaKind: "product-link" }), prior({ id: "c" })]
    })).passed).toBe(true);
  });

  it("refuses copy that already shipped and a subject used inside three weeks", () => {
    expect(rules(gateTsPackage(input({
      priorFeatures: [prior({
        id: "ts-2026-08-02-vecernicek",
        date: "2026-07-01",
        slidesCs: draft().slides.map((slide) => slide.cs),
        slidesUa: ["něco jiného"]
      })]
    })))).toEqual(["duplicate:copy"]);

    expect(rules(gateTsPackage(input({
      priorFeatures: [prior({ date: "2026-08-05", factIds: ["cs-1970s-vecernicek"] })]
    })))).toEqual(["duplicate:recent-subject"]);

    // The same subject a month later is a re-run of a fact, not a repeat to the reader.
    expect(gateTsPackage(input({
      priorFeatures: [prior({ date: "2026-07-01", factIds: ["cs-1970s-vecernicek"] })]
    })).passed).toBe(true);
  });

  it("runs the stop-slop lint over both languages", () => {
    expect(rules(gateTsPackage(input({
      draft: draft({ captionCs: "Neuvěříte, co bylo dál." })
    })))).toEqual(["stop-slop:cs"]);
    expect(rules(gateTsPackage(input({
      draft: draft({ captionUa: "Ви не повірите, що було далі." })
    })))).toEqual(["stop-slop:uk"]);
  });

  it("demands the tier-1 context line", () => {
    const tierOne = brief({ sensitivityTier: 1, contextLineRequired: true });
    expect(rules(gateTsPackage(input({ brief: tierOne })))).toEqual(["tier1:missing-context-line"]);
    expect(gateTsPackage(input({
      brief: tierOne,
      draft: draft({ contextLine: "Byla to doba, kdy se o tom mluvit nedalo." })
    })).passed).toBe(true);
  });

  it("carries the passes' own findings rather than recomputing them", () => {
    // A second computation is a second chance to disagree with the first.
    expect(rules(gateTsPackage(input({
      draft: draft({ findings: [{ rule: "bilingual:mirror-translation", detail: "aligned one to one" }] })
    })))).toEqual(["bilingual:mirror-translation"]);
  });
});

describe("dropped packages are counted", () => {
  it("counts one drop per rule per package", () => {
    const tally = tallyDrops([
      { passed: true, issues: [] },
      { passed: false, issues: [
        { rule: "slides:word-cap", detail: "slide 1" },
        { rule: "slides:word-cap", detail: "slide 2" },
        { rule: "slides:word-cap", detail: "slide 3" }
      ] },
      { passed: false, issues: [{ rule: "stop-slop:cs", detail: "x" }] }
    ]);
    // Counting six word-cap hits would make the cap look like the venture's biggest problem.
    expect(tally).toEqual({
      attempted: 3,
      stored: 1,
      dropped: 2,
      byRule: { "slides:word-cap": 1, "stop-slop:cs": 1 }
    });
  });

  it("reports an honest zero rather than an empty object for a clean run", () => {
    expect(tallyDrops([{ passed: true, issues: [] }]))
      .toEqual({ attempted: 1, stored: 1, dropped: 0, byRule: {} });
  });
});

describe("draft storage is idempotent per cycle and story", () => {
  it("writes the same path twice for the same cycle and story", () => {
    const first = draftPath("cycle-2026-08-13-ts", "2026-08-13-cs-1970s-vecernicek");
    const second = draftPath("cycle-2026-08-13-ts", "2026-08-13-cs-1970s-vecernicek");
    expect(first).toBe(second);
    expect(first).toBe("ventures/tehdejsi-svet/drafts/cycle-2026-08-13-ts--2026-08-13-cs-1970s-vecernicek.json");
    // A different story in the same cycle is a different file, so a two-feature day keeps both.
    expect(draftPath("cycle-2026-08-13-ts", "2026-08-13-ua-1970s-kyiv-fares")).not.toBe(first);
  });
});
