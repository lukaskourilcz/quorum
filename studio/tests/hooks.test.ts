import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignHook,
  assignmentSeed,
  buildVectors,
  channelCooldownDays,
  checkVectors,
  eligibleFor,
  eligibleSetHash,
  HOOKS_ROOT,
  HookLoadError,
  hasErrors,
  lintLibrary,
  loadLibrary,
  parsePredicate,
  readLibrary,
  renderHookText,
  VECTORS_FILE,
  type Finding,
  type Hook,
  type QuizSubject,
  type RawHook
} from "../src/hooks/index.js";

const CATEGORY_LISTS = {
  core: ["internet", "git", "security", "databases", "testing"],
  commonUse: ["javascript", "typescript", "git", "css", "html", "react", "nodejs"],
  interview: ["dsa", "algorithms", "system-design", "databases", "javascript", "typescript"]
};

const SUBJECT: QuizSubject = {
  difficulty: 3,
  hasCode: false,
  category: "javascript",
  optionCount: 4,
  canonicalEnglishQuestion: "What does this return?"
};

async function shippedQuiz(): Promise<{ hooks: RawHook[]; research: unknown }> {
  const [hooks, research] = await Promise.all([
    readFile(path.join(HOOKS_ROOT, "quiz.hooks.json"), "utf8").then(JSON.parse),
    readFile(path.join(HOOKS_ROOT, "quiz.research.json"), "utf8").then(JSON.parse)
  ]);
  return { hooks, research };
}

/** A minimal well-formed hook the rule tests then break one field of at a time. */
function hook(overrides: Partial<RawHook> = {}): RawHook {
  return {
    id: "fixture-hook",
    cooldownDays: 10,
    truthRequires: ["always"],
    variants: { dev: { en: "A short dev line.", cs: "Krátká dev věta." }, geo: { en: "A short geo line.", cs: "Krátká geo věta." } },
    ...overrides
  };
}

function research(id: string, archetype = "explain-gap") {
  return {
    id,
    archetype,
    mechanism: "m",
    citation: "c",
    citationConfidence: "mechanism-only" as const,
    whyItEarnsTheSwipe: "w",
    prediction: "p",
    falsifiedIf: "f",
    cooldownRationale: "r",
    risk: "k",
    gateJustification: "g"
  };
}

/** Enough always-gated filler that the pool floor never fires in a test about another rule. */
function padded(hooks: RawHook[]): { hooks: RawHook[]; research: unknown[] } {
  const filler = Array.from({ length: 6 }, (_, index) => hook({ id: `filler-${index}` }));
  const all = [...hooks, ...filler];
  return { hooks: all, research: all.map((entry, index) => research(entry.id, `arch-${index}`)) };
}

function rules(findings: readonly Finding[]): string[] {
  return findings.filter((finding) => finding.level === "error").map((finding) => finding.rule);
}

describe("the shipped quiz library", () => {
  it("passes the lint with no errors", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    const findings = lintLibrary({ surface: "quiz", hooks, research: entries });
    expect(findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(hasErrors(findings)).toBe(false);
  });

  it("warns on exactly the three geo variants their gate makes unreachable", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    const findings = lintLibrary({ surface: "quiz", hooks, research: entries });
    expect(findings.map((finding) => `${finding.rule}:${finding.hookId}`)).toEqual([
      "unreachable-variant:spot-it",
      "unreachable-variant:half-in-the-snippet",
      "unreachable-variant:runtime-eyes"
    ]);
  });

  it("carries exactly the two intentional byte-identical pairs", async () => {
    const { hooks } = await shippedQuiz();
    const identical = hooks
      .filter((entry) => entry.variants.dev!.en === entry.variants.geo!.en && entry.variants.dev!.cs === entry.variants.geo!.cs)
      .map((entry) => entry.id);
    expect(identical).toEqual(["streak-cold", "streak-breaker"]);
  });

  it("loads news and mma as empty libraries rather than as failures", async () => {
    for (const surface of ["news", "mma"] as const) {
      const library = await readLibrary(surface);
      expect(library.hooks).toEqual([]);
    }
  });
});

