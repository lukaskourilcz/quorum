import { describe, expect, it } from "vitest";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import { TsStoryBriefSchema } from "../src/contracts/ts-story-brief.js";
import {
  briefPacket,
  generateTsStoryBriefs,
  parseLetopisBriefs,
  type LetopisBriefOutput
} from "../src/ventures/tehdejsi-svet/briefs.js";
import { buildShortlist } from "../src/ventures/tehdejsi-svet/scorer.js";
import type { guardedJsonCall } from "../src/llm/call.js";

const HASH = "a".repeat(64);
const GENERATED_AT = new Date("2026-08-13T18:00:00.000Z");

function fact(overrides: Partial<TehdejsiFact> & { id: string }): TehdejsiFact {
  return {
    kind: "everyday",
    country: "cz",
    place: null,
    yearFrom: 1975,
    yearTo: 1975,
    sensitivityTier: 0,
    shareSafe: true,
    text: "A synthetic fact long enough to satisfy the contract's minimum length rule.",
    sources: [{ title: "Synthetic source", url: null, note: null }],
    verified: null,
    ...overrides
  } as TehdejsiFact;
}

const CALL_CONFIG = {
  stateRoot: "/tmp/unused",
  cycleId: "cycle-2026-08-13-ts",
  phase: "ts-desk",
  ventureId: "tehdejsi-svet",
  agent: "LETOPIS",
  provider: "anthropic" as const,
  model: "claude-test",
  system: "test",
  maxOutputTokens: 2_000,
  budgetContext: { phase: "ts-desk" } as never
};

function stubCall(output: LetopisBriefOutput, usd = 0.06): typeof guardedJsonCall {
  return (async (request: { input: string; parse: (text: string) => unknown }) => ({
    value: request.parse(JSON.stringify(output)),
    cached: false,
    usd,
    lastPacket: request.input
  })) as unknown as typeof guardedJsonCall;
}

function letopisBrief(overrides: Partial<LetopisBriefOutput["briefs"][number]> = {}) {
  return {
    factId: "cs-1970s-vecernicek",
    angle: "A few minutes before bed that every household set its clock by, and what came after.",
    slideBeats: [
      { beat: "Open on the minutes before bed and the tune that ended the day.", claimIds: ["ran-from-1965"] },
      { beat: "Place it in the evening: what the household was doing while it ran.", claimIds: [] },
      { beat: "Ask who put it on and what was for supper.", claimIds: [] }
    ],
    claims: [{
      claimId: "ran-from-1965",
      statement: "The programme ran from 1965 and its slot fixed the household evening.",
      factIds: ["cs-1970s-vecernicek"]
    }],
    ctaKind: "ask-your-parents" as const,
    ...overrides
  };
}

const FACTS = [
  fact({ id: "cs-1970s-vecernicek", kind: "media", yearFrom: 1965, yearTo: 1995 }),
  fact({ id: "ua-1970s-kyiv-fares", country: "ua", kind: "price", yearFrom: 1970, yearTo: 1985 })
];

async function generate(output: LetopisBriefOutput, facts: readonly TehdejsiFact[] = FACTS) {
  const shortlist = buildShortlist({ facts, factsHash: HASH, date: "2026-08-13" });
  return generateTsStoryBriefs({
    cycleId: "cycle-2026-08-13-ts",
    date: "2026-08-13",
    shortlist,
    facts,
    factsHash: HASH,
    shortlistRef: "state/ventures/tehdejsi-svet/shortlists/2026-08-13.json",
    generatedAt: GENERATED_AT,
    callConfig: CALL_CONFIG as never,
    call: stubCall(output)
  });
}

