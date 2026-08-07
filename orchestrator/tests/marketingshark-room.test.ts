import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS, liveTemplates, SEED_TEMPLATES } from "@boardlessai/carousel-studio";
import { NormalizedQuestionSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import {
  letteredOptions,
  renderCarousel,
  slotsForRole,
  splitContextBody,
  variantForRole
} from "../src/ventures/marketingshark/render.js";
import {
  fixtureChumOutput,
  planBrandDay,
  readLedger,
  runBrandDay
} from "../src/ventures/marketingshark/run.js";
import { buildChumPacket } from "../src/ventures/marketingshark/packet.js";

const CODE = "const [value, setValue] = useState(0);";

const codeQuestion: NormalizedQuestion = NormalizedQuestionSchema.parse({
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
    explanation: "useState returns an array with two elements: the value and its setter."
  },
  cs: { question: "Co vrací useState?", options: ["Jednu hodnotu", "Pole s hodnotou a setterem", "Objekt", "Promise"], explanation: "Vrací pole o dvou prvcích." }
});

async function devshark(): Promise<Brand> {
  return enabledBrands(await loadMarketingSharkConfig())[0]!;
}

describe("marketingShark carousel rendering", () => {
  it("has brand tokens and a live template for every role of every brand", async () => {
    const config = await loadMarketingSharkConfig();
    const live = new Set(liveTemplates().filter((template) => template.status === "live").map((template) => template.id));

    for (const brand of config.brands) {
      expect(CAROUSEL_BRANDS[brand.id], `${brand.id} has no brand tokens`).toBeDefined();
      for (const [role, templateId] of Object.entries(brand.templateMap)) {
        expect(live, `${brand.id}/${role} points at ${templateId}, which is not live`).toContain(templateId);
      }
    }
  });

  it("ships quiz-code-context because nothing live could carry a code block", () => {
    // The justification, asserted rather than asserted-in-prose: every other live template's
    // widest monospace slot is a source label, not a program.
    const monoCapacity = (id: string) => Math.max(0, ...SEED_TEMPLATES
      .filter((template) => template.id === id)
      .flatMap((template) => template.slides.flatMap((slide) => slide.layers))
      .filter((layer): layer is Extract<typeof layer, { type: "text" }> => layer.type === "text" && layer.fontToken === "mono")
      .map((layer) => layer.maxChars));

    const others = SEED_TEMPLATES.filter((template) => template.id !== "quiz-code-context");
    expect(Math.max(0, ...others.map((template) => monoCapacity(template.id)))).toBeLessThanOrEqual(100);
    expect(monoCapacity("quiz-code-context")).toBeGreaterThanOrEqual(400);
  });

  it("renders five checked slides per language with stable, distinct hashes", async () => {
    const brand = await devshark();
    const copy = {
      slides: [
        { role: "hook" as const, templateId: "", headline: "Would you bet a code review on this?", alt: "1" },
        { role: "context" as const, templateId: "", headline: "What does useState return?", body: `${CODE}\nA. A single value\nB. An array with value and setter`, alt: "2" },
        { role: "reveal" as const, templateId: "", headline: "B", body: "An array with value and setter", alt: "3" },
        { role: "why" as const, templateId: "", headline: "Two elements", body: "The value and its setter, always in that order.", alt: "4" },
        { role: "footer" as const, templateId: "", headline: brand.slide5.en, alt: "5" }
      ]
    };

    const first = renderCarousel({ brand, locale: "en", copy, question: codeQuestion });
    const second = renderCarousel({ brand, locale: "en", copy, question: codeQuestion });

    expect(first).toHaveLength(5);
    expect(first.map((slide) => slide.svgHash)).toEqual(second.map((slide) => slide.svgHash));
    expect(new Set(first.map((slide) => slide.svgHash)).size).toBe(5);
    // Nothing was clipped: a slide that silently lost its last line is a worse slide, not a
    // rendered one.
    expect(first.flatMap((slide) => slide.truncatedSlots)).toEqual([]);
    expect(first[1]!.svg).toContain("const [value, setValue] = useState(0);");
    // The hook and the footer share one template and must not open and close on the same slide.
    expect(first[0]!.svgHash).not.toBe(first[4]!.svgHash);
  });

  it("keeps the code monospaced and the options out of the code slot", () => {
    expect(splitContextBody(`${CODE}\nA. One\nB. Two`)).toEqual({ code: CODE, options: "A. One\nB. Two" });
    expect(splitContextBody(CODE)).toEqual({ code: CODE, options: "" });
  });

  it("falls back to the bank's own options, in the carousel's language", async () => {
    const brand = await devshark();
    const template = SEED_TEMPLATES.find((candidate) => candidate.id === "quiz-code-context")!;
    const slots = slotsForRole({
      role: "context", template, headline: "Co vrací useState?", body: CODE,
      brand, question: codeQuestion, locale: "cs"
    });
    expect(slots.options).toContain("B. Pole s hodnotou a setterem");
    expect(letteredOptions(codeQuestion, "en")).toContain("B. An array with value and setter");
  });

  it("gives the footer a different variant from the hook on their shared template", () => {
    const poster = SEED_TEMPLATES.find((candidate) => candidate.id === "minimal-text-poster")!;
    expect(variantForRole("hook", poster)).toBe("A");
    expect(variantForRole("footer", poster)).toBe("B");
    const stat = SEED_TEMPLATES.find((candidate) => candidate.id === "stat-highlight")!;
    expect(variantForRole("reveal", stat)).toBe("A");
  });
});

