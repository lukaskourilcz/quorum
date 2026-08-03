import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { deriveEditorialSlate } from "../src/mma-files/live.js";
import {
  ARTICLE_INDEX_PATH,
  loadArticlePackages,
  regenerateArticleIndex,
  renderArticleIndex,
  storeArticlePackage
} from "../src/mma-files/store.js";
import { stateRoot } from "../src/paths.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(prefix = "mma-slate-fallback-"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A real sourced card, copied so the test exercises the schema the desk actually reads. */
async function plantFighter(root: string, id: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(stateRoot, "mma", "fighters", `${id}.json`), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "mma", "fighters"), { recursive: true });
  await writeFile(path.join(root, "mma", "fighters", `${id}.json`), JSON.stringify({ ...raw, ...overrides }));
}

async function plantEvent(root: string, filename: string, startsAtUtc: string): Promise<string> {
  const raw = JSON.parse(await readFile(path.join(stateRoot, "mma", "events", "ufc", filename), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "mma", "events"), { recursive: true });
  await writeFile(path.join(root, "mma", "events", filename), JSON.stringify({ ...raw, startsAtUtc }));
  return raw.id as string;
}

async function plantBout(root: string, filename: string): Promise<void> {
  const raw = await readFile(path.join(stateRoot, "mma", "bouts", "ufc", filename), "utf8");
  await mkdir(path.join(root, "mma", "bouts"), { recursive: true });
  await writeFile(path.join(root, "mma", "bouts", filename), raw);
}

function packageFor(input: {
  slug: string;
  date: string;
  slot: "am" | "pm";
  fighterRefs: string[];
  title?: string;
  status?: ArticlePackage["status"];
}): ArticlePackage {
  const content = {
    schemaVersion: "article/1" as const,
    slug: input.slug,
    localizations: {
      cs: {
        title: input.title ?? "Titulek",
        dek: "Perex",
        bodyMDX: "Telo [source:state/mma/fighters/ufc:a.json]",
        imageAlt: "Popis"
      }
    },
    format: "fighter-profile" as const,
    sources: [{ kind: "internal" as const, ref: "state/mma/fighters/ufc:a.json" }],
    image: deterministicArticleImage({ venture: "mma-files", slug: input.slug, title: "Titulek" }),
    heroSpec: { template: "fighter-file", bindings: { headline: "Headline" } },
    fighterRefs: input.fighterRefs,
    publishAt: `${input.date}T06:00:00.000Z`,
    slot: input.slot,
    status: input.status ?? "published"
  };
  return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
}