describe("predicate parsing", () => {
  it("parses the :N and :X suffixes into typed fields", () => {
    expect(parsePredicate("quiz", "h", "difficultyAtLeast:3")).toEqual({ kind: "difficultyAtLeast", level: 3 });
    expect(parsePredicate("quiz", "h", "optionsAtLeast:4")).toEqual({ kind: "optionsAtLeast", count: 4 });
    expect(parsePredicate("quiz", "h", "categoryIn:core")).toEqual({ kind: "categoryIn", list: "core" });
    expect(parsePredicate("quiz", "h", "questionStartsWith:Why")).toEqual({ kind: "questionStartsWith", prefix: "Why" });
    expect(parsePredicate("quiz", "h", "always")).toEqual({ kind: "always" });
  });

  it("rejects a predicate outside the surface vocabulary, naming the hook and the surface", () => {
    // `articleAgeHours` is real — on the news surface. On quiz it is a mistake, and the message
    // has to say which surface it was read on or the fix is a guess.
    expect(() => parsePredicate("quiz", "know-why", "articleAgeHours:6")).toThrowError(HookLoadError);
    expect(() => parsePredicate("quiz", "know-why", "articleAgeHours:6"))
      .toThrowError(/quiz hook "know-why".*not in the quiz predicate vocabulary/su);
    expect(() => parsePredicate("news", "n", "articleAgeHours:6")).not.toThrow();
  });

  it("names a Tier B predicate as unbuilt rather than as unknown", () => {
    expect(() => parsePredicate("quiz", "rematch", "missedTopicBefore"))
      .toThrowError(/Tier B predicate and is not built yet/u);
  });

  it("rejects a malformed argument instead of coercing it", () => {
    expect(() => parsePredicate("quiz", "h", "difficultyAtLeast:three")).toThrowError(/whole number/u);
    expect(() => parsePredicate("quiz", "h", "difficultyAtLeast")).toThrowError(/needs a number argument/u);
    expect(() => parsePredicate("quiz", "h", "always:1")).toThrowError(/takes no argument/u);
  });
});

