import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import { GoViralTrendsSchema } from "../src/sources/goviral-trends.js";
import { atomicWriteJson } from "../src/state.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { craftRulesFor, readCraftRules } from "../src/ventures/marketingshark/packet.js";
import { POST_KINDS, type PostKind } from "../src/ventures/marketingshark/kinds.js";
import { AnyMarketingSharkPackage, isPostPackage, MarketingSharkPackage, PostPackageSchema, type PostWriterOutput } from "../src/ventures/marketingshark/package.js";
import { runPostGates } from "../src/ventures/marketingshark/post-gates.js";
import { buildPostPacket } from "../src/ventures/marketingshark/post-packet.js";
import { planDay, type DayPlan, type PostDayPlan } from "../src/ventures/marketingshark/post-plan.js";
import { fixturePostOutput, runPostDay } from "../src/ventures/marketingshark/post-run.js";
import { buildMeetingRecord, runMarketingSharkCycle } from "../src/ventures/marketingshark/room.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, readLedger, runBrandDay } from "../src/ventures/marketingshark/run.js";

// quorum#576 (B9): the weekday rotation. Monday and Thursday the quiz, Tuesday a feature spotlight,
// Wednesday a challenge teaser, Friday the week's note, no room at the weekend.

const WEEK = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"] as const;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function devshark(): Promise<Brand> {
  return enabledBrands(await loadMarketingSharkConfig())[0]!;
}

/** A repository root that holds the fixture challenge snapshot where the config looks for it. */
async function repoWithChallenges(): Promise<string> {
  const root = await tempDir("ms-kinds-repo-");
  await mkdir(path.join(root, "state/marketingshark/challenge-banks"), { recursive: true });
  await copyFile(path.join(repoRoot, "contracts/fixtures/marketingshark-challenges.valid.json"), path.join(root, "state/marketingshark/challenge-banks/devshark.json"));
  return root;
}

interface Rooms {
  state: string;
  facts: string;
  repo: string;
}

async function rooms(options: { challenges?: boolean } = {}): Promise<Rooms> {
  return {
    state: await tempDir("ms-kinds-state-"),
    facts: await tempDir("ms-kinds-facts-"),
    repo: options.challenges === false ? await tempDir("ms-kinds-empty-repo-") : await repoWithChallenges()
  };
}

async function plan(brand: Brand, date: string, where: Rooms): Promise<DayPlan> {
  return planDay({ brand, date, stateRoot: where.state, factStateRoot: where.facts, repoRoot: where.repo, configRoot });
}

/** One morning with the fixture writer: the quiz through its room, every other kind through its own. */
async function draft(brand: Brand, date: string, where: Rooms, output?: (day: PostDayPlan) => PostWriterOutput) {
  const day = await plan(brand, date, where);
  const config = await loadMarketingSharkConfig();
  const publicRoot = path.join(where.state, "public");
  if (day.kind === "none" || day.kind === "invalid") return { day, outcome: null };
  if (day.kind === "quiz") {
    const ledger = await readLedger(where.state);
    const result = await runBrandDay({
      config, brand, ledger, date, cycleId: "test", root: where.state, publicRoot, dry: true, rotation: day.fallback,
      call: async () => {
        const quiz = await planBrandDay({ config, brand, ledger, date, stateRoot: where.state });
        return { usd: 0, output: fixtureChumOutput({ brand, question: quiz.question, ...fixtureHookLines(quiz, brand) }) };
      }
    });
    return { day, outcome: result.outcome };
  }
  let calls = 0;
  const result = await runPostDay({
    brand, date, root: where.state, publicRoot, plan: day,
    call: async () => {
      calls += 1;
      return { usd: 0, output: output ? output(day) : fixturePostOutput(day, brand) };
    }
  });
  return { day, outcome: result.outcome, calls };
}