describe("editorial slate derived from the records on disk", () => {
  // mag-editorial never ran on 3 August, so no slate was written and both article slots died
  // with missing_editorial_slate. MMA Files published nothing that day while 92 sourced fighter
  // files sat on disk.
  it("assigns both slots from sourced fighter files when no slate exists", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    await plantFighter(root, "ufc:aleksandar-rakic", { completeness: 0.7 });

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));

    expect(slate).not.toBeNull();
    expect(slate!.date).toBe("2026-08-03");
    expect(slate!.slots.map((slot) => [slot.slot, slot.status, slot.format, slot.subjectRefs[0]])).toEqual([
      ["am", "assigned", "fighter-profile", "oktagon:gustavo-lopez"],
      ["pm", "assigned", "fighter-profile", "ufc:aleksandar-rakic"]
    ]);
    // No room sat, so no verdict may cite one. The evidence is the record the subject was read
    // from, which is a file a reviewer can open.
    expect(slate!.vaultVerdicts.map((verdict) => verdict.evidenceRef)).toEqual([
      "state/mma/fighters/oktagon:gustavo-lopez.json",
      "state/mma/fighters/ufc:aleksandar-rakic.json"
    ]);
  });

  it("prefers the nearest verified card inside the fight-week window, as the desk does", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    const eventId = await plantEvent(root, "ufc-330-makhachev-vs-machado-garry.json", "2026-08-04T00:00:00.000Z");
    await plantBout(root, "ufc-ufc-330-makhachev-vs-machado-garry-bout-islam-makhachev-vs-ian-machado-garry-1.json");

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));

    expect(slate!.slots[0].format).toBe("fight-week-preview");
    expect(slate!.slots[0].subjectRefs).toEqual([eventId]);
    expect(slate!.slots[1].subjectRefs).toEqual(["oktagon:gustavo-lopez"]);
  });

  it("skips a card with no bout records rather than handing the slot an unwritable subject", async () => {
    // articleEvidenceFor builds an event's packet from the bout records that name it, so a card
    // with none produces no packet: assigning it would kill the slot on missing_sourced_subject
    // while a profileable fighter file sat right next to it.
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    await plantEvent(root, "ufc-330-makhachev-vs-machado-garry.json", "2026-08-04T00:00:00.000Z");

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));

    expect(slate!.slots[0].format).toBe("fighter-profile");
    expect(slate!.slots[0].subjectRefs).toEqual(["oktagon:gustavo-lopez"]);
  });

  it("never re-assigns a subject a stored article already covered", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    await plantFighter(root, "ufc:aleksandar-rakic", { completeness: 0.7 });
    // The declared refs are the covered set, not just the headline subject — the same rule
    // mag-editorial applies, so the two paths cannot disagree about what is still fresh.
    await storeArticlePackage(root, packageFor({
      slug: "oktagon-gustavo-lopez",
      date: "2026-08-02",
      slot: "am",
      fighterRefs: ["oktagon:gustavo-lopez"]
    }));

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));

    expect(slate!.slots[0].subjectRefs).toEqual(["ufc:aleksandar-rakic"]);
    expect(slate!.slots[1].status).toBe("killed");
    expect(slate!.slots[1].killedReason).toBe("No source-backed subject left on file.");
  });

  it("reports no subject rather than inventing one when nothing on file qualifies", async () => {
    const empty = await tempRoot();
    expect(await deriveEditorialSlate(empty, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"))).toBeNull();

    // A card with no bout history is a stub. It has sources, so a laxer rule would profile a
    // fighter the article has nothing to say about.
    const stubs = await tempRoot();
    await plantFighter(stubs, "oktagon:gustavo-lopez", { history: [] });
    expect(await deriveEditorialSlate(stubs, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"))).toBeNull();
  });
});

describe("published-article index", () => {
  // composePortfolioContext loads ventures/mma-files/articles/INDEX.md into both magazine rooms
  // as the record of what has already run, and nothing ever wrote the file: the rooms were told
  // the desk had never published anything, so a subject could be assigned twice.
  it("writes every stored package into the index the magazine rooms read", async () => {
    const root = await tempRoot("mma-article-index-");
    await storeArticlePackage(root, packageFor({
      slug: "ufc-valentina-shevchenko",
      date: "2026-08-02",
      slot: "am",
      fighterRefs: ["ufc:valentina-shevchenko", "ufc:alexa-grasso"],
      title: "Valentina Shevchenko: tri zapasy s Grasso"
    }));
    await storeArticlePackage(root, packageFor({
      slug: "oktagon-karlos-vemola",
      date: "2026-08-03",
      slot: "pm",
      fighterRefs: ["oktagon:karlos-vemola"],
      title: "Karlos Vemola"
    }));

    const written = await regenerateArticleIndex(root);
    const index = await readFile(path.join(root, ARTICLE_INDEX_PATH), "utf8");

    expect(written).toBe(ARTICLE_INDEX_PATH);
    expect(index).toContain("ufc:valentina-shevchenko ufc:alexa-grasso");
    expect(index).toContain("oktagon:karlos-vemola");
    expect(index).toContain("Articles on file: 2. Rows shown: 2.");
    // Newest first: a repeat is nearly always a repeat of something recent.
    expect(index.indexOf("2026-08-03")).toBeLessThan(index.indexOf("2026-08-02"));
    // The index lives in the package directory, so the loader must keep ignoring it.
    expect((await loadArticlePackages(root)).map((article) => article.slug))
      .toEqual(["ufc-valentina-shevchenko", "oktagon-karlos-vemola"]);
  });

  it("stays inside its share of the room packet as the archive grows", async () => {
    const base = packageFor({ slug: "subject", date: "2026-08-02", slot: "am", fighterRefs: ["ufc:a"] });
    const many = Array.from({ length: 400 }, (_, index) => ({
      ...base,
      publishAt: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}T06:00:00.000Z`,
      localizations: { cs: { ...base.localizations.cs, title: `Clanek ${index} o ceskem MMA a jeho zapasnicich` } },
      fighterRefs: Array.from({ length: 12 }, (_, ref) => `ufc:fighter-${index}-${ref}`)
    }));

    const rendered = renderArticleIndex(many);

    // The magazine packet is capped at 18,000 characters and also carries the stylebook, the
    // bridge and the day's slate; an unbounded index would evict them one article at a time.
    expect(rendered.length).toBeLessThanOrEqual(6_000);
    expect(rendered).toContain("Articles on file: 400.");
    expect(rendered).toContain("| Published | Slot | Status | Format | Czech title | Subjects covered |");
  });

  it("keeps a Czech title from breaking the table it sits in", () => {
    const article = packageFor({ slug: "pipes", date: "2026-08-02", slot: "am", fighterRefs: ["ufc:a"], title: "Vemola | Pesta" });
    const row = renderArticleIndex([article]).split("\n").find((line) => line.includes("Vemola"))!;
    expect(row.split("|")).toHaveLength(8);
    expect(row).toContain("Vemola / Pesta");
  });
});