describe("Tehdejsi svet Day A briefs", () => {
  it("turns one call into a canonical brief the contract accepts", async () => {
    const result = await generate({ briefs: [letopisBrief()] });
    expect(result.briefs).toHaveLength(1);
    expect(result.usd).toBe(0.06);
    const brief = result.briefs[0]!;
    expect(TsStoryBriefSchema.safeParse(brief).success).toBe(true);
    expect(brief.briefId).toBe("2026-08-13-cs-1970s-vecernicek");
    expect(brief.factsHash).toBe(HASH);
    expect(brief.shortlistRef).toBe("state/ventures/tehdejsi-svet/shortlists/2026-08-13.json");
    expect(brief.slideBeats.map((beat) => beat.ordinal)).toEqual([1, 2, 3]);
  });

  it("shows the model only what it is allowed to write about", () => {
    const facts = [...FACTS, fact({
      id: "ua-chornobyl",
      country: "ua",
      sensitivityTier: 2,
      sources: [{ title: "One", url: null, note: null }, { title: "Two", url: null, note: null }]
    })];
    const shortlist = buildShortlist({ facts, factsHash: HASH, date: "2026-08-13" });
    const packet = briefPacket({
      date: "2026-08-13",
      shortlist,
      facts,
      selectableIds: ["cs-1970s-vecernicek"],
      dossierRefs: []
    });
    // A vetoed fact in the prompt is a fact a model can argue for, and the veto is not a
    // suggestion.
    expect(packet).not.toContain("ua-chornobyl");
    expect(packet).toContain("cs-1970s-vecernicek");
  });

  it("spends nothing on a day with nothing selectable", async () => {
    const vetoed = [fact({
      id: "only-tier-two",
      sensitivityTier: 2,
      sources: [{ title: "One", url: null, note: null }, { title: "Two", url: null, note: null }]
    })];
    const shortlist = buildShortlist({ facts: vetoed, factsHash: HASH, date: "2026-08-13" });
    let called = false;
    const result = await generateTsStoryBriefs({
      cycleId: "cycle-2026-08-13-ts",
      date: "2026-08-13",
      shortlist,
      facts: vetoed,
      factsHash: HASH,
      shortlistRef: "state/ventures/tehdejsi-svet/shortlists/2026-08-13.json",
      generatedAt: GENERATED_AT,
      callConfig: CALL_CONFIG as never,
      call: (async () => { called = true; throw new Error("unreachable"); }) as never
    });
    expect(result).toEqual({ briefs: [], rejectedFactIds: [], usd: 0 });
    expect(called).toBe(false);
  });

  it("refuses a fact the model was never shown", async () => {
    const result = await generate({ briefs: [letopisBrief({
      factId: "invented-by-the-model",
      claims: [{ claimId: "c1", statement: "A claim about a fact that was never on the list.", factIds: ["invented-by-the-model"] }]
    })] });
    expect(result.briefs).toEqual([]);
    expect(result.rejectedFactIds).toEqual(["invented-by-the-model"]);
  });

  it("drops a claim citing a fact this brief did not select, and the brief with it", async () => {
    const result = await generate({ briefs: [letopisBrief({
      claims: [{
        claimId: "borrowed",
        statement: "A claim resting on the other candidate rather than on this one.",
        factIds: ["ua-1970s-kyiv-fares"]
      }]
    })] });
    expect(result.briefs).toEqual([]);
    expect(result.rejectedFactIds).toEqual(["cs-1970s-vecernicek"]);
  });

  it("lets the tier decide the CTA rather than the model", async () => {
    const tierOne = [fact({ id: "cs-1989-november", sensitivityTier: 1, yearFrom: 1989, yearTo: 1989 })];
    const result = await generate({ briefs: [letopisBrief({
      factId: "cs-1989-november",
      ctaKind: "tag-a-friend",
      claims: [{ claimId: "c1", statement: "A claim resting on the November fact itself.", factIds: ["cs-1989-november"] }],
      slideBeats: [
        { beat: "Open on the everyday detail rather than on the square.", claimIds: ["c1"] },
        { beat: "Say plainly what the system around it was.", claimIds: [] }
      ]
    })] }, tierOne);
    const brief = result.briefs[0]!;
    // Tier 1 permits participation, and owes its context line.
    expect(brief.ctaKind).toBe("tag-a-friend");
    expect(brief.contextLineRequired).toBe(true);

    const tierTwo = [fact({
      id: "ua-1986-chornobyl",
      country: "ua",
      yearFrom: 1986,
      yearTo: 1986,
      sensitivityTier: 2,
      sources: [{ title: "One", url: null, note: null }, { title: "Two", url: null, note: null }]
    })];
    const shortlist = buildShortlist({ facts: tierTwo, factsHash: HASH, date: "2026-08-13" });
    // Tier 2 never reaches a call at all: the shortlist vetoes it before the packet is built.
    expect(shortlist.entries[0]?.veto).toBe("tier-2-review-required");
  });

  it("slugs a model's claim id, because it becomes an identifier in the record", async () => {
    const result = await generate({ briefs: [letopisBrief({
      slideBeats: [
        { beat: "Open on the minutes before bed and the tune that ended the day.", claimIds: ["Ran From 1965!"] },
        { beat: "Ask who put it on and what was for supper.", claimIds: [] }
      ],
      claims: [{
        claimId: "Ran From 1965!",
        statement: "The programme ran from 1965 and its slot fixed the household evening.",
        factIds: ["cs-1970s-vecernicek"]
      }]
    })] });
    const brief = result.briefs[0]!;
    expect(brief.claims[0]!.claimId).toBe("ran-from-1965");
    expect(brief.slideBeats[0]!.claimIds).toEqual(["ran-from-1965"]);
  });

  it("takes at most two features however many the model returns", async () => {
    const result = await generate({ briefs: [
      letopisBrief(),
      letopisBrief({
        factId: "ua-1970s-kyiv-fares",
        claims: [{ claimId: "fares", statement: "A five-kopeck fare held for two decades.", factIds: ["ua-1970s-kyiv-fares"] }],
        slideBeats: [
          { beat: "Open on the coin itself and what it bought.", claimIds: ["fares"] },
          { beat: "Ask what else cost the same.", claimIds: [] }
        ]
      })
    ] });
    expect(result.briefs).toHaveLength(2);
    expect(result.briefs.map((brief) => brief.factIds[0]))
      .toEqual(["cs-1970s-vecernicek", "ua-1970s-kyiv-fares"]);
  });
});