async function packageOn(where: Rooms, date: string): Promise<AnyMarketingSharkPackage> {
  return AnyMarketingSharkPackage.parse(JSON.parse(await readFile(path.join(where.state, `ventures/marketingshark/packages/${date}/devshark/package.json`), "utf8")));
}

function trendSnapshot(date: string, tags: Array<[string, number, number | null]>) {
  return GoViralTrendsSchema.parse({
    schemaVersion: "goviral-trends/1", date, generatedAt: `${date}T09:00:00.000Z`, sourceResults: [], freeSignals: [], items: [],
    signals: {
      topHashtags: tags.map(([hashtag, engagementPerHour, weekOverWeekDelta]) => ({ hashtag, topicSet: "devshark", posts: 3, engagementPerHour, weekOverWeekDelta })),
      topFormats: [], topAudio: [], exploreSections: [], perTopicSet: []
    },
    forMagazines: { ai: [], mma: [] }
  });
}

describe("the weekday rotation", () => {
  it("plans the kind each weekday names, and no room at the weekend", async () => {
    const brand = await devshark();
    const where = await rooms();
    const kinds: string[] = [];
    for (const date of WEEK) {
      const { day, outcome } = await draft(brand, date, where);
      kinds.push(day.kind);
      if (outcome) expect(outcome.status, date).toBe("drafted");
    }
    expect(kinds).toEqual(["quiz", "feature-spotlight", "challenge-teaser", "quiz", "this-week", "none", "none"]);
    const saturday = await plan(brand, "2026-10-03", where);
    expect(saturday).toMatchObject({ kind: "none", reason: expect.stringContaining("Saturday has no marketingShark room") });
    // Five packages, one a weekday, each the kind its day names; nothing for the weekend.
    expect((await readdir(path.join(where.state, "ventures/marketingshark/packages"))).sort()).toEqual(WEEK.slice(0, 5));
    const written = await Promise.all(WEEK.slice(0, 5).map((date) => packageOn(where, date)));
    expect(written.map((built) => (isPostPackage(built) ? built.kind : "quiz"))).toEqual(["quiz", "feature-spotlight", "challenge-teaser", "quiz", "this-week"]);
  });

  it("gives each kind three queue drafts that cite its subject, and a frame per slide that matches its hash", async () => {
    const brand = await devshark();
    const where = await rooms();
    for (const date of WEEK.slice(0, 5)) await draft(brand, date, where);
    const subjects = new Map<string, string>();
    for (const date of WEEK.slice(0, 5)) {
      const built = await packageOn(where, date);
      const items = await Promise.all(["linkedin", "instagram", "threads"].map(async (channel) =>
        JSON.parse(await readFile(path.join(where.state, `social/queue/${date}-devshark-en-${channel}.json`), "utf8")) as { status: string; content: { factualClaimRefs: string[]; assetPaths: string[] }; checks: Record<string, string> }));
      for (const item of items) {
        expect(item.status).toBe("draft");
        expect(Object.values(item.checks).every((state) => state === "pending")).toBe(true);
      }
      subjects.set(date, items[0]!.content.factualClaimRefs[0]!);
      expect(items[1]!.content.assetPaths.every((asset) => asset.endsWith(".jpg"))).toBe(true);
      for (const frame of built.render.frames) {
        const bytes = await readFile(path.join(where.state, "public", frame.png.path));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(frame.png.sha256);
      }
    }
    expect(subjects.get("2026-09-29")).toMatch(/^marketingshark:feature:/u);
    expect(subjects.get("2026-09-30")).toMatch(/^marketingshark:challenge:/u);
    expect(subjects.get("2026-10-02")).toBe("marketingshark:week:2026-09-28");
    expect(subjects.get("2026-10-01")).toMatch(/^marketingshark:question:/u);
  });

  it("falls back to the quiz, and says why, when a kind has no source", async () => {
    const brand = await devshark();
    const bare = await rooms({ challenges: false });
    // No challenge snapshot: devShark's labels come first.
    const wednesday = await plan(brand, "2026-09-30", bare);
    expect(wednesday).toMatchObject({ kind: "quiz", fallback: { scheduled: "challenge-teaser", reason: expect.stringContaining("(its step D5)") } });
    // No package earlier in the week: nothing to recap.
    const friday = await plan(brand, "2026-10-02", bare);
    expect(friday).toMatchObject({ kind: "quiz", fallback: { scheduled: "this-week", reason: expect.stringContaining("no week to recap") } });
    // A fact sheet that names none of the screens leaves the spotlight nothing to show.
    const sparse = { ...brand, factSheets: brand.factSheets!.map((sheet) => ({ ...sheet, whatVisitorsCanDo: "Learn web development in the browser.", allowedClaims: ["devShark is a web-development learning platform."] })) };
    expect(await plan(sparse, "2026-09-29", bare)).toMatchObject({ kind: "quiz", fallback: { scheduled: "feature-spotlight" } });
    // The quiz drafted in the fallback's place records the kind it stood in for.
    const { outcome } = await draft(brand, "2026-09-30", bare);
    expect(outcome).toMatchObject({ status: "drafted", kind: "quiz", fallback: { scheduled: "challenge-teaser" } });
    const built = MarketingSharkPackage.parse(JSON.parse(await readFile(path.join(bare.state, "ventures/marketingshark/packages/2026-09-30/devshark/package.json"), "utf8")));
    expect(built.rotation).toMatchObject({ scheduled: "challenge-teaser" });
  });

  it("drafts nothing twice: a rerun of a drafted day is already served", async () => {
    const brand = await devshark();
    const where = await rooms();
    await draft(brand, "2026-09-29", where);
    const again = await draft(brand, "2026-09-29", where);
    expect(again.outcome).toMatchObject({ status: "already-served", kind: "feature-spotlight" });
    expect(again.calls).toBe(0);
  });

  it("writes the meeting record whatever the length of a refusal", () => {
    const record = buildMeetingRecord({
      cycleId: "t", date: "2026-10-02", now: new Date("2026-10-02T05:00:00.000Z"), stage: "DISCOVERY", dry: true,
      outcomes: [{ status: "aborted", brandId: "devshark", kind: "announcement", reason: "truth-gate-failed", detail: "owner-copy: a refusal. ".repeat(120), spendUsd: 0 }],
      spendUsd: 0, envelopeUsd: 0.1, monthAllInUsd: 0, monthCapUsd: 50
    });
    expect(record.decision.summary.length).toBeGreaterThan(800);
    expect(record.roomTranscript!.turns.every((turn) => turn.text.length <= 800)).toBe(true);
  });

  it("opens no room at the weekend and writes nothing", async () => {
    const result = await runMarketingSharkCycle({ cycleId: "t", dry: true, now: new Date("2026-10-03T05:00:00.000Z"), date: "2026-10-03", stage: "DISCOVERY" });
    expect(result).toMatchObject({ brands: [], spendUsd: 0, artifacts: [], skipped: { reason: expect.stringContaining("Saturday") } });
  });
});

