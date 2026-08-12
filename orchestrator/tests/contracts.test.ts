import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import { repoRoot } from "../src/paths.js";
import { AudienceSpecSchema } from "../src/contracts/audience-spec.js";
import { BOOK_KB_SCORE_AXES, BookKbIndexSchema } from "../src/contracts/book-kb-index.js";
import { ContractSchemas, jsonSchemaText, type ContractName } from "../src/contracts/json-schema.js";
import { MarketingPlanSchema } from "../src/contracts/marketing-plan.js";
import { SeasonFileSchema } from "../src/contracts/season.js";
import { StyleProfileSchema } from "../src/contracts/style-profile.js";
import { hasValidArticlePackageHash } from "../src/mma-files/hash.js";
import { isRepoPathEvidenceRef } from "../src/mma-files/slate-evidence.js";
import { ArticlePackageSchema } from "../src/contracts/mma-files.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { VentureRegistrySchema } from "../src/contracts/venture-registry.js";
import { BhCycleSchema } from "../src/contracts/bh-cycle.js";
import { BhSeedLibrarySchema } from "../src/contracts/bh-seed.js";
import { BhShortlistSchema } from "../src/contracts/bh-shortlist.js";

const contractNames = Object.keys(ContractSchemas) as ContractName[];

async function fixture(name: ContractName, kind: "valid" | "poison") {
  const source = await readFile(path.join(repoRoot, "contracts", "fixtures", `${name}.${kind}.json`), "utf8");
  return JSON.parse(source) as unknown;
}

describe("published contracts", () => {
  it.each(contractNames)("accepts the %s golden fixture", async (name) => {
    expect(ContractSchemas[name].safeParse(await fixture(name, "valid")).success).toBe(true);
  });

  it.each(contractNames)("rejects the %s poison fixture", async (name) => {
    expect(ContractSchemas[name].safeParse(await fixture(name, "poison")).success).toBe(false);
  });

  it.each(contractNames)("keeps the committed %s JSON Schema current", async (name) => {
    const committed = await readFile(path.join(repoRoot, "contracts", `${name}.schema.json`), "utf8");
    expect(committed).toBe(jsonSchemaText(name));
  });

  // A dry mag-editorial room copies this fixture into the slate it writes, so any path the
  // fixture names is republished as the desk's own cited evidence. Both verdicts cited
  // state/ideas/mma-files/ledger.jsonl, a file this repository has never held, and the copy
  // reached state/ventures/mma-files/slates/2026-08-01.json. A verdict either names a file a
  // reviewer can open or does not look like a file at all.
  it("cites no missing file in the editorial-slate fixture", async () => {
    const slate = await fixture("editorial-slate", "valid") as {
      vaultVerdicts: ReadonlyArray<{ evidenceRef: string }>;
    };
    const repoPaths = slate.vaultVerdicts
      .map((verdict) => verdict.evidenceRef)
      // The same predicate the writer uses to decide which refs it has to resolve, so the fixture
      // cannot be judged by a looser rule than the slates the fixture is copied into.
      .filter((reference) => isRepoPathEvidenceRef(reference));
    expect(repoPaths.filter((reference) => !existsSync(path.join(repoRoot, reference.split("#")[0]!))))
      .toEqual([]);
  });
});