describe("canonical brief neutrality", () => {
  it("refuses a brief drafted in Ukrainian, which would make the second pass a translation", () => {
    expect(() => parseLetopisBriefs(JSON.stringify({ briefs: [letopisBrief()] }))).not.toThrow();
    const cyrillic = TsStoryBriefSchema.safeParse({
      schemaVersion: "ts-story-brief/1",
      briefId: "2026-08-13-x",
      cycleId: "c",
      date: "2026-08-13",
      factsHash: HASH,
      factIds: ["x"],
      shortlistRef: "state/ventures/tehdejsi-svet/shortlists/2026-08-13.json",
      dossierRefs: [],
      sensitivityTier: 0,
      tierRaisedBy: [],
      angle: "Кілька хвилин перед сном, за якими родина звіряла час щовечора.",
      slideBeats: [
        { ordinal: 1, beat: "Open on the minutes before bed.", claimIds: [] },
        { ordinal: 2, beat: "Ask who put it on for them.", claimIds: [] }
      ],
      claims: [{ claimId: "c1", statement: "A claim in the working language.", factIds: ["x"], dossierRefs: [], singleSourceFraming: true }],
      ctaKind: "none",
      contextLineRequired: false,
      generatedAt: GENERATED_AT.toISOString()
    });
    expect(cyrillic.success).toBe(false);
  });

  it("keeps a Czech proper noun, because a neutral brief about Vecernicek must be able to name it", () => {
    const parsed = TsStoryBriefSchema.safeParse({
      schemaVersion: "ts-story-brief/1",
      briefId: "2026-08-13-x",
      cycleId: "c",
      date: "2026-08-13",
      factsHash: HASH,
      factIds: ["x"],
      shortlistRef: "state/ventures/tehdejsi-svet/shortlists/2026-08-13.json",
      dossierRefs: [],
      sensitivityTier: 0,
      tierRaisedBy: [],
      angle: "Večerníček ran before bed; open on the tune rather than on the programme itself.",
      slideBeats: [
        { ordinal: 1, beat: "Open on the minutes before bed.", claimIds: [] },
        { ordinal: 2, beat: "Ask who put it on for them.", claimIds: [] }
      ],
      claims: [{ claimId: "c1", statement: "A claim in the working language.", factIds: ["x"], dossierRefs: [], singleSourceFraming: true }],
      ctaKind: "none",
      contextLineRequired: false,
      generatedAt: GENERATED_AT.toISOString()
    });
    expect(parsed.success).toBe(true);
  });
});
