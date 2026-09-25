import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { NormalizedQuestionSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { enabledBrands, ENGAGEMENT_NEVER_CLAIM, factSheetFor, loadMarketingSharkConfig, MarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { fencedBlocks, LIMITS, promisesEngagementReward, runTruthGates, violationReport } from "../src/ventures/marketingshark/gates.js";
import { LINKEDIN_LINK_RESERVE, LINKEDIN_TEXT_LIMIT, LINKEDIN_UTM_CONTENT_MAX, linkedinTrackedLink } from "../src/social/linkedin-text.js";
import { buildChumPacket, craftRulesFor, outputShape, readCraftRules } from "../src/ventures/marketingshark/packet.js";
import { POST_KINDS } from "../src/ventures/marketingshark/kinds.js";
import { ChumOutput } from "../src/ventures/marketingshark/package.js";

const CODE = "const [value, setValue] = useState(initial);";

const question: NormalizedQuestion = NormalizedQuestionSchema.parse({
  id: "q-code",
  category: "react",
  difficulty: 3,
  importance: 8,
  hasCode: true,
  correctIndex: 1,
  en: {
    introduction: "",
    question: `What does useState return?\n\n\`\`\`jsx\n${CODE}\n\`\`\``,
    options: ["A single value", "An array with value and setter", "An object", "A promise"],
    explanation: "useState returns an array with exactly two elements: the value and a setter."
  },
  cs: { question: "Co vrací useState?", explanation: "Vrací pole o dvou prvcích." }
});

/** The assigned line, as the studio hands it to the room: already gate-licensed and budgeted. */
const HOOK_LINES = { en: "Spot it before the compiler does.", cs: "Najdi to dřív než kompilátor." };

async function devshark(): Promise<Brand> {
  const config = await loadMarketingSharkConfig();
  return config.brands.find((candidate) => candidate.id === "devshark")!;
}

/**
 * devShark writes English only (quorum#568). The Czech path stays for a brand that names it, and
 * these tests hold it to the same gates by giving devShark both languages.
 */
async function bilingual(): Promise<Brand> {
  return { ...(await devshark()), locales: ["cs", "en"] };
}

function output(brand: Brand, overrides: Partial<ChumOutput> = {}): ChumOutput {
  const slides = (locale: "cs" | "en") => ({
    slides: [
      { role: "hook" as const, headline: HOOK_LINES[locale], alt: `Slide 1: ${locale} hook` },
      { role: "context" as const, headline: "What does useState return?", body: CODE, alt: `Slide 2: ${locale} question` },
      { role: "reveal" as const, headline: "B", body: "An array with value and setter", alt: `Slide 3: ${locale} reveal` },
      { role: "why" as const, headline: "Two elements", body: "The value and a setter, always in that order.", alt: `Slide 4: ${locale} why` },
      { role: "footer" as const, headline: brand.slide5[locale], alt: `Slide 5: ${locale} footer` }
    ]
  });
  return ChumOutput.parse({
    carousels: { cs: slides("cs"), en: slides("en") },
    descriptions: {
      instagram: { cs: "Otázka dne. Odpověď je v karuselu.", en: "Question of the day. The answer is in the carousel." },
      threads: { cs: "Co vrací useState?", en: "What does useState return?" },
      linkedin: { en: LINKEDIN }
    },
    hashtags: {
      instagram: { cs: ["#programovani", "#webdev", "#vyvojar"], en: ["#webdev", "#programming", "#codingquiz"] },
      threads: { cs: ["programování"], en: ["webdev"] },
      linkedin: { en: ["#webdev", "#react"] }
    },
    ...overrides
  });
}

const LINKEDIN = "One React hook, two return values, and a common interview slip.\n\n"
  + "useState hands back an array: the value first, then the setter. The carousel shows the question and why the order matters.\n\n"
  + "devshark.app";

describe("the shape CHUM must return", () => {
  it("requires the five roles in the order the renderer assumes", async () => {
    const brand = await bilingual();
    const valid = output(brand);
    expect(ChumOutput.safeParse(valid).success).toBe(true);

    // renderCarousel picks each slide's template with SLIDE_ROLES[index] and never reads the role
    // the model wrote. Before this rule, `why` twice with no `footer` parsed cleanly and the
    // fourth slide's copy was rendered through the footer's template — the brand's slide-5 line
    // silently replaced by an explanation, with nothing reporting a problem.
    const duplicated = structuredClone(valid) as typeof valid;
    duplicated.carousels.en.slides[4] = { ...duplicated.carousels.en.slides[3]! };
    expect(ChumOutput.safeParse(duplicated).success).toBe(false);

    // Same five roles, wrong order: also refused, because position is what the renderer trusts.
    const reordered = structuredClone(valid) as typeof valid;
    const [first, second] = [reordered.carousels.cs!.slides[0]!, reordered.carousels.cs!.slides[1]!];
    reordered.carousels.cs!.slides[0] = second;
    reordered.carousels.cs!.slides[1] = first;
    expect(ChumOutput.safeParse(reordered).success).toBe(false);
  });
});

describe("marketingShark truth gates", () => {
  it("passes copy that is inside every cap and true of the question", async () => {
    const brand = await bilingual();
    expect(runTruthGates({ output: output(brand), brand, question, hookLines: HOOK_LINES })).toEqual([]);
  });

  it("gates devShark in English only, and a bilingual brand in both languages", async () => {
    const english = await devshark();
    expect(english.locales).toEqual(["en"]);
    const { cs: _carousel, ...carousels } = output(english).carousels;
    const englishOnly = ChumOutput.parse({
      carousels,
      descriptions: { instagram: { en: "Question of the day. The answer is in the carousel." }, threads: { en: "What does useState return?" }, linkedin: { en: LINKEDIN } },
      hashtags: { instagram: { en: ["#webdev", "#programming", "#codingquiz"] }, threads: { en: ["webdev"] }, linkedin: { en: ["#webdev"] } }
    });
    expect(runTruthGates({ output: englishOnly, brand: english, question, hookLines: { en: HOOK_LINES.en } })).toEqual([]);

    // The same reply for a brand that writes Czech is missing a language, and the retry says so.
    const violations = runTruthGates({ output: englishOnly, brand: await bilingual(), question, hookLines: HOOK_LINES });
    expect(violations).toEqual([expect.objectContaining({ gate: "locale-missing", locale: "cs" })]);
  });

  it("refuses a footer that edited the brand's line", async () => {
    const brand = await devshark();
    const edited = output(brand);
    edited.carousels.en.slides[4]!.headline = `${brand.slide5.en} Follow for more!`;

    const violations = runTruthGates({ output: edited, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("slide5-verbatim");
    expect(violations.find((violation) => violation.gate === "slide5-verbatim")?.locale).toBe("en");
  });

  it("refuses a hook that invented a number", async () => {
    const brand = await devshark();
    const invented = output(brand);
    // 10 is in the pattern's own wording and stays legal; 90 is in neither the pattern nor the
    // question, which is the never-invent-a-statistic rule in the form a check can apply it.
    invented.carousels.en.slides[0]!.headline = "90% of developers get this wrong.";

    const violations = runTruthGates({ output: invented, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("no-invented-numbers");
    expect(runTruthGates({ output: output(brand), brand, question, hookLines: HOOK_LINES })).toEqual([]);
  });

  it("refuses a retyped code block", async () => {
    const brand = await devshark();
    const retyped = output(brand);
    retyped.carousels.en.slides[1]!.body = "const [value, setValue] = useState(initialValue);";

    const violations = runTruthGates({ output: retyped, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("code-verbatim");
  });

  it("refuses an unfilled pattern slot reaching a slide", async () => {
    const brand = await bilingual();
    const unfilled = output(brand);
    unfilled.carousels.cs!.slides[0]!.headline = "Používáš {topic} každý den.";

    const violations = runTruthGates({ output: unfilled, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("slot-filled");
  });

  it("refuses every over-cap field", async () => {
    const brand = await devshark();
    const over = output(brand);
    // The hook slide is only the model's on the `no-hook` fallback, so the length cap is checked
    // with no assigned line — which is the only state that cap now applies in.
    over.carousels.en.slides[0]!.headline = "x".repeat(81);
    over.carousels.en.slides[3]!.body = Array.from({ length: 45 }, () => "word").join(" ");
    over.carousels.en.slides[2]!.alt = "y".repeat(201);
    over.descriptions.threads.en = "z".repeat(301);
    over.descriptions.instagram.en = "w".repeat(501);
    over.hashtags.instagram.en = ["#one", "#two"];
    over.hashtags.threads.en = ["one", "two"];

    const gates = runTruthGates({ output: over, brand, question, hookLines: null }).map((violation) => violation.gate);
    for (const gate of ["hook-length", "why-length", "alt-length", "threads-length", "instagram-length", "instagram-hashtags", "threads-topic"]) {
      expect(gates, `${gate} was not caught`).toContain(gate);
    }
  });

  it("refuses a LinkedIn caption that breaks LinkedIn's limits", async () => {
    const brand = await devshark();
    const gates = (edit: (reply: ChumOutput) => void) => {
      const reply = output(brand);
      edit(reply);
      return runTruthGates({ output: reply, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate);
    };
    expect(gates(() => undefined)).toEqual([]);
    expect(gates((reply) => { reply.descriptions.linkedin.en = "x".repeat(LIMITS.linkedinTotalChars); })).toContain("linkedin-length");
    // LinkedIn truncates behind "see more"; the first line has to stand on its own.
    expect(gates((reply) => { reply.descriptions.linkedin.en = `${"word ".repeat(40)}\n\nmore`; })).toContain("linkedin-first-line");
    expect(gates((reply) => { reply.hashtags.linkedin.en = ["#a", "#b", "#c", "#d"]; })).toContain("linkedin-hashtags");
    expect(gates((reply) => { reply.hashtags.linkedin.en = ["react"]; })).toContain("linkedin-hashtags");
    expect(gates((reply) => { reply.descriptions.linkedin.en = `${LINKEDIN} #react #webdev`; })).toContain("linkedin-hashtags");
    expect(gates((reply) => { reply.descriptions.linkedin.en = ""; })).toContain("linkedin-present");
  });

  it("keeps room below LinkedIn's 3,000 for the tracked link every LinkedIn draft carries", async () => {
    // The queue item's link: the brand's product URL with the room's UTM fields, and the longest
    // `utm_content` a queue item can hold. Buffer appends it, after a blank line, to a single-image
    // post, so a caption that used the whole 3,000 passed here and was held at send time.
    const drafted = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/marketingshark-queue-linkedin.valid.json"), "utf8")) as { destination: string; utm: { source: "linkedin"; medium: "organic_social"; campaign: string; content: string } };
    const config = await loadMarketingSharkConfig();
    for (const brand of enabledBrands(config)) {
      const longest = linkedinTrackedLink({
        destination: brand.productUrl,
        utm: { ...drafted.utm, campaign: `marketingshark-${brand.id}`, content: "x".repeat(LINKEDIN_UTM_CONTENT_MAX) }
      });
      expect(`\n\n${longest}`.length, brand.id).toBeLessThanOrEqual(LINKEDIN_LINK_RESERVE);
    }
    expect(drafted.utm.campaign).toBe("marketingshark-devshark");
    expect(LIMITS.linkedinTotalChars).toBe(LINKEDIN_TEXT_LIMIT - LINKEDIN_LINK_RESERVE);
  });

  it("refuses a LinkedIn caption copied from another channel, whole or by its first line", async () => {
    const brand = await devshark();
    const copied = output(brand);
    copied.descriptions.linkedin.en = copied.descriptions.instagram.en;
    expect(runTruthGates({ output: copied, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate)).toContain("linkedin-distinct");
    const opening = output(brand);
    opening.descriptions.linkedin.en = `${opening.descriptions.threads.en}\n\nA longer LinkedIn body follows here.`;
    expect(runTruthGates({ output: opening, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate)).toContain("linkedin-distinct");
  });

  it("refuses a post that promises a reward for engagement, and leaves ordinary calls alone", async () => {
    // Meta's spam standards forbid value in exchange for engagement; LinkedIn forbids artificial
    // engagement (second handoff, finding 5).
    for (const bait of [
      "Follow us for 50 coins on your first streak.",
      "Like this post to unlock Premium for a month",
      "Share this with a friend and get a 20% discount",
      "Comment below: every answer earns a reward",
      "Coins for following devShark this week",
      "Sleduj nás a získej 50 mincí"
    ]) expect(promisesEngagementReward(bait), bait).toBe(true);
    for (const fine of [
      "Share this with a friend who still uses var.",
      "Save this for your next interview.",
      "Components that share state reward you with fewer bugs.",
      "The <details> tag is free to use, and so is the answer in slide 3.",
      "Follow the setter: it schedules a render."
    ]) expect(promisesEngagementReward(fine), fine).toBe(false);

    const brand = await devshark();
    const bait = output(brand);
    bait.descriptions.linkedin.en = `${LINKEDIN}\n\nFollow us for 50 coins.`;
    const violations = runTruthGates({ output: bait, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("engagement-reward");
    const slide = output(brand);
    slide.carousels.en.slides[3]!.body = "Like this post to unlock Premium.";
    expect(runTruthGates({ output: slide, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate)).toContain("engagement-reward");
  });

  it("refuses alt text the queue could not carry: empty, or over its total", async () => {
    const brand = await devshark();
    const long = output(brand);
    for (const slide of long.carousels.en.slides) slide.alt = "y".repeat(LIMITS.altChars);
    // Five alts at the per-slide cap, joined, are one character per separator over the queue's 1,000.
    expect(runTruthGates({ output: long, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate)).toContain("alt-total");
    const empty = output(brand);
    empty.carousels.en.slides[2]!.alt = " ";
    expect(runTruthGates({ output: empty, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate)).toContain("alt-present");
  });

  it("refuses slides that are out of role order", async () => {
    const brand = await devshark();
    const shuffled = output(brand);
    const slides = shuffled.carousels.en.slides;
    [slides[1], slides[2]] = [slides[2]!, slides[1]!];

    expect(runTruthGates({ output: shuffled, brand, question, hookLines: HOOK_LINES }).map((violation) => violation.gate))
      .toContain("slide-roles");
  });

  it("refuses a hook slide that edited the assigned line", async () => {
    const brand = await devshark();
    const edited = output(brand);
    edited.carousels.en.slides[0]!.headline = "Spot it before the compiler does!";

    const violations = runTruthGates({ output: edited, brand, question, hookLines: HOOK_LINES });
    expect(violations.map((violation) => violation.gate)).toContain("hook-verbatim");
    expect(violations.find((violation) => violation.gate === "hook-verbatim")?.locale).toBe("en");
  });

  it("leaves the hook slide to the model only on the no-hook fallback", async () => {
    const brand = await bilingual();
    const own = output(brand);
    own.carousels.en.slides[0]!.headline = "What does useState actually give you?";
    own.carousels.cs!.slides[0]!.headline = "Co vlastně useState vrací?";

    expect(runTruthGates({ output: own, brand, question, hookLines: null })).toEqual([]);
    expect(runTruthGates({ output: own, brand, question, hookLines: HOOK_LINES })
      .map((violation) => violation.gate)).toContain("hook-verbatim");
  });

  it("reads a fenced block's inner text without its markers", () => {
    expect(fencedBlocks("before\n```jsx\nconst a = 1;\n```\nafter")).toEqual(["const a = 1;"]);
    expect(fencedBlocks("no code here")).toEqual([]);
  });

  it("reports violations one per line for the single retry", () => {
    expect(violationReport([
      { gate: "hook-length", locale: "en", detail: "too long" },
      { gate: "slide5-verbatim", locale: "cs", detail: "edited" }
    ])).toBe("- [hook-length] en: too long\n- [slide5-verbatim] cs: edited");
  });
});

describe("marketingShark CHUM packet", () => {
  it("hands over the decision already made and never asks the model to make it", async () => {
    const brand = await bilingual();
    const packet = buildChumPacket({ brand, question, hookLines: HOOK_LINES, hookId: "spot-it", date: "2026-08-08" });

    expect(packet).toContain("already selected — do not choose another");
    expect(packet).toContain(brand.slide5.cs);
    expect(packet).toContain("Correct answer: B");
    // Slide 1 arrives written. The model is told to reproduce it, not to interpret a pattern.
    expect(packet).toContain("copy it verbatim");
    expect(packet).toContain(HOOK_LINES.cs);
    expect(packet).toContain(HOOK_LINES.en);
    expect(packet).toContain(outputShape(["cs", "en"]));
    // The Czech the product already has, marked as reference rather than as a target.
    expect(packet).toContain("do not translate this");
    expect(packet).toContain("Co vrací useState?");
  });

  it("asks devShark's writer for English only, and pays for no Czech input", async () => {
    const brand = await devshark();
    const packet = buildChumPacket({ brand, question, hookLines: { en: HOOK_LINES.en }, hookId: "spot-it", date: "2026-09-26" });
    expect(packet).toContain("languages: en (English only: write no Czech field at all)");
    expect(packet).toContain(outputShape(["en"]));
    expect(outputShape(["en"])).not.toContain('"cs"');
    expect(packet).toContain(brand.slide5.en);
    expect(packet).not.toContain(brand.slide5.cs);
    expect(packet).not.toContain("Czech reference");
    expect(packet).not.toContain("Co vrací useState?");
    expect(packet).not.toContain("both languages");
  });

  it("appends the failed checks on the retry and nothing on the first attempt", async () => {
    const brand = await devshark();
    const first = buildChumPacket({ brand, question, hookLines: HOOK_LINES, hookId: "spot-it", date: "2026-08-08" });
    const retry = buildChumPacket({
      brand, question, hookLines: HOOK_LINES, hookId: "spot-it", date: "2026-08-08",
      violations: [{ gate: "hook-length", locale: "en", detail: "81 characters, cap is 80" }]
    });

    expect(first).not.toContain("previous answer failed");
    expect(retry).toContain("previous answer failed");
    expect(retry).toContain("[hook-length] en: 81 characters, cap is 80");
  });

  it("hands the writer the owner's product facts and the claims it may never make", async () => {
    // Every shipped string used to speak of a live product. The owner said on 2026-09-15 that
    // devShark is in testing, and the packet is where that premise reaches the writer.
    const brand = await devshark();
    const packet = buildChumPacket({ brand, question, hookLines: HOOK_LINES, hookId: "spot-it", date: "2026-09-16" });
    const facts = factSheetFor(brand, "2026-09-16")!;
    expect(facts.maturity).toContain("in testing");
    expect(packet).toContain("## Product facts (recorded by the owner 2026-09-15");
    expect(packet).toContain(facts.maturity);
    expect(packet).toContain("never say:");
    for (const claim of facts.neverClaim) expect(packet).toContain(`- ${claim}`);
    // The engagement rule is on the sheet and stated once.
    expect(facts.neverClaim).toContain(ENGAGEMENT_NEVER_CLAIM);
    expect(packet.split(ENGAGEMENT_NEVER_CLAIM)).toHaveLength(2);
    // A brand nobody has described yet carries no facts section rather than an empty one.
    const { factSheets: _dropped, ...undescribed } = brand;
    expect(buildChumPacket({ brand: undescribed, question, hookLines: HOOK_LINES, hookId: "spot-it", date: "2026-09-16" }))
      .not.toContain("## Product facts");
  });

  it("states in the packet every cap the gates enforce", async () => {
    const brand = await devshark();
    const packet = buildChumPacket({ brand, question, hookLines: null, hookId: null, date: "2026-08-08" });
    // A cap the gate enforces and the packet never mentions is a retry the model cannot learn
    // its way out of.
    for (const cap of [
      "≤ 80 characters", "≤ 40 words", "≤ 500 characters", "≤ 300 characters", "≤ 200 characters", "3–5 hashtags",
      "≤ 2,600 characters with its hashtags", "first line ≤ 140 characters", "at most 3 hashtags", "all five together ≤ 1,000",
      "texts differ, and so do their first lines", "any reward for following, liking, sharing or commenting"
    ]) {
      expect(packet, `${cap} is enforced but not stated`).toContain(cap);
    }
    expect(packet).toContain('"linkedin":  { "en": "string" }');
  });

  it("reads the fact sheet block in effect on the run date, so a change of facts is one new block", async () => {
    const brand = await devshark();
    const current = factSheetFor(brand, "2026-09-26")!;
    const launched = { ...current, effectiveFrom: "2026-10-01", recordedAt: "2026-09-30", maturity: "Publicly launched." };
    const later = { ...brand, factSheets: [...brand.factSheets!, launched] };
    expect(factSheetFor(later, "2026-09-30")!.maturity).toBe(current.maturity);
    expect(factSheetFor(later, "2026-10-01")!.maturity).toBe("Publicly launched.");
    expect(buildChumPacket({ brand: later, question, hookLines: null, hookId: null, date: "2026-10-02" })).toContain("maturity: Publicly launched.");
    // A block written without the engagement rule still carries it into the packet.
    const forgetful = { ...brand, factSheets: [{ ...current, neverClaim: current.neverClaim.filter((claim) => claim !== ENGAGEMENT_NEVER_CLAIM) }] };
    expect(buildChumPacket({ brand: forgetful, question, hookLines: null, hookId: null, date: "2026-09-26" })).toContain(`- ${ENGAGEMENT_NEVER_CLAIM}`);
    // Blocks run oldest first, one per date.
    const config = await loadMarketingSharkConfig();
    const shuffled = { ...config, brands: [{ ...brand, factSheets: [launched, current] }] };
    expect(MarketingSharkConfig.safeParse(shuffled).success).toBe(false);
    expect(MarketingSharkConfig.safeParse({ ...config, brands: [later] }).success).toBe(true);
  });

  it("keeps the craft rules small enough to ride on every daily call", async () => {
    const craft = await readCraftRules();
    expect(craft).toContain("marketingShark craft rules (CHUM)");
    expect(craft).toContain("Code blocks are copied exactly, character for character.");
    expect(craft).toContain("**LinkedIn**");
    expect(craft).toContain("No post may promise coins, discounts or access for following, liking, sharing or commenting.");
    // Sized to stay near 1,600 tokens of paid input; ~3.5 characters a token. What rides on a call
    // is the shared rules and the day's kind only (quorum#576), so that is what is measured.
    for (const kind of POST_KINDS) expect(craftRulesFor(craft, kind).length, kind).toBeLessThan(7_000);
  });
});