describe("portfolio contract boundaries", () => {
  it("keeps BOOKSOFHISTORY seeds cheap, prior-labelled and admin-only for cover references", async () => {
    const valid = await fixture("bh-seed", "valid") as {
      books: Array<Record<string, unknown> & {
        recognition: Record<string, unknown>;
        coverRef?: Record<string, unknown>;
      }>;
    };
    expect(BhSeedLibrarySchema.safeParse(valid).success).toBe(true);
    expect(valid.books[0]?.recognition.kind).toBe("prior");
    expect(valid.books[0]?.coverRef?.visibility).toBe("admin-only");

    for (const mutate of [
      (book: Record<string, unknown>) => { book.dossier = { claims: [] }; },
      (book: Record<string, unknown>) => { book.biography = "researched life story"; },
      (book: Record<string, unknown>) => { book.recognition = 87; },
      (book: Record<string, unknown>) => {
        book.coverRef = { url: "https://example.invalid/cover", visibility: "public" };
      }
    ]) {
      const poison = structuredClone(valid);
      mutate(poison.books[0]!);
      expect(BhSeedLibrarySchema.safeParse(poison).success).toBe(false);
    }
  });

  it("keeps shortlist ranks unique, sequential and tied to recorded factor breakdowns", async () => {
    const valid = await fixture("bh-shortlist", "valid") as { entries: Array<Record<string, unknown>> };
    expect(BhShortlistSchema.safeParse(valid).success).toBe(true);
    const duplicated = structuredClone(valid);
    duplicated.entries.push({ ...duplicated.entries[0], rank: 2 });
    expect(BhShortlistSchema.safeParse(duplicated).success).toBe(false);
  });

  it("keeps the BOOKSOFHISTORY cycle ordered, unique and free of skipped days", async () => {
    const valid = await fixture("bh-cycle", "valid") as {
      dayStatuses: Record<string, string>;
      candidateSet: Array<{ candidateId: string }>;
      chosenStory: { candidateId: string; dossierRef: string; storyRef: string } | null;
    };
    expect(BhCycleSchema.safeParse(valid).success).toBe(true);

    const skipped = structuredClone(valid);
    skipped.dayStatuses.research = "skipped";
    expect(BhCycleSchema.safeParse(skipped).success).toBe(false);

    const duplicate = structuredClone(valid);
    duplicate.candidateSet.push(duplicate.candidateSet[0]!);
    expect(BhCycleSchema.safeParse(duplicate).success).toBe(false);

    const foreignStory = structuredClone(valid);
    foreignStory.chosenStory = { ...foreignStory.chosenStory!, candidateId: "another-cycle" };
    expect(BhCycleSchema.safeParse(foreignStory).success).toBe(false);
  });

  it("accepts a bh-desk record and rejects an unregistered BOOKSOFHISTORY phase", async () => {
    const readBhFixture = async (kind: "valid" | "poison") => JSON.parse(await readFile(
      path.join(repoRoot, "contracts", "fixtures", `meeting-record-bh-desk.${kind}.json`),
      "utf8"
    )) as unknown;
    expect(MeetingRecordSchema.safeParse(await readBhFixture("valid")).success).toBe(true);
    expect(MeetingRecordSchema.safeParse(await readBhFixture("poison")).success).toBe(false);
  });

  it("accepts a ts-desk record and rejects an unregistered Tehdejsi svet phase", async () => {
    const readTsFixture = async (kind: "valid" | "poison") => JSON.parse(await readFile(
      path.join(repoRoot, "contracts", "fixtures", `meeting-record-ts-desk.${kind}.json`),
      "utf8"
    )) as unknown;
    expect(MeetingRecordSchema.safeParse(await readTsFixture("valid")).success).toBe(true);
    expect(MeetingRecordSchema.safeParse(await readTsFixture("poison")).success).toBe(false);
  });

  it("accepts the BOOKSOFHISTORY registry vocabulary and keeps every list closed", async () => {
    const valid = await fixture("venture-registry", "valid") as {
      ventures: Array<{
        growth_objective: { components: string[] };
        adminTabs: string[];
        meetings: Array<{ cast: string[] }>;
      }>;
    };
    expect(VentureRegistrySchema.safeParse(valid).success).toBe(true);

    const books = valid.ventures.find((venture) => venture.growth_objective.components.includes("feature-cadence"));
    expect(books).toBeDefined();
    for (const mutate of [
      (venture: NonNullable<typeof books>) => { venture.growth_objective.components = ["audience-growth"]; },
      (venture: NonNullable<typeof books>) => { venture.adminTabs = ["storefront"]; },
      (venture: NonNullable<typeof books>) => { venture.meetings[0]!.cast = ["COVER_ARTIST"]; }
    ]) {
      const poison = structuredClone(valid);
      const target = poison.ventures.find((venture) => venture.growth_objective.components.includes("feature-cadence"))!;
      mutate(target);
      expect(VentureRegistrySchema.safeParse(poison).success).toBe(false);
    }
  });

  it("keeps the public book index derivative-only and scores every required axis", async () => {
    const valid = await fixture("book-kb-index", "valid") as {
      chunks: Array<{ scores: Record<string, unknown> }>;
    };
    const parsed = BookKbIndexSchema.parse(valid);
    expect(Object.keys(parsed.chunks[0]!.scores)).toEqual(BOOK_KB_SCORE_AXES);

    expect(BookKbIndexSchema.safeParse({ ...valid, fullText: "synthetic but still forbidden" }).success).toBe(false);
    const chunkWithText = structuredClone(valid) as {
      chunks: Array<Record<string, unknown>>;
    };
    chunkWithText.chunks[0]!.fullText = "synthetic but still forbidden";
    expect(BookKbIndexSchema.safeParse(chunkWithText).success).toBe(false);

    const missingAxis = structuredClone(valid) as {
      chunks: Array<{ scores: Record<string, unknown> }>;
    };
    delete missingAxis.chunks[0]!.scores.bookCuriosityPotential;
    expect(BookKbIndexSchema.safeParse(missingAxis).success).toBe(false);
  });

  it("caps public style exemplars and stores only private embedding references", async () => {
    const valid = await fixture("style-profile", "valid") as {
      exemplarBank: Array<Record<string, unknown>>;
    };
    const exemplar = valid.exemplarBank[0]!;
    const atLimit = structuredClone(valid);
    atLimit.exemplarBank = Array.from({ length: 40 }, (_, index) => ({
      ...exemplar,
      id: `fixture-exemplar-${index + 1}`,
      text: "x".repeat(280),
      embeddingId: `fixture-embedding-${index + 1}`
    }));
    expect(StyleProfileSchema.safeParse(atLimit).success).toBe(true);

    const tooMany = structuredClone(atLimit);
    tooMany.exemplarBank.push({
      ...exemplar,
      id: "fixture-exemplar-41",
      embeddingId: "fixture-embedding-41"
    });
    expect(StyleProfileSchema.safeParse(tooMany).success).toBe(false);

    const tooLong = structuredClone(valid);
    tooLong.exemplarBank[0]!.text = "x".repeat(281);
    expect(StyleProfileSchema.safeParse(tooLong).success).toBe(false);

    const leakedVector = structuredClone(valid);
    leakedVector.exemplarBank[0]!.embedding = [0.1, 0.2, 0.3];
    expect(StyleProfileSchema.safeParse(leakedVector).success).toBe(false);
  });

  it("enforces the adult audience floor and public interest list", async () => {
    const valid = await fixture("audience-spec", "valid") as Record<string, unknown>;
    expect(AudienceSpecSchema.safeParse(valid).success).toBe(true);

    const underage = structuredClone(valid) as { ageRange: { min: number } };
    underage.ageRange.min = 17;
    expect(AudienceSpecSchema.safeParse(underage).success).toBe(false);

    const unknownInterest = structuredClone(valid) as { interests: string[] };
    unknownInterest.interests = ["personal-uploaded-customer-list"];
    expect(AudienceSpecSchema.safeParse(unknownInterest).success).toBe(false);
  });

  it("requires exactly four season products", async () => {
    const valid = await fixture("season", "valid") as { products: unknown[] };
    expect(SeasonFileSchema.safeParse(valid).success).toBe(true);
    expect(SeasonFileSchema.safeParse({ ...valid, products: valid.products.slice(0, 3) }).success).toBe(false);
    expect(SeasonFileSchema.safeParse({ ...valid, products: [...valid.products, valid.products[0]] }).success).toBe(false);
  });

  it("labels every marketing cost as an estimate", async () => {
    const valid = await fixture("marketing-plan", "valid") as {
      tactics: Array<Record<string, unknown>>;
    };
    expect(MarketingPlanSchema.safeParse(valid).success).toBe(true);
    const unlabeled = structuredClone(valid);
    delete unlabeled.tactics[0]?.estimate;
    expect(MarketingPlanSchema.safeParse(unlabeled).success).toBe(false);
  });
});