describe("the kinds' own content", () => {
  it("spotlights a screen the fact sheet names, with code's slide 1 and footer", async () => {
    const brand = await devshark();
    const where = await rooms();
    await draft(brand, "2026-09-29", where);
    const built = PostPackageSchema.parse(await packageOn(where, "2026-09-29"));
    const screens = brand.postKinds["feature-spotlight"]!.screens;
    expect(screens.map((screen) => screen.id)).toContain(built.spotlight!.screen.id);
    expect(built.carousels.en.slides[0]!.headline).toBe(`Inside devShark: ${built.spotlight!.screen.name}`);
    expect(built.carousels.en.slides[4]!.headline).toBe(brand.postKinds["feature-spotlight"]!.footer.en);
    expect(built.spotlight!.factSheetEffectiveFrom).toBe("2026-09-15");
    // A new screen each week.
    const next = await plan(brand, "2026-10-06", where);
    expect(next.kind === "feature-spotlight" && next.subject.ref).not.toBe(built.subject.ref);
  });

  it("teases an Easy challenge with its prompt and first hint, and nothing past them", async () => {
    const brand = await devshark();
    const where = await rooms();
    await draft(brand, "2026-09-30", where);
    const built = PostPackageSchema.parse(await packageOn(where, "2026-09-30"));
    const snapshot = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/marketingshark-challenges.valid.json"), "utf8")) as { challenges: Array<{ id: string; prompt: string; firstHint: string; difficulty: string }> };
    const challenge = snapshot.challenges.find((entry) => entry.id === built.challenge!.id)!;
    expect(challenge.difficulty).toBe("easy");
    const [hook, prompt, hint] = built.carousels.en.slides;
    expect(hook!.headline).toBe(`Easy challenge: ${built.challenge!.title}`);
    expect(prompt!.body).toBe(challenge.prompt.replace(/`/gu, ""));
    expect(hint!.headline).toBe("Hint 1");
    expect(hint!.body).toBe(challenge.firstHint.replace(/`/gu, ""));
    expect(built.challenge!.snapshotContentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("recaps the week from its own packages and lets a trend hook choose the theme, never the words", async () => {
    const brand = await devshark();
    const where = await rooms();
    for (const date of WEEK.slice(0, 4)) await draft(brand, date, where);
    const plain = await plan(brand, "2026-10-02", where);
    expect(plain.kind).toBe("this-week");
    const week = (plain as PostDayPlan).provenance.week!;
    expect(week.items.map((item) => item.date)).toEqual(WEEK.slice(0, 4));
    expect(week.theme.from).toBe("week");
    expect(week.trend).toMatchObject({ packet: null, reason: expect.stringContaining("no readable trend snapshot") });

    // A GoVIRAL snapshot whose rising devShark tag names a bank category leads the week with our own label.
    await atomicWriteJson(where.facts, "goviral/trends/2026-09-28.json", trendSnapshot("2026-09-28", [["#react", 30, -2], ["#reactjs", 20, 4], ["#webdev", 10, 1]]));
    const hooked = await plan(brand, "2026-10-02", where) as PostDayPlan;
    expect(hooked.provenance.week!.theme).toEqual({ label: "React", category: "react", from: "trend" });
    expect(hooked.provenance.week!.trend.packet).toMatchObject({ topic: "#reactjs", velocity: 25, evidenceRefs: ["state/goviral/trends/2026-09-28.json"] });
    expect(hooked.codeSlides.theme!.headline).toBe("React");
    // The tag itself reaches neither a slide nor the writer.
    expect(JSON.stringify(hooked.codeSlides)).not.toContain("#reactjs");
    expect(buildPostPacket({ brand, plan: hooked, date: "2026-10-02" })).not.toContain("#reactjs");
    // A tag that names no bank category leaves the week's own theme in place.
    await atomicWriteJson(where.facts, "goviral/trends/2026-09-29.json", trendSnapshot("2026-09-29", [["#100daysofcode", 50, null]]));
    expect((await plan(brand, "2026-10-02", where) as PostDayPlan).provenance.week!.theme.from).toBe("week");
  });
});

describe("the post kinds' gates", () => {
  async function challengeDay(): Promise<{ brand: Brand; day: PostDayPlan }> {
    const brand = await devshark();
    const day = await plan(brand, "2026-09-30", await rooms());
    expect(day.kind).toBe("challenge-teaser");
    return { brand, day: day as PostDayPlan };
  }

  it("passes the fixture writer and refuses code, invented numbers and engagement rewards", async () => {
    const { brand, day } = await challengeDay();
    const clean = fixturePostOutput(day, brand);
    expect(runPostGates({ output: clean, brand, plan: day })).toEqual([]);
    const withTry = (body: string): PostWriterOutput => ({ ...clean, slides: [{ ...clean.slides[0]!, body }] });
    const gates = (output: PostWriterOutput) => runPostGates({ output, brand, plan: day }).map((violation) => violation.gate);
    expect(gates(withTry("Use `text.match(/[aeiou]/g)` and count."))).toContain("no-solution");
    expect(gates(withTry("One loop: const count = 0 and go."))).toContain("no-solution");
    expect(gates(withTry("It asks for countVowels(text) and nothing else."))).not.toContain("no-solution");
    expect(gates(withTry("Premium is 3.99 a month."))).toContain("no-invented-numbers");
    expect(gates({ ...clean, descriptions: { ...clean.descriptions, instagram: { en: "Follow us for 50 coins. The prompt is in the carousel." } } })).toContain("engagement-reward");
  });

  it("holds the writer to its own slides and fields", async () => {
    const { brand, day } = await challengeDay();
    const clean = fixturePostOutput(day, brand);
    const gates = (output: PostWriterOutput) => runPostGates({ output, brand, plan: day }).map((violation) => violation.gate);
    expect(gates({ ...clean, slides: [{ role: "prompt", headline: "x", body: "y", alt: "z" }] })).toEqual(["slide-roles"]);
    expect(gates({ ...clean, slides: [{ ...clean.slides[0]!, headline: "" }] })).toContain("field-present");
    const week = await plan(brand, "2026-10-02", await (async () => {
      const where = await rooms();
      for (const date of WEEK.slice(0, 2)) await draft(brand, date, where);
      return where;
    })()) as PostDayPlan;
    const note = fixturePostOutput(week, brand);
    const themeHeadline = { ...note, slides: note.slides.map((slide) => (slide.role === "theme" ? { ...slide, headline: "Mine" } : slide)) };
    expect(runPostGates({ output: themeHeadline, brand, plan: week }).map((violation) => violation.gate)).toContain("field-owned");
    const trendy = { ...note, slides: note.slides.map((slide) => (slide.role === "theme" ? { ...slide, body: "React is trending this week." } : slide)) };
    expect(runPostGates({ output: trendy, brand, plan: week }).map((violation) => violation.gate)).toContain("trend-mention");
  });

  it("asks the writer only for its slides, with each slot's own limit", async () => {
    const { brand, day } = await challengeDay();
    const packet = buildPostPacket({ brand, plan: day, date: "2026-09-30" });
    expect(packet).toContain("## Today's post kind: challenge teaser");
    expect(packet).toContain("- return exactly these slides, in this order: try");
    expect(packet).toMatch(/- try body ≤ \d+ characters on \d+ lines/u);
    expect(packet).toContain('"role": "try", "headline": "string", "body": "string", "alt": "string"');
    expect(packet).not.toContain('"role": "prompt"');
    expect(packet).toContain("no code on any slide or caption");
    expect(packet).toContain("- no slide, caption or hashtag promises coins, discounts, access or any reward for following, liking, sharing or commenting");
  });
});

describe("the craft rules per kind", () => {
  it("has one section per kind and sends only the day's", async () => {
    const craft = await readCraftRules();
    for (const kind of POST_KINDS.filter((candidate) => candidate !== "announcement")) {
      expect(craft.match(new RegExp(`^### .*\`${kind}\``, "gmu")), kind).toHaveLength(1);
      const rules = craftRulesFor(craft, kind);
      for (const other of POST_KINDS.filter((candidate) => candidate !== kind)) expect(rules, `${kind} carries ${other}`).not.toContain(`\`${other}\``);
      // The shared sections ride with every kind.
      for (const shared of ["## Voice", "## Descriptions", "## Alt text", "## Final sweep before returning"]) expect(rules).toContain(shared);
    }
    // The owner writes the announcement: no model section exists for it.
    expect(craft).not.toContain("`announcement`");
    expect(craftRulesFor(craft, "quiz" satisfies PostKind)).toContain("Code blocks are copied exactly, character for character.");
  });
});

describe("the owner's launch announcement", () => {
  const FIXTURE = "contracts/fixtures/marketingshark-announcement.fixture.json";

  async function withCopy(copy: unknown, date = "2026-10-03"): Promise<Rooms> {
    const where = await rooms();
    await mkdir(path.join(where.facts, "ventures/marketingshark/announcements"), { recursive: true });
    await writeFile(path.join(where.facts, `ventures/marketingshark/announcements/${date}-devshark.json`), JSON.stringify(copy));
    return where;
  }

  async function fixture(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(path.join(repoRoot, FIXTURE), "utf8")) as Record<string, unknown>;
  }

  it("ships as a placeholder fixture the gates refuse, at $0 and without a call", async () => {
    const brand = await devshark();
    const where = await withCopy({ ...await fixture(), date: "2026-10-03" });
    const { day, outcome, calls } = await draft(brand, "2026-10-03", where);
    // A Saturday: the owner's date wins over the rotation's rest day.
    expect(day.kind).toBe("announcement");
    expect(calls).toBe(0);
    expect(outcome).toMatchObject({ status: "aborted", kind: "announcement", reason: "truth-gate-failed", spendUsd: 0 });
    expect(outcome?.status === "aborted" && outcome.detail).toContain("owner-copy");
  });

  it("drafts the owner's words unchanged, at $0, through every gate", async () => {
    const brand = await devshark();
    const base = await fixture();
    // Test copy, not announcement copy: the words are the owner's to write.
    const slides = ["hook", "news", "detail", "next", "footer"].map((role) => ({
      role,
      headline: role === "detail" ? "Test" : `Test ${role} headline`,
      body: role === "hook" || role === "footer" ? "" : `Test ${role} body.`,
      alt: `Slide: test ${role}`
    }));
    const copy = {
      ...base,
      date: "2026-10-03",
      slides,
      descriptions: {
        instagram: { en: "Test Instagram caption. devshark.app" },
        threads: { en: "Test Threads caption." },
        linkedin: { en: "Test LinkedIn first line.\n\nTest LinkedIn paragraph.\n\nhttps://devshark.app" }
      },
      hashtags: { instagram: { en: ["#webdev", "#programming", "#codingquiz"] }, threads: { en: ["webdev"] }, linkedin: { en: ["#webdev"] } }
    };
    const where = await withCopy(copy);
    const { outcome, calls } = await draft(brand, "2026-10-03", where);
    expect(calls).toBe(0);
    expect(outcome).toMatchObject({ status: "drafted", kind: "announcement", spendUsd: 0 });
    const built = PostPackageSchema.parse(await packageOn(where, "2026-10-03"));
    expect(built.carousels.en.slides.map((slide) => slide.headline)).toEqual(slides.map((slide) => slide.headline));
    expect(built.announcement!.copyRef).toBe("state/ventures/marketingshark/announcements/2026-10-03-devshark.json");
    // A price the fact sheet in effect does not state is refused, whoever wrote it.
    const priced = await withCopy({ ...copy, slides: slides.map((slide, index) => (index === 1 ? { ...slide, body: "Premium costs 3.99 a month." } : slide)) });
    expect((await draft(brand, "2026-10-03", priced)).outcome).toMatchObject({ status: "aborted", reason: "truth-gate-failed", detail: expect.stringContaining("no-invented-numbers") });
  });

  it("reports a copy file it cannot use instead of drafting the rotation's post", async () => {
    const brand = await devshark();
    const where = await withCopy({ schemaVersion: "marketingshark-announcement/1", date: "2026-10-01" }, "2026-10-01");
    expect(await plan(brand, "2026-10-01", where)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("was not drafted") });
  });
});
