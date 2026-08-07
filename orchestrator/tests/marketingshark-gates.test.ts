import { describe, expect, it } from "vitest";
import { NormalizedQuestionSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { loadMarketingSharkConfig, type Brand, type HookPattern } from "../src/ventures/marketingshark/config.js";
import { fencedBlocks, runTruthGates, violationReport } from "../src/ventures/marketingshark/gates.js";
import { buildChumPacket, OUTPUT_SHAPE, readCraftRules } from "../src/ventures/marketingshark/packet.js";
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

async function brandAndPatterns(): Promise<{ brand: Brand; hookA: HookPattern; hookB: HookPattern }> {
  const config = await loadMarketingSharkConfig();
  return {
    brand: config.brands.find((candidate) => candidate.id === "devshark")!,
    hookA: config.hookLibrary.find((pattern) => pattern.id === "speed-run")!,
    hookB: config.hookLibrary.find((pattern) => pattern.id === "no-google")!
  };
}

function output(brand: Brand, overrides: Partial<ChumOutput> = {}): ChumOutput {
  const slides = (locale: "cs" | "en") => ({
    slides: [
      { role: "hook" as const, headline: locale === "cs" ? "Máš 10 vteřin. Teď." : "You have 10 seconds. Go.", alt: `Slide 1: ${locale} hook` },
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
      threads: { cs: "Co vrací useState?", en: "What does useState return?" }
    },
    hashtags: {
      instagram: { cs: ["#programovani", "#webdev", "#vyvojar"], en: ["#webdev", "#programming", "#codingquiz"] },
      threads: { cs: ["programování"], en: ["webdev"] }
    },
    hookB: { en: "No googling. That is the whole point.", cs: "Negoogli. O tom to celé je." },
    ...overrides
  });
}

describe("marketingShark truth gates", () => {
  it("passes copy that is inside every cap and true of the question", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    expect(runTruthGates({ output: output(brand), brand, question, hookA, hookB })).toEqual([]);
  });

  it("refuses a footer that edited the brand's line", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const edited = output(brand);
    edited.carousels.en.slides[4]!.headline = `${brand.slide5.en} Follow for more!`;

    const violations = runTruthGates({ output: edited, brand, question, hookA, hookB });
    expect(violations.map((violation) => violation.gate)).toContain("slide5-verbatim");
    expect(violations.find((violation) => violation.gate === "slide5-verbatim")?.locale).toBe("en");
  });

  it("refuses a hook that invented a number", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const invented = output(brand);
    // 10 is in the pattern's own wording and stays legal; 90 is in neither the pattern nor the
    // question, which is the never-invent-a-statistic rule in the form a check can apply it.
    invented.carousels.en.slides[0]!.headline = "90% of developers get this wrong.";

    const violations = runTruthGates({ output: invented, brand, question, hookA, hookB });
    expect(violations.map((violation) => violation.gate)).toContain("no-invented-numbers");
    expect(runTruthGates({ output: output(brand), brand, question, hookA, hookB })).toEqual([]);
  });

  it("refuses a retyped code block", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const retyped = output(brand);
    retyped.carousels.en.slides[1]!.body = "const [value, setValue] = useState(initialValue);";

    const violations = runTruthGates({ output: retyped, brand, question, hookA, hookB });
    expect(violations.map((violation) => violation.gate)).toContain("code-verbatim");
  });

  it("refuses an unfilled pattern slot reaching a slide", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const unfilled = output(brand);
    unfilled.carousels.cs.slides[0]!.headline = "Používáš {topic} každý den.";

    const violations = runTruthGates({ output: unfilled, brand, question, hookA, hookB });
    expect(violations.map((violation) => violation.gate)).toContain("slot-filled");
  });

  it("refuses every over-cap field", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const over = output(brand);
    over.carousels.en.slides[0]!.headline = "x".repeat(81);
    over.carousels.en.slides[3]!.body = Array.from({ length: 45 }, () => "word").join(" ");
    over.carousels.en.slides[2]!.alt = "y".repeat(201);
    over.descriptions.threads.en = "z".repeat(301);
    over.descriptions.instagram.en = "w".repeat(501);
    over.hashtags.instagram.en = ["#one", "#two"];
    over.hashtags.threads.en = ["one", "two"];

    const gates = runTruthGates({ output: over, brand, question, hookA, hookB }).map((violation) => violation.gate);
    for (const gate of ["hook-length", "why-length", "alt-length", "threads-length", "instagram-length", "instagram-hashtags", "threads-topic"]) {
      expect(gates, `${gate} was not caught`).toContain(gate);
    }
  });

  it("refuses slides that are out of role order", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const shuffled = output(brand);
    const slides = shuffled.carousels.en.slides;
    [slides[1], slides[2]] = [slides[2]!, slides[1]!];

    expect(runTruthGates({ output: shuffled, brand, question, hookA, hookB }).map((violation) => violation.gate))
      .toContain("slide-roles");
  });

  it("refuses an empty alternate hook", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const empty = output(brand, { hookB: { en: "", cs: "Negoogli." } });
    expect(runTruthGates({ output: empty, brand, question, hookA, hookB }).map((violation) => violation.gate))
      .toContain("ab-record");
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
    const { brand, hookA, hookB } = await brandAndPatterns();
    const packet = buildChumPacket({ brand, question, hookA, hookB, date: "2026-08-08" });

    expect(packet).toContain("already selected — do not choose another");
    expect(packet).toContain(brand.slide5.cs);
    expect(packet).toContain("Correct answer: B");
    expect(packet).toContain(hookA.variants.dev!.cs);
    expect(packet).toContain("recorded, never published");
    expect(packet).toContain(OUTPUT_SHAPE);
    // The Czech the product already has, marked as reference rather than as a target.
    expect(packet).toContain("do not translate this");
    expect(packet).toContain("Co vrací useState?");
  });

  it("appends the failed checks on the retry and nothing on the first attempt", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const first = buildChumPacket({ brand, question, hookA, hookB, date: "2026-08-08" });
    const retry = buildChumPacket({
      brand, question, hookA, hookB, date: "2026-08-08",
      violations: [{ gate: "hook-length", locale: "en", detail: "81 characters, cap is 80" }]
    });

    expect(first).not.toContain("previous answer failed");
    expect(retry).toContain("previous answer failed");
    expect(retry).toContain("[hook-length] en: 81 characters, cap is 80");
  });

  it("states in the packet every cap the gates enforce", async () => {
    const { brand, hookA, hookB } = await brandAndPatterns();
    const packet = buildChumPacket({ brand, question, hookA, hookB, date: "2026-08-08" });
    // A cap the gate enforces and the packet never mentions is a retry the model cannot learn
    // its way out of.
    for (const cap of ["≤ 80 characters", "≤ 40 words", "≤ 500 characters", "≤ 300 characters", "≤ 200 characters", "3–5 hashtags"]) {
      expect(packet, `${cap} is enforced but not stated`).toContain(cap);
    }
  });

  it("keeps the craft rules small enough to ride on every daily call", async () => {
    const craft = await readCraftRules();
    expect(craft).toContain("marketingShark craft rules (CHUM)");
    expect(craft).toContain("Code blocks are copied exactly, character for character.");
    // Sized to stay near 1,600 tokens of paid input; ~3.5 characters a token.
    expect(craft.length).toBeLessThan(7_000);
  });
});
