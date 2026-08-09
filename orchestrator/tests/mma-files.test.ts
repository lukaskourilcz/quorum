import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, EditorialSlateSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { LocalStoreDelivery, shipArticleBacklog, type ArticleDeliveryAdapter } from "../src/mma-files/delivery.js";
import { runDryArticleProduction } from "../src/mma-files/dry-run.js";
import { MMA_FILES_WRITE_SYSTEM, articleEvidenceFor } from "../src/mma-files/live.js";
import { renderArticleHero, renderSocialVariants } from "../src/mma-files/frame.js";
import { articlePackageHash, hasValidArticlePackageHash } from "../src/mma-files/hash.js";
import { produceMmaFilesArticle, type MmaFilesEditorialGateway } from "../src/mma-files/pipeline.js";
import { buildSocialVariantPack } from "../src/mma-files/social.js";
import { REQUIRED_STYLEBOOK_HEADINGS, loadStylebook, reviewArticleCopy, reviewBilingualParity, stripSourceMarkers, stylebookPacket, validateStylebook } from "../src/mma-files/style.js";
import { ArticleSlotConflictError, loadArticlePackages, storeArticlePackage } from "../src/mma-files/store.js";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { repoRoot, stateRoot } from "../src/paths.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const slate = EditorialSlateSchema.parse({
  schemaVersion: "editorial-slate/1",
  date: "2026-08-01",
  slots: [
    { slot: "am", format: "fight-week-preview", subjectRefs: ["ufc:event:fixture-prague"], rationale: "The verified card is close enough for a sourced preview.", assignedWriter: "JAB", status: "assigned" },
    { slot: "pm", format: "fighter-profile", subjectRefs: ["oktagon:eva-example"], rationale: "The sourced file is complete enough for a useful profile.", assignedWriter: "QUILL", status: "assigned" }
  ],
  vaultVerdicts: [
    // Not a repository path. These two subjects are synthetic, so no file on disk backs them,
    // and the path this used to name — state/ideas/mma-files/ledger.jsonl — has never existed.
    { subjectRef: "ufc:event:fixture-prague", verdict: "fresh", evidenceRef: "FIXTURE:mma-files.test#1" },
    { subjectRef: "oktagon:eva-example", verdict: "fresh", evidenceRef: "FIXTURE:mma-files.test#2" }
  ]
});

const gateway: MmaFilesEditorialGateway = {
  async writeCzech() {
    return {
      title: "Alex Example se v Praze utká se Samem Examplem",
      dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
      // Long enough to build a real carousel. The fixture used to be two sentences, which is a
      // fine article for the copy gates and too thin for a five-slide deck, so the deck path
      // was never exercised by a test that claimed to cover article production.
      //
      // No source markers. The writer is no longer asked for one, so a fixture carrying them
      // would be testing a contract the desk stopped issuing. A writer that emits one anyway is
      // a separate case, covered in "no inline source marker survives to a reader" below.
      bodyMDX: [
        "## Zápas",
        "",
        "[Alex Example](/fighters/ufc/alex-example) nastupuje s bilancí 12-2.",
        "",
        "[Sam Example](/fighters/ufc/sam-example) nastupuje s bilancí 10-3.",
        "",
        "Oba zápasníci se v hlavním zápase potkávají poprvé a soubor u obou uvádí shodně vedenou bilanci.",
        "",
        "Rozdíl je v cestě k výsledku: jeden vítězí častěji v postoji, druhý se opírá o zemní práci.",
        "",
        "Ověřená data neuvádějí u žádného z nich zranění, které by kartu ohrozilo.",
        "",
        "Karta se koná v Praze a je to teprve druhý turnaj organizace v tomto městě."
      ].join("\n"),
      imageAlt: "Zkušební karta zápasu Alexe Examplea se Samem Examplem"
    };
  }
};

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function production(root: string, selectedGateway = gateway) {
  return produceMmaFilesArticle({
    root,
    slate,
    slot: "am",
    slug: "alex-example-meets-sam-example",
    publishAt: new Date("2026-08-01T08:00:00.000Z"),
    mode: "data-only",
    evidence: {
      sources: [{ kind: "internal", ref: "state/ventures/fightaiq/fighters/ufc/alex-example.json" }],
      fighterRefs: ["ufc:alex-example", "ufc:sam-example"],
      eventRef: "ufc:event:fixture-prague",
      heroSpec: { template: "tale-of-the-tape", bindings: { headline: "Alex Example vs Sam Example", redRecord: "12-2", blueRecord: "10-3" } },
      evidenceText: "Fixture-only evidence packet."
    },
    gateway: selectedGateway,
    stylebookRaw: await loadStylebook(repoRoot)
  });
}

