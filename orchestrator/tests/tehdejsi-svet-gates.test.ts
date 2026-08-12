import { describe, expect, it } from "vitest";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import {
  assessFact,
  classifyTier,
  packageIssues,
  tierEffects,
  tierGatePasses
} from "../src/ventures/tehdejsi-svet/gates.js";
import { loadTehdejsiFacts } from "../src/ventures/tehdejsi-svet/facts.js";
import { buildShortlist, selectableFactIds } from "../src/ventures/tehdejsi-svet/scorer.js";

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

function rules(issues: ReadonlyArray<{ rule: string }>): string[] {
  return issues.map((issue) => issue.rule).sort();
}

describe("Tehdejsi svet tier classifier", () => {
  it("treats the declared tier as a floor and never as a ceiling", () => {
    // The file says everyday. The subject says otherwise, and the subject wins.
    const raised = classifyTier(fact({
      id: "mis-typed",
      text: "Prazske jaro skoncilo v srpnu, kdyz prisla sovetska okupace do ulic.",
      yearFrom: 1968,
      yearTo: 1968
    }));
    expect(raised).toMatchObject({ tier: 2, declared: 0, raisedBy: ["occupation-1968"] });

    // Nothing lowers a declaration: a tier-1 fact with no topic hit stays tier 1.
    expect(classifyTier(fact({ id: "plain", sensitivityTier: 1 })))
      .toEqual({ tier: 1, declared: 1, raisedBy: [] });
  });

  it("reads years as well as wording, because a fact need not name its own period", () => {
    expect(classifyTier(fact({ id: "quiet-1986", yearFrom: 1986, yearTo: 1986 })).tier).toBe(2);
    expect(classifyTier(fact({ id: "wartime", yearFrom: 1938, yearTo: 1946 })).raisedBy)
      .toEqual(["second-world-war"]);
  });

  it("does not raise a fact whose span merely brushes a topic year", () => {
    // Waiting lists for cars between 1960 and 1989 are not a fact about the invasion, or every
    // fact about the whole era would be tier 2 and the tier would mean nothing.
    const spanning = classifyTier(fact({ id: "long-span", sensitivityTier: 1, yearFrom: 1960, yearTo: 1989 }));
    expect(spanning).toEqual({ tier: 1, declared: 1, raisedBy: [] });
  });

  it("catches each of the seven blocking subjects", () => {
    const cases: ReadonlyArray<[string, Partial<TehdejsiFact>]> = [
      ["occupation-1968", { text: "V srpnu prisla srpnova okupace a s ni cizi vojaci do mesta." }],
      ["second-world-war", { text: "Lidice byly srovnany se zemi a jmeno obce melo zmizet z map." }],
      ["holodomor", { text: "Holodomor zabil miliony lidi na ukrajinskem venkove v tech letech." }],
      ["deportations", { text: "Nucene vystehovani rodin probihalo v noci a bez jakehokoli vysvetleni." }],
      ["chornobyl", { text: "Chornobyl zmenil zivot cele oblasti behem jedineho jarniho tydne." }],
      ["collaboration", { text: "Statni bezpecnost vedla slozky a udavac byval nekdy soused z patra." }],
      ["current-war", { text: "Ruska invaze zmenila mesto tak, ze uz nikdy nebude jako predtim." }]
    ];
    for (const [topic, overrides] of cases) {
      const classified = classifyTier(fact({ id: topic, yearFrom: 1975, yearTo: 1975, ...overrides }));
      expect(classified.tier, topic).toBe(2);
      expect(classified.raisedBy, topic).toContain(topic);
    }
  });

  it("catches the same subjects written in Ukrainian", () => {
    // `\w` never matches Cyrillic, so a pattern using it passes every Ukrainian phrase in it
    // while looking exactly like a pattern that checked them. These are the cases that prove
    // the Cyrillic alternatives fire at all.
    const cases: ReadonlyArray<[string, string]> = [
      ["occupation-1968", "Празька весна закінчилася, і в місто зайшли чужі солдати того літа."],
      ["second-world-war", "Друга світова війна змінила місто назавжди, і це відчувалося десятиліттями."],
      ["holodomor", "Голодомор забрав мільйони життів в українських селах у ті роки."],
      ["deportations", "Примусове переселення родин відбувалося вночі й без жодних пояснень."],
      ["chornobyl", "Чорнобиль змінив життя цілої області за один весняний тиждень."],
      ["collaboration", "Стукач міг виявитися сусідом з поверху, і про це знали всі."],
      ["current-war", "Російське вторгнення змінило місто так, що воно вже ніколи не буде колишнім."]
    ];
    for (const [topic, text] of cases) {
      const classified = classifyTier(fact({ id: topic, country: "ua", text, yearFrom: 1975, yearTo: 1975 }));
      expect(classified.raisedBy, topic).toContain(topic);
    }
  });

  it("catches an excluded category written in Ukrainian", () => {
    expect(rules(assessFact(fact({
      id: "ua-atrocity",
      country: "ua",
      text: "Масове поховання знайшли значно пізніше, коли вже ніхто не чекав відповідей."
    })).issues)).toContain("excluded:atrocity-imagery");
    expect(rules(assessFact(fact({
      id: "ua-leader",
      country: "ua",
      text: "Хрущов виступав по телебаченню, і промову дивилася вся країна того вечора."
    })).issues)).toContain("excluded:leader-subject");
  });
});

