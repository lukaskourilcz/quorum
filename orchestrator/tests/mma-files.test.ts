import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, EditorialSlateSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { LocalStoreDelivery, shipArticleBacklog, type ArticleDeliveryAdapter } from "../src/mma-files/delivery.js";
import { runDryArticleProduction } from "../src/mma-files/dry-run.js";
import { articleEvidenceFor } from "../src/mma-files/live.js";
import { renderArticleHero, renderSocialVariants } from "../src/mma-files/frame.js";
import { articlePackageHash, hasValidArticlePackageHash } from "../src/mma-files/hash.js";
import { produceMmaFilesArticle, type MmaFilesEditorialGateway } from "../src/mma-files/pipeline.js";
import { buildSocialVariantPack } from "../src/mma-files/social.js";
import { loadStylebook, reviewArticleCopy, reviewBilingualParity, validateStylebook } from "../src/mma-files/style.js";
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
    { subjectRef: "ufc:event:fixture-prague", verdict: "fresh", evidenceRef: "state/ideas/mma-files/ledger.jsonl#1" },
    { subjectRef: "oktagon:eva-example", verdict: "fresh", evidenceRef: "state/ideas/mma-files/ledger.jsonl#2" }
  ]
});

const gateway: MmaFilesEditorialGateway = {
  async writeEnglish() {
    return {
      title: "Alex Example meets Sam Example in Prague",
      dek: "The verified files show two different routes through the matchup.",
      bodyMDX: "## The matchup\n\n[Alex Example](/fighters/ufc/alex-example) brings a 12-2 record. [^source-1]\n\n[Sam Example](/fighters/ufc/sam-example) brings a 10-3 record. [^source-1]",
      imageAlt: "A fixture matchup card for Alex Example and Sam Example"
    };
  },
  async localizeCzech() {
    return {
      title: "Alex Example se v Praze utká se Samem Examplem",
      dek: "Ověřené profily ukazují dvě rozdílné cesty tímto zápasem.",
      bodyMDX: "## Zápas\n\n[Alex Example](/fighters/ufc/alex-example) nastupuje s bilancí 12-2. [^source-1]\n\n[Sam Example](/fighters/ufc/sam-example) nastupuje s bilancí 10-3. [^source-1]",
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

describe("MMA Files bilingual production", () => {
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

  it("keeps the style study complete, separated by language and fragment-safe", async () => {
    const stylebook = await loadStylebook(repoRoot);
    expect(validateStylebook(stylebook)).toEqual([]);
    expect(stylebook.match(/https:\/\/www\.mmafighting\.com/g)).toHaveLength(10);
    expect(stylebook.match(/https:\/\/www\.fights\.cz/g)).toHaveLength(10);
  });

  it("publishes only when both languages, source markers and fighter links pass", async () => {
    const root = await tempRoot("mma-files-production-");
    const first = await production(root);
    const replay = await production(root);
    expect(first.article.status).toBe("published");
    expect(first.violations).toEqual([]);
    expect(hasValidArticlePackageHash(first.article)).toBe(true);
    expect(first.socialPath).toMatch(/social\/packs/);
    expect(first.mediaPaths).toHaveLength(10);
    expect(replay.idempotent).toBe(true);
    expect(replay.article.packageHash).toBe(first.article.packageHash);
    expect(await loadArticlePackages(root)).toEqual([first.article]);
  });

  it("blocks machine filler, missing citations and incomplete fighter links without a social pack", async () => {
    const root = await tempRoot("mma-files-blocked-");
    const bad: MmaFilesEditorialGateway = {
      ...gateway,
      async writeEnglish() {
        return { title: "An epic showdown", dek: "Fans are in for a treat.", bodyMDX: "> A quote with no source\n\nAlex has 14 wins.", imageAlt: "A generic fight graphic" };
      }
    };
    const result = await production(root, bad);
    expect(result.article.status).toBe("blocked");
    expect(result.socialPath).toBeNull();
    expect(result.violations.map((violation) => violation.code)).toEqual(expect.arrayContaining(["stylebook-slop", "ungrounded-claim", "missing-fighter-link"]));
  });

  it("catches Czech non-declension and requires honest recap comparison", async () => {
    const root = await tempRoot("mma-files-copy-");
    const result = await production(root);
    const article = result.article;
    const czech = structuredClone(article);
    czech.localizations.cs.bodyMDX += "\n\nMluvil s Vémola. [^source-1]";
    expect(reviewArticleCopy(czech, "cs", { mode: "data-only" }).map((item) => item.code)).toContain("czech-declension");
    czech.localizations.cs.bodyMDX = czech.localizations.cs.bodyMDX.replace("s Vémola", "s Vémolou");
    expect(reviewArticleCopy(czech, "cs", { mode: "data-only" }).map((item) => item.code)).not.toContain("czech-declension");
    const recap = structuredClone(article);
    recap.format = "post-event-recap";
    expect(reviewArticleCopy(recap, "en", { mode: "data-only" }).map((item) => item.code)).toContain("recap-honesty");
  });

  it("renders one deterministic hero and eight deterministic social slides without human imagery", async () => {
    const root = await tempRoot("mma-files-render-");
    const article = (await production(root)).article;
    const pack = buildSocialVariantPack(article);
    const first = renderSocialVariants(pack, article);
    const second = renderSocialVariants(pack, article);
    expect(first).toEqual(second);
    expect(first.map((render) => render.key)).toEqual(["A-en-01", "A-en-02", "A-cs-01", "A-cs-02", "B-en-01", "B-en-02", "B-cs-01", "B-cs-02"]);
    expect(new Set(first.map((render) => render.sha256)).size).toBe(8);
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
      image: deterministicArticleImage({ venture: "mma-files", slug, title: "Title", altEn: "Alt", altCs: "Popis" }),
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
      image: deterministicArticleImage({ venture: "mma-files", slug: "parity", title: "Title", altEn: "Alt", altCs: "Popis" }),
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