describe("MMA Files article production", () => {
  it("replays a dry article slot idempotently throughout the same Prague day", async () => {
    const root = await tempRoot("mma-files-dry-replay-");
    const first = await runDryArticleProduction({
      root,
      slot: "am",
      now: new Date("2026-08-01T08:03:00.000Z")
    });
    const replay = await runDryArticleProduction({
      root,
      slot: "am",
      now: new Date("2026-08-01T16:45:00.000Z")
    });
    expect(first.article.publishAt).toBe("2026-08-01T08:00:00.000Z");
    expect(replay.idempotent).toBe(true);
    expect(replay.article.packageHash).toBe(first.article.packageHash);
  });

  it("keeps the Czech style study complete and fragment-safe", async () => {
    const stylebook = await loadStylebook(repoRoot);
    expect(validateStylebook(stylebook)).toEqual([]);
    expect(stylebook.match(/https:\/\/www\.fights\.cz/g)).toHaveLength(10);
    // The desk publishes in Czech. An English desk section sat in this file carrying its own
    // ledes, recaps and slop tells, and stylebookPacket never sliced it, so it went to no
    // writer and shaped no article while riding along in every room packet built from the file.
    expect(stylebook).not.toContain("## English desk");
    expect(stylebook.match(/https:\/\/www\.mmafighting\.com/g)).toBeNull();
  });

  it("requires every heading the Czech writer packet carries, and only those", async () => {
    const stylebook = await loadStylebook(repoRoot);
    const packet = stylebookPacket(stylebook, "cs");
    // Both directions, or the check is half a check. Asserting only required -> packet lets a
    // new section be added to the Czech desk and travel to every writer with nothing guarding
    // it: insert "### Nový nehlídaný oddíl" and the old loop stayed green while the writer
    // received a section that could be deleted again without a single failure.
    const delivered = new Set(packet.match(/^#{2,3} .+$/gmu) ?? []);
    expect(delivered).toEqual(new Set(REQUIRED_STYLEBOOK_HEADINGS));
    for (const heading of REQUIRED_STYLEBOOK_HEADINGS) {
      // And the demand has to bite. Rename the heading and the validator must say so, or the
      // section can leave the stylebook with every gate still green.
      expect(validateStylebook(stylebook.replace(heading, "### přejmenovaný oddíl")))
        .toContain(`missing:${heading}`);
    }
  });

  it("refuses a Czech packet that lost its machine-text tells", () => {
    // The tells are the one section the copy gate mirrors phrase for phrase. A stylebook that
    // still has the heading structure but not this section must not reach a writer.
    const withoutTells = "## Czech desk\n\n### Začátky článků\n\n- První věta řekne, co je nové.\n";
    expect(() => stylebookPacket(withoutTells, "cs")).toThrow(/slop-tells/u);
    expect(validateStylebook(withoutTells)).toContain("missing:### Znaky strojového textu");
    // The two shapes the guard used to wave through. It accepted the English heading "Slop
    // tells" or the bare Czech string anywhere in the packet, so a stylebook that kept the
    // deleted English desk's heading passed, and so did one that only mentions the section in
    // running prose. Neither hands a writer the phrase list, which is the whole point of it.
    const englishHeading = `${withoutTells}\n### Slop tells\n\n- Avoid the phrase “epic showdown”.\n`;
    expect(() => stylebookPacket(englishHeading, "cs")).toThrow(/slop-tells/u);
    const mentionedInProse = `${withoutTells}\n Znaky strojového textu sepíšeme příště.\n`;
    expect(() => stylebookPacket(mentionedInProse, "cs")).toThrow(/slop-tells/u);
  });

  it("publishes only when the Czech copy and the fighter links pass", async () => {
    const root = await tempRoot("mma-files-production-");
    const first = await production(root);
    const replay = await production(root);
    expect(first.article.status).toBe("published");
    expect(first.violations).toEqual([]);
    expect(hasValidArticlePackageHash(first.article)).toBe(true);
    expect(first.socialPath).toMatch(/social\/packs/);
    // Hero, thumbnail, and one Czech slide per deck position for each of the two variants.
    // The count follows the article now, so it is derived rather than restated as a literal.
    const deckSlides = (first.article.localizations.cs && buildSocialVariantPack(first.article)?.variants[0]?.carousel.cs?.content.strings) ?? {};
    const slidesPerVariant = Object.keys(deckSlides).length;
    expect(slidesPerVariant).toBeGreaterThanOrEqual(5);
    expect(slidesPerVariant).toBeLessThanOrEqual(10);
    expect(first.mediaPaths).toHaveLength(2 + slidesPerVariant * 2);
    expect(replay.idempotent).toBe(true);
    expect(replay.article.packageHash).toBe(first.article.packageHash);
    expect(await loadArticlePackages(root)).toEqual([first.article]);
  });

  it("blocks machine filler and incomplete fighter links without a social pack", async () => {
    const root = await tempRoot("mma-files-blocked-");
    const bad: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech() {
        // Czech slop, because Czech is the copy the desk now writes and the only copy reviewed.
        return { title: "Epický souboj", dek: "Fanoušci se mají na co těšit.", bodyMDX: "> Citát\n\nAlex má 14 výher.", imageAlt: "Obecná grafika k zápasu" };
      }
    };
    const result = await production(root, bad);
    expect(result.article.status).toBe("blocked");
    expect(result.socialPath).toBeNull();
    expect(result.violations.map((violation) => violation.code)).toEqual(expect.arrayContaining(["stylebook-slop", "missing-fighter-link"]));
  });

  it("catches Czech non-declension and requires honest recap comparison", async () => {
    const root = await tempRoot("mma-files-copy-");
    const result = await production(root);
    const article = result.article;
    const czech = structuredClone(article);
    czech.localizations.cs.bodyMDX += "\n\nMluvil s Vémola.";
    expect(reviewArticleCopy(czech, "cs", { mode: "data-only" }).map((item) => item.code)).toContain("czech-declension");
    czech.localizations.cs.bodyMDX = czech.localizations.cs.bodyMDX.replace("s Vémola", "s Vémolou");
    expect(reviewArticleCopy(czech, "cs", { mode: "data-only" }).map((item) => item.code)).not.toContain("czech-declension");
    const recap = structuredClone(article);
    recap.format = "post-event-recap";
    expect(reviewArticleCopy(recap, "cs", { mode: "data-only" }).map((item) => item.code)).toContain("recap-honesty");
  });

  it("renders one deterministic hero and a deterministic Czech deck without human imagery", async () => {
    const root = await tempRoot("mma-files-render-");
    const article = (await production(root)).article;
    const pack = buildSocialVariantPack(article)!;
    const first = renderSocialVariants(pack, article);
    const second = renderSocialVariants(pack, article);
    expect(first).toEqual(second);
    // Two variants of the same Czech deck, numbered in reading order.
    const perVariant = pack.variants[0]!.carousel.cs!.content.strings;
    const count = Object.keys(perVariant).length;
    expect(count).toBeGreaterThanOrEqual(5);
    expect(first.map((render) => render.key)).toEqual([
      ...Array.from({ length: count }, (_, index) => `A-cs-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: count }, (_, index) => `B-cs-${String(index + 1).padStart(2, "0")}`)
    ]);
    // A and B are two designs, not two filenames. They used to render the same bytes — every
    // deck slide declared `variants: []`, so the `variant` field the pack set was ignored — and
    // the queue shipped one byte stream twice as if it were an experiment.
    expect(new Set(first.map((render) => render.sha256)).size).toBe(count * 2);
    expect(pack.variants[0]!.captions.cs!.instagram).not.toBe(pack.variants[1]!.captions.cs!.instagram);
    expect(renderArticleHero(article)).toBe(renderArticleHero(article));
    expect(`${renderArticleHero(article)}${first.map((render) => render.svg).join("")}`).not.toMatch(/<image|generated human/iu);
  });
});

describe("MMA Files social evidence and delivery", () => {
  it("delivers the backlog in order and treats an identical replay as success", async () => {
    const sourceRoot = await tempRoot("mma-files-source-");
    const targetRoot = await tempRoot("mma-files-target-");
    const article = (await production(sourceRoot)).article;
    const adapter = new LocalStoreDelivery(targetRoot, () => new Date("2026-08-01T12:00:00.000Z"));
    const first = await shipArticleBacklog({ sourceRoot, adapter });
    const replay = await shipArticleBacklog({ sourceRoot, adapter });
    expect(first).toEqual([expect.objectContaining({ articleRef: expect.stringContaining(article.slug), idempotent: false })]);
    expect(replay).toEqual([expect.objectContaining({ idempotent: true })]);

    const mockGitHub: ArticleDeliveryAdapter = {
      id: "github-app",
      async deliver(input: ArticlePackage) {
        return { adapter: "github-app", articleRef: `mock:${input.slug}`, packageHash: input.packageHash, status: "delivered", idempotent: false, deliveredAt: "2026-08-01T12:00:00.000Z" };
      }
    };
    expect((await mockGitHub.deliver(article)).adapter).toBe("github-app");
  });
});

describe("article evidence selection", () => {
  const profileSlate = EditorialSlateSchema.parse({
    schemaVersion: "editorial-slate/1",
    date: "2026-08-02",
    slots: [
      { slot: "am", format: "fighter-profile", subjectRefs: ["ufc:valentina-shevchenko"], rationale: "The sourced file is complete enough for a useful profile.", assignedWriter: "JAB", status: "assigned" },
      { slot: "pm", format: "desk-notes", subjectRefs: ["missing:2026-08-02:pm"], rationale: "No second subject cleared the desk.", assignedWriter: "QUILL", status: "killed", killedReason: "Missing fresh, source-backed subject." }
    ],
    vaultVerdicts: [
      { subjectRef: "ufc:valentina-shevchenko", verdict: "fresh", evidenceRef: "meeting:2026-08-02-mag-editorial" },
      { subjectRef: "missing:2026-08-02:pm", verdict: "fresh", evidenceRef: "meeting:2026-08-02-mag-editorial" }
    ]
  });

  it("cites only record files, never bookkeeping that happens to name the subject", async () => {
    const evidence = await articleEvidenceFor(stateRoot, profileSlate, "am");
    expect(evidence).not.toBeNull();
    // state/mma/source-quota/cito.json is an API-quota ledger carrying a cycle's worth of
    // fighter ids. It named the subject, so it was cited as a source on a live article.
    const cited = evidence!.sources.map((source) => source.kind === "internal" ? source.ref : source.url);
    expect(cited.every((reference) => /state\/mma\/(?:fighters|bouts)\//u.test(reference))).toBe(true);
  });

  it("declares only fighters the article is about, each with a card to link to", async () => {
    const evidence = await articleEvidenceFor(stateRoot, profileSlate, "am");
    const declared = new Set(evidence!.fighterRefs);
    expect(declared.has("ufc:valentina-shevchenko")).toBe(true);
    // Every declared ref becomes a required profile link, so an id the piece never mentions
    // blocks the article. A live run declared 69, including the whole quota ledger.
    expect(evidence!.fighterRefs.length).toBeLessThanOrEqual(2 + 2 * 6);
    for (const reference of evidence!.fighterRefs) {
      expect(existsSync(path.join(stateRoot, "mma", "fighters", `${reference}.json`))).toBe(true);
    }
  });

  it("returns nothing for a killed slot", async () => {
    expect(await articleEvidenceFor(stateRoot, profileSlate, "pm")).toBeNull();
  });
});

describe("article slot immutability", () => {
  const packageFor = (status: ArticlePackage["status"], slug: string): ArticlePackage => {
    const content = {
      schemaVersion: "article/1" as const,
      slug,
      localizations: {
        en: { title: "Title", dek: "Dek", bodyMDX: "Body [source:state/mma/fighters/ufc:a.json]", imageAlt: "Alt" },
        cs: { title: "Titulek", dek: "Perex", bodyMDX: "Telo [source:state/mma/fighters/ufc:a.json]", imageAlt: "Popis" }
      },
      format: "fighter-profile" as const,
      sources: [{ kind: "internal" as const, ref: "state/mma/fighters/ufc:a.json" }],
      image: deterministicArticleImage({ venture: "mma-files", slug, title: "Title",}),
      heroSpec: { template: "fighter-file", bindings: { headline: "Headline" } },
      fighterRefs: ["ufc:a"],
      publishAt: "2026-08-02T06:00:00.000Z",
      slot: "am" as const,
      status
    };
    return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
  };

  it("lets a retry replace a blocked attempt and keeps the superseded hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-slot-"));
    roots.push(root);
    const rejected = packageFor("blocked", "first-attempt");
    await storeArticlePackage(root, rejected);
    // A blocked package used to poison its slot: after the cause was fixed, the retry aborted
    // on the rejected attempt it existed to replace, so the day could never produce anything.
    const stored = await storeArticlePackage(root, packageFor("published", "second-attempt"));
    expect(stored.idempotent).toBe(false);
    expect(stored.supersededHash).toBe(rejected.packageHash);
    const remaining = await loadArticlePackages(root);
    expect(remaining.map((entry) => entry.slug)).toEqual(["second-attempt"]);
  });

  it("still refuses to swap a published article under the same slot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-slot-"));
    roots.push(root);
    await storeArticlePackage(root, packageFor("published", "shipped"));
    await expect(storeArticlePackage(root, packageFor("published", "replacement")))
      .rejects.toBeInstanceOf(ArticleSlotConflictError);
  });
});

describe("bilingual fighter parity", () => {
  const bodyWith = (links: string) => `${links} Record 26-4-1. [source:state/mma/fighters/ufc:a.json]`;
  const withBodies = (en: string, cs: string): ArticlePackage => {
    const content = {
      schemaVersion: "article/1" as const,
      slug: "parity",
      localizations: {
        en: { title: "Title", dek: "Dek", bodyMDX: bodyWith(en), imageAlt: "Alt" },
        cs: { title: "Titulek", dek: "Perex", bodyMDX: bodyWith(cs), imageAlt: "Popis" }
      },
      format: "fighter-profile" as const,
      sources: [{ kind: "internal" as const, ref: "state/mma/fighters/ufc:a.json" }],
      image: deterministicArticleImage({ venture: "mma-files", slug: "parity", title: "Title",}),
      heroSpec: { template: "fighter-file", bindings: { headline: "Headline" } },
      fighterRefs: [],
      publishAt: "2026-08-02T06:00:00.000Z",
      slot: "am" as const,
      status: "draft" as const
    };
    return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
  };
  const codes = (en: string, cs: string) => reviewBilingualParity(withBodies(en, cs)).map(({ code }) => code);

  it("accepts a declined Czech name that points at the same profile", () => {
    // The stylebook asks HACEK to decline names naturally, and the desk's first fighter
    // profile was blocked for doing so: "Alexa Grasso" becomes "Alexu Grasso" in Czech.
    expect(codes(
      "[Alexa Grasso](/fighters/ufc/alexa-grasso)",
      "[Alexu Grasso](/fighters/ufc/alexa-grasso)"
    )).toEqual([]);
  });

  it("rejects a Czech label that names a different fighter", () => {
    expect(codes(
      "[Alexa Grasso](/fighters/ufc/alexa-grasso)",
      "[Petr Yan](/fighters/ufc/alexa-grasso)"
    )).toContain("fighter-name-parity");
  });

  it("rejects bodies that link different profiles", () => {
    expect(codes(
      "[Alexa Grasso](/fighters/ufc/alexa-grasso)",
      "[Alexa Grasso](/fighters/ufc/valentina-shevchenko)"
    )).toContain("fighter-link-parity");
  });
});

describe("bilingual figure parity", () => {
  const withBodies = (en: string, cs: string): ArticlePackage => {
    const content = {
      schemaVersion: "article/1" as const,
      slug: "figures",
      localizations: {
        en: { title: "Title", dek: "Dek", bodyMDX: `${en} [source:state/mma/fighters/ufc:a.json]`, imageAlt: "Alt" },
        cs: { title: "Titulek", dek: "Perex", bodyMDX: `${cs} [source:state/mma/fighters/ufc:a.json]`, imageAlt: "Popis" }
      },
      format: "fighter-profile" as const,
      sources: [{ kind: "internal" as const, ref: "state/mma/fighters/ufc:a.json" }],
      image: deterministicArticleImage({ venture: "mma-files", slug: "figures", title: "Title",}),
      heroSpec: { template: "fighter-file", bindings: { headline: "Headline" } },
      fighterRefs: [],
      publishAt: "2026-08-02T06:00:00.000Z",
      slot: "am" as const,
      status: "draft" as const
    };
    return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
  };
  const codes = (en: string, cs: string) => reviewBilingualParity(withBodies(en, cs)).map(({ code }) => code);

  it("reads Czech space grouping as the figure English states with a comma", () => {
    // Both bodies say the same 1,391 seconds; only the thousands separator differs.
    expect(codes("Total elapsed time was 1,391 seconds.", "Celkova delka byla 1 391 sekund.")).toEqual([]);
  });

  it("still catches a figure that only one language carries", () => {
    expect(codes("Total elapsed time was 1,391 seconds.", "Celkova delka byla 1 392 sekund.")).toContain("figure-parity");
  });

  it("does not merge two adjacent Czech numbers English never stated together", () => {
    // "14 306" is two figures unless English says 14,306, so joining on the space alone
    // would hide a real drift behind Czech typography.
    expect(codes("He fought 14 times at UFC 306.", "Bojoval 14 krat na UFC 306.")).toEqual([]);
  });
});

describe("no inline source marker survives to a reader", () => {
  it("removes the markers and the space they leave behind", () => {
    // The first published article printed the repository path mid-sentence, in both languages.
    expect(stripSourceMarkers(
      "Shevchenko holds a record of 26-4-1. [source:state/mma/fighters/ufc:valentina-shevchenko.json] The trilogy ran 18 months."
    )).toBe("Shevchenko holds a record of 26-4-1. The trilogy ran 18 months.");
  });

  it("does not leave a space before the punctuation a marker preceded", () => {
    expect(stripSourceMarkers("She won by decision [^source-2], her third title fight."))
      .toBe("She won by decision, her third title fight.");
  });

  it("leaves copy that carries no marker exactly as written", () => {
    const body = "Grasso won the first meeting at UFC 285.\n\nShevchenko took the third.";
    expect(stripSourceMarkers(body)).toBe(body);
  });

  it("does not ask the writer for one", () => {
    // The demand lived in a string literal inside the gateway call, where no test could see it.
    // It is a constant now, and this is what reads it: the instruction must not ask for a
    // marker, and must carry the rule that took its place — write only what the packet states.
    const prohibition = "Write no citations in the copy: no file paths, no [source:path] or [^source-N] markers, no footnotes, no URLs.";
    expect(MMA_FILES_WRITE_SYSTEM).toContain(prohibition);
    // The only sentence allowed to mention a marker is the one forbidding it. The instruction
    // this replaced said "Every figure and quote needs a [source:repo/path] marker".
    expect(MMA_FILES_WRITE_SYSTEM.replace(prohibition, "")).not.toMatch(/\[source|\^source-|marker/iu);
    expect(MMA_FILES_WRITE_SYSTEM).toContain("If the packet does not state something, leave it out");
  });

  it("publishes a figure that carries no marker", async () => {
    // What ungrounded-claim used to block. Every line of the fixture body states a figure and
    // none of them is decorated, which is the article the desk is now asked to write.
    const root = await tempRoot("mma-files-unmarked-");
    const result = await production(root);
    expect(result.violations).toEqual([]);
    expect(result.article.status).toBe("published");
    expect(result.article.localizations.cs.bodyMDX).toContain("bilancí 12-2");
  });

  it("clears the headline and the standfirst too, not only the body", async () => {
    const root = await tempRoot("mma-files-marked-title-");
    const marked: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech(input) {
        const draft = await gateway.writeCzech(input);
        return {
          ...draft,
          title: `${draft.title} [source:state/ventures/fightaiq/fighters/ufc/alex-example.json]`,
          dek: `${draft.dek} [^source-1]`
        };
      }
    };
    const result = await production(root, marked);
    const stored = result.article.localizations.cs;
    expect(stored.title).toBe("Alex Example se v Praze utká se Samem Examplem");
    expect(stored.dek).toBe("Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.");
    expect(result.article.status).toBe("published");
  });

  it("reviews the text that ships, not a draft the reader never sees", async () => {
    // A marker splitting a machine-written phrase hid it from the copy gate: the gate read
    // "epický [^source-1] souboj" and matched nothing, the strip then closed the gap, and the
    // reader got "epický souboj" in a package the gate had passed. Stripping before the review
    // is what closes that; the phrase is caught on the same text the store receives.
    const root = await tempRoot("mma-files-split-slop-");
    const split: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech() {
        return {
          title: "Alex Example se v Praze utká se Samem Examplem",
          dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
          bodyMDX: "[Alex Example](/fighters/ufc/alex-example) a [Sam Example](/fighters/ufc/sam-example) nastupují.\n\nJde o epický [^source-1] souboj dvou stylů.",
          imageAlt: "Zkušební karta zápasu"
        };
      }
    };
    const result = await production(root, split);
    expect(result.violations.map(({ code }) => code)).toContain("stylebook-slop");
    expect(result.article.status).toBe("blocked");
    expect(result.article.localizations.cs.bodyMDX).toContain("epický souboj");
    expect(result.article.localizations.cs.bodyMDX).not.toContain("[^source-");
  });
});

describe("what a fighter link may point at", () => {
  it("blocks a profile link the evidence packet never supplied", async () => {
    // The edition pipeline fails a write outright when the copy cites a URL that was not in the
    // packet. A profile link is the only reference MMA Files copy shows a reader, so it gets the
    // same rule: /fighters/ufc/khabib-nurmagomedov is a page this site has no record for, and
    // "every supplied ref is linked" alone said nothing about a link nobody supplied.
    const root = await tempRoot("mma-files-stray-link-");
    const stray: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech() {
        return {
          title: "Alex Example se v Praze utká se Samem Examplem",
          dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
          bodyMDX: [
            "[Alex Example](/fighters/ufc/alex-example) nastupuje s bilancí 12-2.",
            "",
            "[Sam Example](/fighters/ufc/sam-example) nastupuje s bilancí 10-3.",
            "",
            "Oba trénovali s [Khabibem Nurmagomedovem](/fighters/ufc/khabib-nurmagomedov)."
          ].join("\n"),
          imageAlt: "Zkušební karta zápasu"
        };
      }
    };
    const result = await production(root, stray);
    expect(result.article.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("unsupplied-fighter-link");
    // And the two the packet did supply are not what fired.
    expect(result.violations.map(({ message }) => message).join(" ")).toContain("khabib-nurmagomedov");
  });

  it("blocks a URL the article has no external source for", async () => {
    // The same rule as the profile link, on the other kind of reference. An MMA evidence packet
    // is made of repository records and supplies no URL, so a link out is one the writer brought
    // with it — the desk's own study list lives in the stylebook and is not an article source.
    const root = await tempRoot("mma-files-stray-url-");
    const linkedOut: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech() {
        return {
          title: "Alex Example se v Praze utká se Samem Examplem",
          dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
          bodyMDX: [
            "[Alex Example](/fighters/ufc/alex-example) nastupuje s bilancí 12-2.",
            "",
            "[Sam Example](/fighters/ufc/sam-example) nastupuje s bilancí 10-3.",
            "",
            "Podrobnosti uvádí [profil na webu](https://www.fights.cz/alex-example)."
          ].join("\n"),
          imageAlt: "Zkušební karta zápasu"
        };
      }
    };
    const result = await production(root, linkedOut);
    expect(result.article.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("unsupplied-url");
  });

  it("catches an org the parity check does not recognize", () => {
    // The parity matcher only knows ufc and oktagon because it compares two tellings of one
    // article. Here an unknown org is the whole point: a link to an org this desk does not cover
    // is a link to a page that does not exist, and a matcher restricted to two orgs skips it.
    const copy = {
      title: "T",
      dek: "D",
      bodyMDX: "[A](/fighters/ufc/alex-example) proti [B](/fighters/pfl/b-example).",
      imageAlt: "A"
    };
    const content = {
      schemaVersion: "article/1" as const,
      slug: "stray-org",
      localizations: { cs: copy },
      format: "fighter-profile" as const,
      sources: [{ kind: "internal" as const, ref: "state/mma/fighters/ufc:alex-example.json" }],
      image: deterministicArticleImage({ venture: "mma-files", slug: "stray-org", title: "T" }),
      heroSpec: { template: "fighter-file", bindings: { headline: "H" } },
      fighterRefs: ["ufc:alex-example"],
      publishAt: "2026-08-02T06:00:00.000Z",
      slot: "am" as const,
      status: "draft" as const
    };
    const article = ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
    const codes = reviewArticleCopy(article, "cs", { mode: "data-only" }).map(({ code }) => code);
    expect(codes).toContain("unsupplied-fighter-link");
    expect(codes).not.toContain("missing-fighter-link");
  });
});

describe("an article too thin for a deck", () => {
  it("publishes without a carousel rather than blocking or padding", async () => {
    // A piece that cannot fill five slides of thirty words gets no carousel. It does not get a
    // padded one — inventing a slide is how a deck starts saying things the article does not —
    // and it does not stop the article, which cleared every editorial gate on its own.
    const root = await tempRoot("mma-files-thin-");
    const thin: MmaFilesEditorialGateway = {
      ...gateway,
      async writeCzech() {
        return {
          title: "Alex Example se v Praze utká se Samem Examplem",
          dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
          bodyMDX: "## Zápas\n\n[Alex Example](/fighters/ufc/alex-example) má bilanci 12-2. [^source-1]\n\n[Sam Example](/fighters/ufc/sam-example) má bilanci 10-3. [^source-1]",
          imageAlt: "Zkušební karta zápasu"
        };
      }
    };
    const result = await production(root, thin);
    expect(result.article.status).toBe("published");
    expect(result.socialPath).toBeNull();
    expect(result.mediaPaths.filter((file) => file.includes("social-"))).toEqual([]);
  });
});