describe("marketingShark room", () => {
  it("drafts a whole package from the committed bank without any provider call", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-room-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;

    const result = await runBrandDay({
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, dry: true,
      call: async () => {
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        return {
          usd: 0,
          output: fixtureChumOutput({
            brand, question: plan.question,
            hookA: plan.hooks.a.variants[brand.tone]!.en, hookACs: plan.hooks.a.variants[brand.tone]!.cs,
            hookB: plan.hooks.b.variants[brand.tone]!.en, hookBCs: plan.hooks.b.variants[brand.tone]!.cs
          })
        };
      }
    });

    expect(result.outcome.status).toBe("drafted");
    const built = MarketingSharkPackage.parse(JSON.parse(await readFile(
      path.join(root, "ventures/marketingshark/packages/2026-08-08/devshark/package.json"), "utf8")));

    // Nothing here is publishable state. A package leaves this room as a draft or not at all.
    expect(built.status).toBe("draft");
    expect(built.abRecord.measured).toBe(false);
    expect(built.carousels.cs.slides).toHaveLength(5);
    expect(built.carousels.en.slides).toHaveLength(5);
    expect(built.render.summaryPaths).toHaveLength(2);
    expect(built.spendUsd).toBe(0);

    // Package, both render summaries, four draft queue items and the ledger move together or
    // not at all.
    const ledger = await readLedger(root);
    expect(ledger.brands.devshark!.served).toHaveLength(1);
    expect(ledger.brands.devshark!.served[0]!.questionId).toBe(built.question.id);
    expect(result.artifacts).toHaveLength(8);
    expect(result.artifacts.filter((artifact) => artifact.startsWith("social/queue/"))).toHaveLength(4);
  });

  it("writes nothing at all when a truth gate fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-gate-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;

    const result = await runBrandDay({
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, dry: true,
      call: async () => {
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        const output = fixtureChumOutput({
          brand, question: plan.question,
          hookA: plan.hooks.a.variants[brand.tone]!.en, hookACs: plan.hooks.a.variants[brand.tone]!.cs,
          hookB: plan.hooks.b.variants[brand.tone]!.en, hookBCs: plan.hooks.b.variants[brand.tone]!.cs
        });
        // The one thing code owns and a model may never edit.
        output.carousels.en.slides[4]!.headline = "Follow devShark for more!";
        return { usd: 0.05, output };
      }
    });

    expect(result.outcome.status).toBe("aborted");
    expect(result.outcome).toMatchObject({ reason: "truth-gate-failed" });
    // A day that fails leaves no partial artifacts: no package, no summary, no ledger entry --
    // and the ledger untouched means tomorrow serves this question rather than skipping it.
    expect(result.artifacts).toEqual([]);
    const ledger = await readLedger(root);
    expect(ledger.brands.devshark).toBeUndefined();
    await expect(readFile(path.join(root, "ventures/marketingshark/packages/2026-08-08/devshark/package.json"), "utf8"))
      .rejects.toThrow();
  });

  it("retries once with the failed checks, and stops at two calls", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-retry-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const packets: string[] = [];

    const result = await runBrandDay({
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, dry: true,
      call: async (packet, attempt) => {
        packets.push(packet);
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        const output = fixtureChumOutput({
          brand, question: plan.question,
          hookA: plan.hooks.a.variants[brand.tone]!.en, hookACs: plan.hooks.a.variants[brand.tone]!.cs,
          hookB: plan.hooks.b.variants[brand.tone]!.en, hookBCs: plan.hooks.b.variants[brand.tone]!.cs
        });
        if (attempt === 1) output.carousels.en.slides[0]!.headline = "x".repeat(90);
        return { usd: 0.05, output };
      }
    });

    expect(packets).toHaveLength(2);
    expect(packets[0]).not.toContain("previous answer failed");
    expect(packets[1]).toContain("[hook-length] en");
    expect(result.outcome.status).toBe("drafted");
    expect(result.outcome).toMatchObject({ spendUsd: 0.1 });
  });

  it("returns the day's existing package instead of serving a second question", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-idem-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const call = async () => {
      const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
      return {
        usd: 0,
        output: fixtureChumOutput({
          brand, question: plan.question,
          hookA: plan.hooks.a.variants[brand.tone]!.en, hookACs: plan.hooks.a.variants[brand.tone]!.cs,
          hookB: plan.hooks.b.variants[brand.tone]!.en, hookBCs: plan.hooks.b.variants[brand.tone]!.cs
        })
      };
    };

    const first = await runBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "c1", root, dry: true, call });
    let calls = 0;
    const second = await runBrandDay({
      config, brand, ledger: first.ledger, date: "2026-08-08", cycleId: "c2", root, dry: true,
      call: async (packet, attempt) => { calls += 1; return call(); }
    });

    expect(second.outcome.status).toBe("already-served");
    // A backstop sweep on a morning that already ran must not reach the provider at all.
    expect(calls).toBe(0);
    expect(second.artifacts).toEqual([]);
    expect((await readLedger(root)).brands.devshark!.served).toHaveLength(1);
  });

  it("produces a second brand from a config flip and no code change", async () => {
    // Phase 2, proved rather than promised: geoShark enabled in memory, with the devShark bank
    // standing in for its snapshot, still reaches a plan and a distinct hook assignment.
    const config = await loadMarketingSharkConfig();
    const geo = config.brands.find((brand) => brand.id === "geoshark")!;
    const flipped: Brand = {
      ...geo,
      enabled: true,
      questionBank: { ...geo.questionBank, snapshotPath: "state/marketingshark/question-banks/devshark.json" }
    };

    expect(enabledBrands({ ...config, brands: [config.brands[0]!, flipped] }).map((brand) => brand.id))
      .toEqual(["devshark", "geoshark"]);

    const plan = await planBrandDay({ config, brand: flipped, ledger: EMPTY_LEDGER, date: "2026-08-08" });
    expect(plan.question.id).toBeTruthy();
    expect(plan.hooks.a.variants.geo).toBeDefined();

    // A second selection AND a second packet, with no code path of its own. The packet has to
    // carry geoShark's line and geoShark's wording, or "brand-generic" is a claim rather than a
    // property.
    const packet = buildChumPacket({
      brand: flipped, question: plan.question, hookA: plan.hooks.a, hookB: plan.hooks.b, date: "2026-08-08"
    });
    expect(packet).toContain(flipped.slide5.cs);
    expect(packet).toContain("tone: geo");
    expect(packet).toContain(plan.hooks.a.variants.geo!.cs);
    expect(packet).not.toContain(plan.hooks.a.variants.dev!.cs === plan.hooks.a.variants.geo!.cs
      ? "\u0000never matches" : plan.hooks.a.variants.dev!.cs);
    // Its own ledger node and its own epoch, created on first sight.
    expect(plan.selection.brandLedger.served).toEqual([]);
    expect(plan.selection.epoch).toBe(1);

    // And the geo tone is actually reachable: at least one assigned-eligible pattern words
    // itself differently for geo than for dev, which is what makes tone more than a label.
    const divergent = config.hookLibrary.filter((pattern) =>
      pattern.variants.geo!.en !== pattern.variants.dev!.en);
    expect(divergent.length).toBeGreaterThan(0);
  });
});