describe("each lint rule bites", () => {
  it("fails an EN line over 58 characters", () => {
    const input = padded([hook({ variants: { dev: { en: "x".repeat(59), cs: "Krátká." }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).toContain("char-budget-en");
  });

  it("fails a CS line over 66 characters", () => {
    const input = padded([hook({ variants: { dev: { en: "x".repeat(58), cs: "á".repeat(67) }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).toContain("char-budget-cs");
  });

  it("counts Czech diacritics as one character each", () => {
    // 66 accented code points is at the cap, not over it: a UTF-16 length would read 66 and a
    // byte length would read 132.
    const input = padded([hook({ variants: { dev: { en: "x".repeat(58), cs: "á".repeat(66) }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).not.toContain("char-budget-cs");
  });

  it("fails a CS line more than 1.25x its EN sibling", () => {
    const input = padded([hook({ variants: { dev: { en: "x".repeat(20), cs: "á".repeat(26) }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).toContain("char-budget-ratio");
  });

  it("fails a third byte-identical dev/geo pair", () => {
    const twin = (id: string) => hook({ id, variants: { dev: { en: "Same line.", cs: "Stejná věta." }, geo: { en: "Same line.", cs: "Stejná věta." } } });
    const two = padded([twin("a"), twin("b")]);
    expect(rules(lintLibrary({ surface: "quiz", ...two }))).not.toContain("identical-pair-budget");
    const three = padded([twin("a"), twin("b"), twin("c")]);
    expect(rules(lintLibrary({ surface: "quiz", ...three }))).toContain("identical-pair-budget");
  });

  it("fails a duplicate id", () => {
    const input = padded([hook({ id: "twice" }), hook({ id: "twice" })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).toContain("load");
  });

  it("fails a hook with no research entry, and research with no hook", () => {
    const orphanHook = lintLibrary({ surface: "quiz", hooks: [hook({ id: "lonely" })], research: [] });
    expect(orphanHook[0]!.detail).toMatch(/no entry in the research file/u);

    const orphanResearch = lintLibrary({ surface: "quiz", hooks: [], research: [research("ghost")] });
    expect(orphanResearch[0]!.detail).toMatch(/research entry but no hook/u);
  });

  it("fails a research entry missing a required field", () => {
    const { id, archetype } = research("partial");
    const findings = lintLibrary({ surface: "quiz", hooks: [hook({ id: "partial" })], research: [{ id, archetype }] });
    expect(hasErrors(findings)).toBe(true);
  });

  it("fails an archetype over 20% of its library", () => {
    // Ten of forty-nine is 20.4%. Nine is 18.4% and passes, so the boundary is the rule's own.
    const many = (count: number) => {
      const hooks = Array.from({ length: 49 }, (_, index) => hook({ id: `h-${index}` }));
      return {
        hooks,
        research: hooks.map((entry, index) => research(entry.id, index < count ? "crowded" : `arch-${index}`))
      };
    };
    expect(rules(lintLibrary({ surface: "quiz", ...many(9) }))).not.toContain("archetype-cap");
    expect(rules(lintLibrary({ surface: "quiz", ...many(10) }))).toContain("archetype-cap");
  });

  it("fails a predicate outside the surface vocabulary", () => {
    const input = padded([hook({ truthRequires: ["isTitleFight"] })]);
    expect(rules(lintLibrary({ surface: "quiz", ...input }))).toContain("load");
  });

  it("fails {topic} in a declension-hostile Czech slot and allows the safe ones", () => {
    const unsafe = padded([hook({ variants: { dev: { en: "Audit {topic} today.", cs: "Dnes koukni na {topic}." }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...unsafe }))).toContain("declension-slot");

    const afterColon = padded([hook({ variants: { dev: { en: "Quick audit: {topic}.", cs: "Rychlý audit: {topic}." }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...afterColon }))).not.toContain("declension-slot");

    const asSubject = padded([hook({ variants: { dev: { en: "{topic} is everywhere.", cs: "{topic} je všude." }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...asSubject }))).not.toContain("declension-slot");

    const newSentence = padded([hook({ variants: { dev: { en: "Look. {topic} again.", cs: "Podívej. {topic} zase." }, geo: { en: "ok", cs: "ok" } } })]);
    expect(rules(lintLibrary({ surface: "quiz", ...newSentence }))).not.toContain("declension-slot");
  });

  it("keeps the declension rule strict everywhere except the one allow-listed string", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    // everyday-blindspot's dev.cs is the exception. Renaming the hook must lose the exemption,
    // or the allow-list is a hole rather than a note.
    const renamed = hooks.map((entry) =>
      entry.id === "everyday-blindspot" ? { ...entry, id: "everyday-blindspot-copy" } : entry);
    const renamedResearch = (entries as Array<{ id: string }>).map((entry) =>
      entry.id === "everyday-blindspot" ? { ...entry, id: "everyday-blindspot-copy" } : entry);
    expect(rules(lintLibrary({ surface: "quiz", hooks: renamed, research: renamedResearch })))
      .toContain("declension-slot");
  });

  it("fails a gate served by fewer than five hooks", () => {
    const hooks = [
      ...Array.from({ length: 6 }, (_, index) => hook({ id: `always-${index}` })),
      hook({ id: "lonely-gate", truthRequires: ["categoryIn:obscure"] })
    ];
    const findings = lintLibrary({
      surface: "quiz",
      hooks,
      research: hooks.map((entry, index) => research(entry.id, `arch-${index}`))
    });
    // The always pool is six and clears the floor; the categoryIn gate is served by seven
    // (six always plus itself) — so this proves the pool reading, not a naive name count.
    expect(rules(findings)).not.toContain("pool-starvation");

    const thin = hooks.slice(0, 3);
    const thinFindings = lintLibrary({
      surface: "quiz",
      hooks: thin,
      research: thin.map((entry, index) => research(entry.id, `arch-${index}`))
    });
    expect(rules(thinFindings)).toContain("pool-starvation");
  });

  it("reads difficultyAtLeast:4 as served by its whole monotone pool", async () => {
    // Four hooks name difficultyAtLeast:4, which a name count would fail. A d4 question is
    // actually served by twenty-five of them, which is what the floor is about.
    const { hooks, research: entries } = await shippedQuiz();
    const library = loadLibrary({ surface: "quiz", hooks, research: entries });
    const named = library.hooks.filter((entry) => entry.rawRequires.includes("difficultyAtLeast:4"));
    expect(named).toHaveLength(4);
    const servable = eligibleFor(library, {
      subject: { ...SUBJECT, difficulty: 4, optionCount: 2, category: "unlisted" },
      categoryLists: CATEGORY_LISTS
    });
    expect(servable.ids.length).toBeGreaterThanOrEqual(5);
  });
});

describe("the evaluator", () => {
  it("treats truthRequires as a conjunction", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    const library = loadLibrary({ surface: "quiz", hooks, research: entries });
    // two-look-right needs four options and difficulty 2. Four options alone is not enough.
    const four = eligibleFor(library, { subject: { ...SUBJECT, difficulty: 1, optionCount: 4 }, categoryLists: CATEGORY_LISTS });
    expect(four.ids).not.toContain("two-look-right");
    const both = eligibleFor(library, { subject: { ...SUBJECT, difficulty: 2, optionCount: 4 }, categoryLists: CATEGORY_LISTS });
    expect(both.ids).toContain("two-look-right");
  });

  it("binds questionStartsWith to the canonical English text", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    const library = loadLibrary({ surface: "quiz", hooks, research: entries });
    const english = eligibleFor(library, { subject: { ...SUBJECT, canonicalEnglishQuestion: "Why is this immutable?" }, categoryLists: CATEGORY_LISTS });
    expect(english.ids).toContain("know-why");
    // The Czech of this question opens "Proč", but the gate reads the English and the English
    // opens "What". The eligible set has to be the same for both languages of one pack.
    const czechOnly = eligibleFor(library, { subject: { ...SUBJECT, canonicalEnglishQuestion: "What makes this immutable?" }, categoryLists: CATEGORY_LISTS });
    expect(czechOnly.ids).not.toContain("know-why");
  });

  it("reads optionsExactly as an equality, not a stricter at-least", async () => {
    const { hooks, research: entries } = await shippedQuiz();
    const library = loadLibrary({ surface: "quiz", hooks, research: entries });
    const at = (optionCount: number) =>
      eligibleFor(library, { subject: { ...SUBJECT, optionCount }, categoryLists: CATEGORY_LISTS }).ids;

    // The distinction the predicate exists for: "Four branches. One merges." is false on a
    // five-option question, and optionsAtLeast:4 would serve it there.
    expect(at(3)).not.toContain("four-doors");
    expect(at(4)).toContain("four-doors");
    expect(at(5)).not.toContain("four-doors");
    expect(at(5)).toContain("eliminate-three");
  });

  it("hashes an eligible set independently of its order", () => {
    expect(eligibleSetHash(["b", "a"])).toBe(eligibleSetHash(["a", "b"]));
    expect(eligibleSetHash(["a"])).not.toBe(eligibleSetHash(["a", "b"]));
  });

  it("refuses to evaluate a non-empty library on an unimplemented surface", () => {
    const library = loadLibrary({ surface: "mma", hooks: [hook({ truthRequires: ["isTitleFight"] })], research: [research("fixture-hook")] });
    expect(() => eligibleFor(library, { subject: SUBJECT, categoryLists: CATEGORY_LISTS }))
      .toThrowError(/not implemented/u);
  });
});

describe("conformance vectors", () => {
  it("the committed file matches what this repo's evaluator produces", async () => {
    const committed = JSON.parse(await readFile(path.join(HOOKS_ROOT, VECTORS_FILE), "utf8"));
    const { hooks, research: entries } = await shippedQuiz();
    const library = loadLibrary({ surface: "quiz", hooks, research: entries });
    expect(committed).toEqual(buildVectors(library, hooks));
  });

  it("every vector still holds against the evaluator", async () => {
    const committed = JSON.parse(await readFile(path.join(HOOKS_ROOT, VECTORS_FILE), "utf8"));
    expect(checkVectors(committed)).toEqual([]);
  });

  it("covers every quiz predicate and the boundary values", async () => {
    const committed = JSON.parse(await readFile(path.join(HOOKS_ROOT, VECTORS_FILE), "utf8"));
    const names: string[] = committed.vectors.map((vector: { name: string }) => vector.name);
    for (const required of [
      "always-only",
      "difficulty-below-gate", "difficulty-at-gate", "difficulty-above-gate",
      "options-below-gate", "options-at-gate", "options-above-gate",
      "options-exactly-below", "options-exactly-at", "options-exactly-above",
      "category-in-list", "has-code", "no-code",
      "starts-with-why", "czech-why-english-what"
    ]) {
      expect(names).toContain(required);
    }
    const difficulties = committed.vectors
      .filter((vector: { name: string }) => vector.name.startsWith("difficulty-"))
      .map((vector: { subject: QuizSubject }) => vector.subject.difficulty);
    expect(difficulties).toEqual([3, 4, 5]);
    // The at-least boundary, named exactly: `options-exactly-*` is a different predicate with
    // its own boundary below, and a prefix match would silently fold the two together.
    const atLeast = committed.vectors
      .filter((vector: { name: string }) => /^options-(below|at|above)-gate$/u.test(vector.name))
      .map((vector: { subject: QuizSubject }) => vector.subject.optionCount);
    expect(atLeast).toEqual([3, 4, 6]);

    const exactly = committed.vectors
      .filter((vector: { name: string }) => /^options-exactly-(below|at|above)$/u.test(vector.name))
      .map((vector: { subject: QuizSubject }) => vector.subject.optionCount);
    expect(exactly).toEqual([3, 4, 5]);
  });
});

describe("assignment", () => {
  const identity = { channel: "devshark-instagram", date: "2026-08-08", itemId: "q-1" };

  async function library() {
    const { hooks, research: entries } = await shippedQuiz();
    return loadLibrary({ surface: "quiz", hooks, research: entries });
  }

  it("doubles the shipped cooldown with a fourteen-day floor", () => {
    expect(channelCooldownDays({ cooldownDays: 6 })).toBe(14);
    expect(channelCooldownDays({ cooldownDays: 7 })).toBe(14);
    expect(channelCooldownDays({ cooldownDays: 8 })).toBe(16);
    expect(channelCooldownDays({ cooldownDays: 20 })).toBe(40);
  });

  it("is deterministic for one pack identity and varies across identities", async () => {
    const input = { library: await library(), context: { subject: SUBJECT, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev" as const, history: [] };
    const first = assignHook(input);
    const second = assignHook(input);
    expect(first).toEqual(second);

    const other = assignHook({ ...input, identity: { ...identity, itemId: "q-2" } });
    expect(assignmentSeed(identity)).not.toBe(assignmentSeed({ ...identity, itemId: "q-2" }));
    expect(other.outcome).toBe("assigned");
  });

  it("excludes a hook still inside its channel cooldown", async () => {
    const lib = await library();
    const base = { library: lib, context: { subject: SUBJECT, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev" as const };
    const clean = assignHook({ ...base, history: [] });
    expect(clean.outcome).toBe("assigned");
    const chosen = clean.outcome === "assigned" ? clean.assignment.hook : null;
    expect(chosen).not.toBeNull();

    const required = channelCooldownDays(chosen!);
    const recent = new Date(Date.parse(`${identity.date}T00:00:00Z`) - (required - 1) * 86_400_000).toISOString().slice(0, 10);
    const cooled = assignHook({ ...base, history: [{ date: recent, hookId: chosen!.id, archetype: "none-of-them" }] });
    expect(cooled.outcome).toBe("assigned");
    if (cooled.outcome !== "assigned") return;
    expect(cooled.assignment.available).not.toContain(chosen!.id);
    expect(cooled.assignment.cooldownSnapshot.map((entry) => entry.hookId)).toContain(chosen!.id);
    // The eligible set is a truth statement about the question and does not move when a hook
    // is merely cooling — the override bound must not shrink because of a scheduling fact.
    expect(cooled.assignment.eligible.ids).toContain(chosen!.id);
  });

  it("readmits a hook the day its channel cooldown expires", async () => {
    const lib = await library();
    const base = { library: lib, context: { subject: SUBJECT, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev" as const };
    const chosen = (assignHook({ ...base, history: [] }) as { assignment: { hook: Hook } }).assignment.hook;
    const required = channelCooldownDays(chosen);
    const expired = new Date(Date.parse(`${identity.date}T00:00:00Z`) - required * 86_400_000).toISOString().slice(0, 10);
    const result = assignHook({ ...base, history: [{ date: expired, hookId: chosen.id, archetype: "none-of-them" }] });
    if (result.outcome !== "assigned") throw new Error("expected an assignment");
    expect(result.assignment.available).toContain(chosen.id);
  });

  it("never repeats the previous post's archetype", async () => {
    const lib = await library();
    const base = { library: lib, context: { subject: SUBJECT, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev" as const };
    const first = assignHook({ ...base, history: [] });
    if (first.outcome !== "assigned") throw new Error("expected an assignment");
    const archetype = first.assignment.hook.research.archetype;

    const next = assignHook({ ...base, history: [{ date: "2026-08-07", hookId: "unrelated", archetype }] });
    if (next.outcome !== "assigned") throw new Error("expected an assignment");
    expect(next.assignment.hook.research.archetype).not.toBe(archetype);
    for (const id of next.assignment.available) {
      expect(lib.hooks.find((entry) => entry.id === id)!.research.archetype).not.toBe(archetype);
    }
  });

  it("falls back to no-hook on an empty library rather than throwing", async () => {
    const empty = loadLibrary({ surface: "news", hooks: [], research: [] });
    const result = assignHook({ library: empty, context: { subject: SUBJECT, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev", history: [] });
    expect(result.outcome).toBe("no-hook");
    if (result.outcome !== "no-hook") return;
    expect(result.reason).toBe("empty-library");
  });

  it("falls back to no-hook when nothing is eligible", async () => {
    const lib = loadLibrary({
      surface: "quiz",
      hooks: [hook({ id: "code-only", truthRequires: ["hasCode"] })],
      research: [research("code-only")]
    });
    const result = assignHook({ library: lib, context: { subject: { ...SUBJECT, hasCode: false }, categoryLists: CATEGORY_LISTS }, identity, vertical: "dev", history: [] });
    expect(result.outcome).toBe("no-hook");
    if (result.outcome !== "no-hook") return;
    expect(result.reason).toBe("empty-eligible-set");
  });

  it("fills {topic} and refuses to render an unfilled token", async () => {
    const lib = await library();
    const audit = lib.hooks.find((entry) => entry.id === "topic-audit")!;
    expect(renderHookText({ hook: audit, vertical: "dev", language: "cs", topic: "JavaScript" }))
      .toBe("Rychlý audit: JavaScript.");

    const broken = loadLibrary({
      surface: "quiz",
      hooks: [hook({ id: "leaky", variants: { dev: { en: "Day {streak} of this.", cs: "Den {streak}." }, geo: { en: "ok", cs: "ok" } } })],
      research: [research("leaky")]
    });
    expect(() => renderHookText({ hook: broken.hooks[0]!, vertical: "dev", language: "en", topic: "x" }))
      .toThrowError(/still contains \{streak\}/u);
  });
});
