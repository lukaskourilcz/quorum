import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NormalizedQuestionSchema, QuestionBankSnapshotSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { runFitGate, runTruthGates } from "../src/ventures/marketingshark/gates.js";
import { buildChumPacket } from "../src/ventures/marketingshark/packet.js";
import { ChumOutput, SLIDE_ROLES } from "../src/ventures/marketingshark/package.js";
import {
  codeOwnedSlotsFit,
  renderCarousel,
  slotBudget,
  stripAnswerLetter,
  writerLimits
} from "../src/ventures/marketingshark/render.js";
import { repoRoot } from "../src/paths.js";

// quorum#556: from 16 to 24 September 2026 every devShark package died at render with
// "slides were clipped to fit: cs/reveal:stat, en/reveal:stat, en/why:quote".

const question: NormalizedQuestion = NormalizedQuestionSchema.parse({
  id: "q-plain",
  category: "react",
  difficulty: 2,
  importance: 7,
  hasCode: false,
  correctIndex: 1,
  en: {
    introduction: "",
    question: "What does useState return?",
    options: ["A single value", "An array with the current value and a setter", "An object", "A promise"],
    explanation: "useState returns an array with exactly two elements: the current value and a function that updates it."
  },
  cs: { question: "Co vrací useState?", options: ["Jednu hodnotu", "Pole s aktuální hodnotou a setterem", "Objekt", "Promise"] }
});

const HOOK = { en: "Spot it before the compiler does.", cs: "Najdi to dřív než kompilátor." };

async function devshark(): Promise<Brand> {
  return (await loadMarketingSharkConfig()).brands.find((candidate) => candidate.id === "devshark")!;
}

function reply(brand: Brand, reveal: { headline: string; body?: string }, why = { headline: "Two elements", body: "The value and a setter, always in that order." }): ChumOutput {
  const slides = (locale: "cs" | "en") => ({
    slides: [
      { role: "hook" as const, headline: HOOK[locale], alt: "Slide 1" },
      { role: "context" as const, headline: locale === "cs" ? "Co vrací useState?" : "What does useState return?", alt: "Slide 2" },
      { role: "reveal" as const, ...reveal, alt: "Slide 3" },
      { role: "why" as const, ...why, alt: "Slide 4" },
      { role: "footer" as const, headline: brand.slide5[locale], alt: "Slide 5" }
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
    }
  });
}

function copyOf(output: ChumOutput, locale: "cs" | "en") {
  return {
    slides: output.carousels[locale].slides.map((slide, index) => ({
      role: SLIDE_ROLES[index]!,
      templateId: "",
      headline: slide.headline,
      ...(slide.body ? { body: slide.body } : {}),
      alt: slide.alt
    }))
  };
}

describe("the reveal slide", () => {
  it("prints the correct letter itself, so the stat slot cannot clip the answer's sentence", async () => {
    const brand = await devshark();
    // The shape that failed every day: the whole answer as the headline, no body.
    const output = reply(brand, { headline: "B. An array with the current value and a setter" });
    for (const locale of ["cs", "en"] as const) {
      const reveal = renderCarousel({ brand, locale, copy: copyOf(output, locale), question })[2]!;
      expect(reveal.truncatedSlots).toEqual([]);
      expect(reveal.svg).toContain(">B<");
    }
  });

  it("drops a repeated letter from the label", () => {
    expect(stripAnswerLetter("B. An array")).toBe("An array");
    expect(stripAnswerLetter("B) An array")).toBe("An array");
    expect(stripAnswerLetter("A single value")).toBe("A single value");
  });

  it("refuses a reveal that names the wrong letter", async () => {
    const brand = await devshark();
    const violations = runTruthGates({ output: reply(brand, { headline: "C", body: "An object" }), brand, question, hookLines: HOOK });
    expect(violations.map((violation) => violation.gate)).toContain("reveal-answer");
    expect(runTruthGates({ output: reply(brand, { headline: "B", body: "An array" }), brand, question, hookLines: HOOK })
      .map((violation) => violation.gate)).not.toContain("reveal-answer");
  });
});

