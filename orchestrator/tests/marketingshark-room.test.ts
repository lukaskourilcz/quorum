import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS, liveTemplates, SEED_TEMPLATES } from "@boardlessai/carousel-studio";
import { NormalizedQuestionSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { historyFor, HOOK_CHANNELS_PATH, readHookChannels } from "../src/studio/hook-channels.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import {
  letteredOptions,
  rasteriseCarousel,
  renderCarousel,
  slotsForRole,
  splitContextBody,
  variantForRole
} from "../src/ventures/marketingshark/render.js";
import {
  fixtureChumOutput,
  fixtureHookLines,
  hookLinesFor,
  planBrandDay,
  readLedger,
  runBrandDay,
  topicLabel
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

  it("rasterises the reviewed slides into the same PNG and JPEG bytes every time, and refuses a different slide", async () => {
    const brand = await devshark();
    const copy = {
      slides: [
        { role: "hook" as const, templateId: "", headline: "Would you bet a code review on this?", alt: "1" },
        { role: "context" as const, templateId: "", headline: "What does useState return?", body: CODE, alt: "2" },
        { role: "reveal" as const, templateId: "", headline: "B", body: "An array with value and setter", alt: "3" },
        { role: "why" as const, templateId: "", headline: "Two elements", body: "The value and its setter, always in that order.", alt: "4" },
        { role: "footer" as const, templateId: "", headline: brand.slide5.en, alt: "5" }
      ]
    };
    const reviewed = renderCarousel({ brand, locale: "en", copy, question: codeQuestion });
    const first = await rasteriseCarousel({ brand, locale: "en", copy, question: codeQuestion, date: "2026-09-26", reviewed });
    const second = await rasteriseCarousel({ brand, locale: "en", copy, question: codeQuestion, date: "2026-09-26", reviewed });
    expect(first.map((frame) => [frame.png.sha256, frame.jpeg.sha256])).toEqual(second.map((frame) => [frame.png.sha256, frame.jpeg.sha256]));
    expect(first.map((frame) => frame.jpeg.path)).toEqual([1, 2, 3, 4, 5].map((slide) => `/social/devshark/2026-09-26/en/slide-0${slide}.jpg`));
    expect(first.map((frame) => frame.svgHash)).toEqual(reviewed.map((slide) => slide.svgHash));

    // A frame that is not the slide the gates passed is an error, never a quiet substitute.
    const edited = { slides: copy.slides.map((slide, index) => (index === 3 ? { ...slide, body: "Something else entirely." } : slide)) };
    await expect(rasteriseCarousel({ brand, locale: "en", copy: edited, question: codeQuestion, date: "2026-09-26", reviewed }))
      .rejects.toThrow(/does not reproduce the slide the gates passed/u);
  });

  it("gives a plain question four separate answer slots and no empty code panel", async () => {
    const brand = await devshark();
    const question = { ...codeQuestion, hasCode: false, en: { ...codeQuestion.en, question: "When does cleanup run?" } };
    const output = fixtureChumOutput({ brand, question, hookA: "Check your React knowledge", hookACs: "Znáte React?" });
    const copy = { slides: output.carousels.en.slides.map(slide => ({ ...slide, templateId: "" })) };
    const rendered = renderCarousel({ brand, question, copy, locale: "en" });
    expect(rendered[1]!.templateId).toBe("quiz-question-context");
    expect(rendered[1]!.truncatedSlots).toEqual([]);
    for (const letter of ["A.", "B.", "C.", "D."]) expect(rendered[1]!.svg).toContain(letter);
    expect(rendered[1]!.svg).not.toContain("code-block");
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
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true,
      call: async () => {
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        return {
          usd: 0,
          output: fixtureChumOutput({
            brand, question: plan.question,
            ...fixtureHookLines(plan, brand)
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
    // devShark writes English only (quorum#568): one carousel, one render summary, no Czech field.
    expect(built.locales).toEqual(["en"]);
    expect(built.carousels.en.slides).toHaveLength(5);
    expect(built.carousels.cs).toBeUndefined();
    expect(built.descriptions.instagram.cs).toBeUndefined();
    expect(built.render.summaryPaths).toEqual(["state/ventures/marketingshark/packages/2026-08-08/devshark/render-en.json"]);
    expect(built.spendUsd).toBe(0);

    // Package, its render summary, the draft queue items, the ledger and the channel record move
    // together or not at all.
    const ledger = await readLedger(root);
    expect(ledger.brands.devshark!.served).toHaveLength(1);
    expect(ledger.brands.devshark!.served[0]!.questionId).toBe(built.question.id);
    expect(result.artifacts.filter((artifact) => artifact.startsWith("social/queue/"))).toHaveLength(2);
    // Six state artifacts and ten frame files: a PNG and its JPEG copy for each of the five slides.
    expect(result.artifacts).toHaveLength(16);
    expect(result.artifacts.filter((artifact) => artifact.startsWith("public/social/devshark/2026-08-08/en/")).sort()).toEqual(
      [1, 2, 3, 4, 5].flatMap((slide) => [`slide-0${slide}.jpg`, `slide-0${slide}.png`]).map((name) => `public/social/devshark/2026-08-08/en/${name}`).sort()
    );

    // Every frame on disk is the one the package records, at Instagram's portrait canvas, and the
    // Instagram copy is an sRGB JPEG.
    expect(built.id).toBe("marketingshark-2026-08-08-devshark");
    expect(built.render.frames.map((frame) => [frame.locale, frame.role, frame.slide])).toEqual(
      ["hook", "context", "reveal", "why", "footer"].map((role, index) => ["en", role, index + 1])
    );
    for (const frame of built.render.frames) {
      for (const file of [frame.png, frame.jpeg]) {
        const bytes = await readFile(path.join(root, "public", file.path));
        expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
        expect(bytes.length).toBe(file.bytes);
        const meta = await sharp(bytes).metadata();
        expect([meta.width, meta.height], file.path).toEqual([1080, 1350]);
      }
      const jpeg = await sharp(await readFile(path.join(root, "public", frame.jpeg.path))).metadata();
      expect([jpeg.format, jpeg.space]).toEqual(["jpeg", "srgb"]);
    }
    // The frames are the reviewed slides: each carries the SVG hash of its render summary slide.
    const summary = JSON.parse(await readFile(path.join(root, "ventures/marketingshark/packages/2026-08-08/devshark/render-en.json"), "utf8")) as { slides: Array<{ svgHash: string }> };
    expect(built.render.frames.map((frame) => frame.svgHash)).toEqual(summary.slides.map((slide) => slide.svgHash));
    expect(result.artifacts).toContain(HOOK_CHANNELS_PATH);

    // Slide 1 is the assigned library line, and the assignment that licensed it travels with the
    // package. It was assigned for English alone.
    expect(built.hookAssignment.schemaVersion).toBe("hook-assignment/1");
    expect(built.hookAssignment.hookId).toBe(built.hooks.a.patternId);
    expect(built.hookAssignment.eligibleIds).toContain(built.hookAssignment.hookId);
    expect(built.hookAssignment.languages).toEqual(["en"]);
    expect(built.carousels.en.slides[0]!.headline).toBe(built.hooks.a.en);
    expect(built.hooks.a.cs).toBeUndefined();

    // And the channel now carries the post the cooldown will read tomorrow.
    const channels = await readHookChannels(root);
    expect(historyFor(channels, "devshark-carousel").map((post) => post.hookId))
      .toEqual([built.hookAssignment.hookId]);
  });

  it("writes nothing at all when a truth gate fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-gate-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;

    const result = await runBrandDay({
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true,
      call: async () => {
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        const output = fixtureChumOutput({
          brand, question: plan.question,
          ...fixtureHookLines(plan, brand)
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
    await expect(readdir(path.join(root, "public"))).rejects.toThrow();
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
      config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true,
      call: async (packet, attempt) => {
        packets.push(packet);
        const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
        const output = fixtureChumOutput({
          brand, question: plan.question,
          ...fixtureHookLines(plan, brand)
        });
        // Slide 1 is the library's line now, so the failure a retry has to carry back is an
        // edited hook rather than an over-long one.
        if (attempt === 1) output.carousels.en.slides[0]!.headline = "A line the studio never assigned.";
        return { usd: 0.05, output };
      }
    });

    expect(packets).toHaveLength(2);
    expect(packets[0]).not.toContain("previous answer failed");
    expect(packets[1]).toContain("[hook-verbatim] en");
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
          ...fixtureHookLines(plan, brand)
        })
      };
    };

    const first = await runBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "c1", root, publicRoot: path.join(root, "public"), dry: true, call });
    let calls = 0;
    const second = await runBrandDay({
      config, brand, ledger: first.ledger, date: "2026-08-08", cycleId: "c2", root, publicRoot: path.join(root, "public"), dry: true,
      call: async (packet, attempt) => { calls += 1; return call(); }
    });

    expect(second.outcome.status).toBe("already-served");
    // A backstop sweep on a morning that already ran must not reach the provider at all.
    expect(calls).toBe(0);
    expect(second.artifacts).toEqual([]);
    expect((await readLedger(root)).brands.devshark!.served).toHaveLength(1);
  });

  it("plans devShark on the dev vertical and hands CHUM that vertical's line", async () => {
    // The brand's tone is the vertical the studio serves slide 1 from. The assignment, its
    // channel and the packet all have to name the same one, or the line CHUM is told to copy
    // verbatim is not the line the assignment licensed.
    const config = await loadMarketingSharkConfig();
    const brand = await devshark();

    const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
    expect(plan.assignment.vertical).toBe("dev");
    expect(plan.assignment.channel).toBe("devshark-carousel");

    const lines = hookLinesFor({ hook: plan.hook, brand, question: plan.question })!;
    const topic = topicLabel(plan.question.category);
    expect(lines.en).toBe(plan.hook!.variants.dev.en.replaceAll("{topic}", topic));
    // English only: no Czech line is resolved, handed over or paid for.
    expect(lines.cs).toBeUndefined();
    const packet = buildChumPacket({
      brand, question: plan.question, hookLines: lines, hookId: plan.assignment.hookId, date: "2026-08-08"
    });
    expect(packet).toContain("tone: dev");
    expect(packet).toContain(brand.slide5.en);
    expect(packet).not.toContain(brand.slide5.cs);
    expect(packet).toContain(lines.en);

    // A brand that writes Czech gets the Czech line from the same assignment.
    const bilingual = { ...brand, locales: ["cs", "en"] as Array<"cs" | "en"> };
    expect(hookLinesFor({ hook: plan.hook, brand: bilingual, question: plan.question })!.cs)
      .toBe(plan.hook!.variants.dev.cs.replaceAll("{topic}", topic));
  });
});