describe("Tehdejsi svet tier effects", () => {
  it("makes tier 2 blocking, unlight and two-sourced", () => {
    expect(tierEffects(2)).toEqual({
      humanReview: true,
      participationCtaAllowed: false,
      lightFormatAllowed: false,
      minimumSourcesPerClaim: 2,
      contextLineRequired: false
    });
  });

  it("asks tier 1 for its one honest context line and asks tier 0 for nothing", () => {
    expect(tierEffects(1).contextLineRequired).toBe(true);
    expect(tierEffects(1).humanReview).toBe(false);
    expect(tierEffects(0)).toMatchObject({ contextLineRequired: false, minimumSourcesPerClaim: 1 });
  });

  it("refuses a participation CTA and a light format on a tier-2 package", () => {
    const issues = packageIssues(
      { ctaKind: "tag-a-friend", format: "quiz", sourcesPerClaim: [2, 2] },
      tierEffects(2)
    );
    expect(rules(issues)).toEqual(["tier2:light-format", "tier2:participation-cta"]);
    expect(tierGatePasses(issues)).toBe(false);
  });

  it("names the claim that is undersourced rather than failing the package anonymously", () => {
    const issues = packageIssues(
      { ctaKind: "none", format: "feature", sourcesPerClaim: [2, 1, 2] },
      tierEffects(2)
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.detail).toContain("Claim 2");
  });

  it("fails a tier-1 package that skipped its context line", () => {
    const shape = { ctaKind: "ask-your-parents", format: "feature", sourcesPerClaim: [1] };
    expect(rules(packageIssues(shape, tierEffects(1)))).toEqual(["tier1:missing-context-line"]);
    expect(tierGatePasses(packageIssues({ ...shape, hasContextLine: true }, tierEffects(1)))).toBe(true);
  });

  it("lets a tier-2 draft exist, because human review is a gate on leaving and not on writing", () => {
    const clean = packageIssues(
      { ctaKind: "none", format: "feature", sourcesPerClaim: [2] },
      tierEffects(2)
    );
    expect(tierGatePasses(clean)).toBe(true);
    expect(tierEffects(2).humanReview).toBe(true);
  });
});

describe("Tehdejsi svet excluded categories", () => {
  it("refuses a leader as a post subject however the fact is tiered", () => {
    const assessment = assessFact(fact({
      id: "leader",
      text: "Gustav Husak mluvil v televizi a jeho projev sledovala cela zeme."
    }));
    expect(assessment.draftable).toBe(false);
    expect(rules(assessment.issues)).toContain("excluded:leader-subject");
  });

  it("refuses atrocity description and who-suffered-more framing", () => {
    expect(rules(assessFact(fact({
      id: "atrocity",
      text: "Masovy hrob byl nalezen az mnohem pozdeji, kdyz uz nikdo necekal odpovedi."
    })).issues)).toContain("excluded:atrocity-imagery");
    expect(rules(assessFact(fact({
      id: "comparison",
      text: "Kdo trpel hure, ptaji se lide dodnes, jako by na to sla najit odpoved."
    })).issues)).toContain("excluded:suffering-comparison");
  });

  it("closes the single-source path that raising a tier would otherwise open", () => {
    // The contract refuses a *declared* tier-2 fact with one source. A fact the classifier raised
    // never went through that check, so the gate makes it here instead.
    const assessment = assessFact(fact({
      id: "raised-single-source",
      text: "Holodomor zabil miliony lidi na ukrajinskem venkove v tech letech."
    }));
    expect(assessment.classification.tier).toBe(2);
    expect(rules(assessment.issues)).toEqual(["tier:insufficient-sources"]);
    expect(assessment.draftable).toBe(false);
  });

  it("passes an ordinary everyday fact with nothing to say about it", () => {
    const assessment = assessFact(fact({ id: "ordinary" }));
    expect(assessment).toMatchObject({ draftable: true, issues: [] });
    expect(assessment.effects.humanReview).toBe(false);
  });
});

describe("Tehdejsi svet gates and the committed facts", () => {
  it("declines a mis-declared fact at selection, not only at review", async () => {
    const committed = await loadTehdejsiFacts();
    const shortlist = buildShortlist({
      facts: [
        ...committed.facts,
        fact({ id: "zz-mis-typed", text: "Chornobyl zmenil zivot cele oblasti behem jednoho tydne." })
      ],
      factsHash: committed.contentHash,
      date: "2026-08-12"
    });
    expect(shortlist.entries.find((entry) => entry.factId === "zz-mis-typed")?.veto)
      .toBe("tier-2-review-required");
    expect(selectableFactIds(shortlist, 10)).not.toContain("zz-mis-typed");
  });

  it("finds every committed fact draftable, so the seeded file is usable as it stands", async () => {
    const committed = await loadTehdejsiFacts();
    for (const entry of committed.facts) {
      const assessment = assessFact(entry);
      // Chornobyl is the one that needs the owner. Everything else may be drafted unattended.
      expect(assessment.draftable, entry.id).toBe(true);
      expect(assessment.effects.humanReview, entry.id).toBe(entry.id === "ua-1986-chornobyl-spring");
    }
  });
});