describe("Czech is the required locale and English is optional", () => {
  it("records Door Money summaries in English without weakening the Czech article contract", async () => {
    const summary = buildCarouselSummary({
      venture: "door-money",
      slug: "synthetic-tour-note",
      date: "2026-08-06",
      title: "A synthetic tour note",
      dek: "An invented standfirst for a contract boundary test.",
      points: [
        "The fictional crew checked a made-up room before doors.",
        "A synthetic checklist kept the example self-contained.",
        "No real person, venue, book passage, or event appears here."
      ]
    });
    expect(summary.locale).toBe("en");

    const valid = await fixture("article", "valid") as { localizations: Record<string, unknown> };
    const englishOnly = {
      ...valid,
      localizations: { en: valid.localizations.en ?? valid.localizations.cs }
    };
    const result = ArticlePackageSchema.safeParse(englishOnly);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join(".")))
      .toEqual(["localizations.cs"]);
  });

  it("keeps the three sealed packages byte-for-byte shaped and hash-valid", async () => {
    // The worst failure mode available here: if making en optional had switched these to a
    // stripping object, loading the one live article would drop its English half, the
    // recomputed hash would not match, and store.ts would throw on every future cycle —
    // wedging MMA delivery permanently. openObject is z.looseObject precisely to prevent that.
    const sealed = [
      "2026-08-02-am-ufc-valentina-shevchenko.json",
      "2026-08-04-am-oktagon-gustavo-lopez.json",
      "2026-08-05-am-ufc-event-ufc-fight-night-gamrot-vs-salkilld.json"
    ];
    for (const filename of sealed) {
      const stored = JSON.parse(
        await readFile(path.join(repoRoot, "state/ventures/mma-files/articles", filename), "utf8")
      ) as unknown;
      const parsed = ArticlePackageSchema.parse(stored);
      expect(parsed, `${filename} retains every stored field`).toEqual(stored);
      if ((stored as { localizations?: { en?: unknown } }).localizations?.en) {
        expect(parsed.localizations.en, `${filename} keeps its English half`).toBeDefined();
      }
      expect(parsed.organization, `${filename} predates the additive field`).toBeUndefined();
      expect(hasValidArticlePackageHash(parsed), `${filename} still hashes to its stored value`).toBe(true);
    }
  });

  it("round-trips article packages with and without organization and rejects a contradiction", async () => {
    const valid = await fixture("article", "valid") as Record<string, unknown>;
    expect(ArticlePackageSchema.parse(valid).organization).toBe("ufc");

    const historical = structuredClone(valid);
    delete historical.organization;
    expect(ArticlePackageSchema.parse(historical)).toEqual(historical);

    const contradiction = { ...valid, organization: "oktagon" };
    const parsed = ArticlePackageSchema.safeParse(contradiction);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")))
      .toContain("organization");
  });

  it("accepts an article with no English at all", async () => {
    const valid = await fixture("article", "valid") as { localizations: Record<string, unknown> };
    const czechOnly = { ...valid, localizations: { cs: valid.localizations.cs } };
    expect(ArticlePackageSchema.safeParse(czechOnly).success).toBe(true);
  });

  it("still refuses an article with no Czech, and for that reason alone", async () => {
    const poison = await fixture("article", "poison");
    const result = ArticlePackageSchema.safeParse(poison);
    expect(result.success).toBe(false);
    // The fixture used to be missing its image too, so it went on passing this test while no
    // longer testing the invariant its slug names.
    const reasons = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(reasons).toEqual(["localizations.cs"]);
  });
});