describe("the fit gate", () => {
  it("sends over-long copy back with the slot's own limit before anything is kept", async () => {
    const brand = await devshark();
    const long = "An array whose first element is the current state value and whose second element is the setter function that schedules a re-render";
    const violations = runFitGate({ output: reply(brand, { headline: "B", body: long }), brand, question });
    const label = slotBudget("stat-highlight", "stat-label");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.gate === "slot-fit")).toBe(true);
    expect(violations[0]!.detail).toContain(`at most ${label.maxChars} characters`);
  });

  it("passes copy that fits, and the rendered slides clip nothing", async () => {
    const brand = await devshark();
    const output = reply(brand, { headline: "B", body: "An array with the current value and a setter" });
    expect(runFitGate({ output, brand, question })).toEqual([]);
    for (const locale of ["cs", "en"] as const) {
      expect(renderCarousel({ brand, locale, copy: copyOf(output, locale), question }).flatMap((slide) => slide.truncatedSlots)).toEqual([]);
    }
  });

  it("states the limits in the packet, read from the templates", async () => {
    const brand = await devshark();
    const packet = buildChumPacket({ brand, question, hookLines: HOOK, hookId: "hook-1", date: "2026-09-25" });
    for (const line of writerLimits(brand, question)) expect(packet).toContain(line);
    expect(packet).toContain(`≤ ${slotBudget("quote-card", "quote").maxChars} characters`);
    expect(packet).toContain('reveal headline is the correct letter alone ("B")');
  });
});

describe("a context slide that carries code", () => {
  const CODE = "const [value, setValue] = useState(0);";
  const coded: NormalizedQuestion = NormalizedQuestionSchema.parse({
    ...question,
    id: "q-code",
    hasCode: true,
    en: { ...question.en, question: `What does this return?\n\n\`\`\`jsx\n${CODE}\n\`\`\`` }
  });

  function withContextBody(output: ChumOutput, body: string): ChumOutput {
    const carousel = (locale: "cs" | "en") => ({
      slides: output.carousels[locale].slides.map((slide) => (slide.role === "context" ? { ...slide, body } : slide))
    });
    return ChumOutput.parse({ ...output, carousels: { cs: carousel("cs"), en: carousel("en") } });
  }

  it("sends commentary beside the code back with advice about the body, not the headline", async () => {
    const brand = await devshark();
    const commentary = Array.from({ length: 12 }, (_, index) => `// note ${index}: the setter schedules a render`).join("\n");
    const output = withContextBody(reply(brand, { headline: "B", body: "An array" }), `${CODE}\n${commentary}`);
    const violations = runFitGate({ output, brand, question: coded });
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) {
      expect(violation.detail).toContain("code-block slot holds at most");
      expect(violation.detail).toContain("byte for byte and nothing else");
      expect(violation.detail).not.toContain("headline");
    }
  });

  it("sends over-long restated options back with the slot's limit and the way out", async () => {
    const brand = await devshark();
    const long = (letter: string) => `${letter}. An option restated at far greater length than the question bank ever wrote it`;
    const output = withContextBody(reply(brand, { headline: "B", body: "An array" }), `${CODE}\n${["A", "B", "C", "D"].map(long).join("\n")}`);
    const details = runFitGate({ output, brand, question: coded }).map((violation) => violation.detail);
    const options = slotBudget("quiz-code-context", "options");
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((detail) => detail.includes(`(at most ${options.maxChars} characters on ${options.maxLines} lines)`))).toBe(true);
    expect(details.every((detail) => detail.includes("leave them out of the context body"))).toBe(true);
  });

  it("passes the code alone, and states the options slot's limit in the packet", async () => {
    const brand = await devshark();
    expect(runFitGate({ output: withContextBody(reply(brand, { headline: "B", body: "An array" }), CODE), brand, question: coded })).toEqual([]);
    const packet = buildChumPacket({ brand, question: coded, hookLines: HOOK, hookId: "hook-1", date: "2026-09-25" });
    expect(packet).toContain(`≤ ${slotBudget("quiz-code-context", "options").maxChars} characters on ${slotBudget("quiz-code-context", "options").maxLines} lines together`);
  });
});

describe("the question bank", () => {
  it("offers only questions whose own options fit the context slide, and most of them", async () => {
    const brand = await devshark();
    const snapshot = QuestionBankSnapshotSchema.parse(JSON.parse(await readFile(path.join(repoRoot, brand.questionBank.snapshotPath), "utf8")));
    const eligible = snapshot.questions.filter((entry) => codeOwnedSlotsFit(brand, entry));
    expect(eligible.length / snapshot.questions.length).toBeGreaterThan(0.9);
    // The reveal's big figure is a letter for every eligible question, so it can never clip again.
    for (const entry of eligible.slice(0, 200)) {
      const letter = String.fromCharCode(65 + entry.correctIndex);
      expect(letter).toMatch(/^[A-F]$/u);
    }
  });
});
