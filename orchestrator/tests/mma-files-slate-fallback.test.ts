import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticlePackageSchema, EditorialSlateSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { buildCalendarFeed, loadArticleSlotOutcomes, mondayOfWeek } from "../src/meetings/calendar.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import {
  ARTICLE_INDEX_PATH,
  loadArticlePackages,
  regenerateArticleIndex,
  renderArticleIndex,
  storeArticlePackage
} from "../src/mma-files/store.js";

// `runLiveArticleProduction` reads and writes the one module-level `stateRoot`, so the only way
// to drive it against fixtures is to move that root. repoRoot and configRoot stay real: the
// evidence packet's source refs are computed relative to repoRoot, the stylebook is read from
// there, and the venture agent controls the function loads first live under configRoot.
vi.mock("../src/paths.js", async () => {
  const { mkdtempSync } = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const actual = await vi.importActual<typeof import("../src/paths.js")>("../src/paths.js");
  return { ...actual, stateRoot: mkdtempSync(nodePath.join(nodeOs.tmpdir(), "mma-live-state-")) };
});

// Both ways of finding a photograph reach the public internet before the article is written:
// an event subject fans out to Openverse and Wikimedia, and a fighter subject reads their
// Wikidata item and then the Commons file it names. `plantFighter` copies real cards, which
// carry real wikidataIds, so the second one would fire on every case here. Nothing about the run
// record depends on what either returns, so both answer "no photograph" rather than making the
// suite depend on public APIs. `candidatesNaming` stays real and filters an empty list to an
// empty list; `materializeLicensedPhoto` is never reached, so the article carries the FRAME hero.
vi.mock("../src/images/licensed.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/licensed.js")>("../src/images/licensed.js");
  return { ...actual, discoverLicensedPhotos: async () => ({ candidates: [], skippedProviders: [] }) };
});

vi.mock("../src/images/fighter-photo.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/fighter-photo.js")>("../src/images/fighter-photo.js");
  return { ...actual, fighterIdentityPhoto: async () => null };
});

// The model call is the one step that cannot run in a test: it is billed, and
// `runLiveArticleProduction` builds its own gateway, so there is no seam to pass a stub in
// through. Only the gateway is replaced. The stylebook load, the style gate, the package hash,
// the store and the media write all run for real, because the order those happen in is the
// thing under test.
vi.mock("../src/mma-files/pipeline.js", async () => {
  const actual = await vi.importActual<typeof import("../src/mma-files/pipeline.js")>("../src/mma-files/pipeline.js");
  return {
    ...actual,
    produceMmaFilesArticle: (input: Parameters<typeof actual.produceMmaFilesArticle>[0]) => actual.produceMmaFilesArticle({
      ...input,
      gateway: {
        // Copy the style gate passes: no figure, so no line needs a source marker, and every
        // fighter the packet declares carries the /fighters/org/slug link the gate requires.
        // Anything it rejected would store a "blocked" package instead of a published one.
        writeCzech: async ({ evidence }) => ({
          title: "Profil zápasníka pro dnešní vydání",
          dek: "Redakční poznámka k dnešnímu profilu.",
          bodyMDX: evidence.fighterRefs
            .map((reference) => {
              const [org, slug] = reference.split(":");
              return `Karta zápasníka: [karta](/fighters/${org}/${slug})`;
            })
            .join("\n\n"),
          imageAlt: "Redakční ilustrace k profilu zápasníka."
        })
      }
    })
  };
});

const { deriveEditorialSlate, runLiveArticleProduction, SINGLE_SLOT_CADENCE } = await import("../src/mma-files/live.js");
const { repoRoot, stateRoot: liveStateRoot } = await import("../src/paths.js");
const realStateRoot = path.join(repoRoot, "state");

afterAll(async () => rm(liveStateRoot, { recursive: true, force: true }));

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(prefix = "mma-slate-fallback-"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A real sourced card, copied so the test exercises the schema the desk actually reads. */
async function plantFighter(root: string, id: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(realStateRoot, "mma", "fighters", `${id}.json`), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "mma", "fighters"), { recursive: true });
  await writeFile(path.join(root, "mma", "fighters", `${id}.json`), JSON.stringify({ ...raw, ...overrides }));
}

async function plantEvent(root: string, filename: string, startsAtUtc: string): Promise<string> {
  const raw = JSON.parse(await readFile(path.join(realStateRoot, "mma", "events", "ufc", filename), "utf8")) as Record<string, unknown>;
  await mkdir(path.join(root, "mma", "events"), { recursive: true });
  await writeFile(path.join(root, "mma", "events", filename), JSON.stringify({ ...raw, startsAtUtc }));
  return raw.id as string;
}

async function plantBout(root: string, filename: string): Promise<void> {
  const raw = await readFile(path.join(realStateRoot, "mma", "bouts", "ufc", filename), "utf8");
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
  it("assigns the day's slot from sourced fighter files when no slate exists", async () => {
    const root = await tempRoot();
    await plantFighter(root, "oktagon:gustavo-lopez", { completeness: 0.9 });
    await plantFighter(root, "ufc:aleksandar-rakic", { completeness: 0.7 });

    const slate = await deriveEditorialSlate(root, "2026-08-03", new Date("2026-08-03T08:00:00.000Z"));

    expect(slate).not.toBeNull();
    expect(slate!.date).toBe("2026-08-03");
    // One article a day. The schema keeps both slots so every stored slate still parses, and
    // pm carries the reason it is not scheduled rather than a reason the desk found nothing.
    expect(slate!.slots.map((slot) => [slot.slot, slot.status, slot.format, slot.subjectRefs[0]])).toEqual([
      ["am", "assigned", "fighter-profile", "oktagon:gustavo-lopez"],
      ["pm", "killed", "desk-notes", "missing:2026-08-03:pm"]
    ]);
    expect(slate!.slots[1]!.killedReason).toBe(SINGLE_SLOT_CADENCE);
    // No room sat, so no verdict may cite one. The evidence is the record the subject was read
    // from, which is a file a reviewer can open.
    expect(slate!.vaultVerdicts.map((verdict) => verdict.evidenceRef)).toEqual([
      "state/mma/fighters/oktagon:gustavo-lopez.json",
      "state/mma/fighters"
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
    expect(slate!.slots[1].killedReason).toBe(SINGLE_SLOT_CADENCE);
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
    expect(slate!.slots[1].killedReason).toBe(SINGLE_SLOT_CADENCE);
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

const SUBJECT_REF = "oktagon:gustavo-lopez";

/** The Prague day the run record is keyed by, which is the desk's timezone and not UTC. */
function pragueDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function plantSlate(root: string, date: string, subjectRef: string): Promise<void> {
  const slate = EditorialSlateSchema.parse({
    schemaVersion: "editorial-slate/1",
    date,
    slots: [
      { slot: "am", format: "fighter-profile", subjectRefs: [subjectRef], rationale: "Test assignment.", assignedWriter: "JAB", status: "assigned" },
      { slot: "pm", format: "desk-notes", subjectRefs: [`missing:${date}:pm`], rationale: "Nothing left on file.", assignedWriter: "QUILL", status: "killed", killedReason: "No source-backed subject left on file." }
    ],
    vaultVerdicts: [
      { subjectRef, verdict: "fresh", evidenceRef: `state/mma/fighters/${subjectRef}.json` },
      { subjectRef: `missing:${date}:pm`, verdict: "repeat", evidenceRef: "state/mma/fighters" }
    ]
  });
  await mkdir(path.join(root, "ventures", "mma-files", "slates"), { recursive: true });
  await writeFile(path.join(root, "ventures", "mma-files", "slates", `${date}.json`), JSON.stringify(slate));
}

/**
 * Break a step that runs after the package is stored, without touching the store itself.
 *
 * `produceMmaFilesArticle` stores the package and then calls `storeArticleMedia`, which creates
 * `ventures/mma-files/media/<date>-<slot>-<slug>` before writing the hero and the thumbnail. A
 * plain file where that directory has to go makes the mkdir fail, so the throw is a real one
 * from a real post-store step rather than a stub pretending to be one.
 */
async function trapMediaWrites(root: string): Promise<void> {
  await mkdir(path.join(root, "ventures", "mma-files"), { recursive: true });
  await writeFile(path.join(root, "ventures", "mma-files", "media"), "not a directory");
}

describe("a throw after the article package is stored", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await rm(liveStateRoot, { recursive: true, force: true });
    await mkdir(liveStateRoot, { recursive: true });
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  // The catch in runLiveArticleProduction is wider than the point of no return: the package is
  // stored part-way through produceMmaFilesArticle, and the social pack, the media files and the
  // public social queue are written after it. Every one of those throws used to become a run
  // record of status "killed" while the finished article sat in ventures/mma-files/articles, and
  // that record is the only thing the public calendar reads for this slot.
  it("keeps the run record on the stored article rather than calling the slot killed", async () => {
    // 10:00 in Prague, which is the am slot's own hour.
    const now = new Date("2026-08-05T08:00:00.000Z");
    const date = pragueDate(now);
    await plantFighter(liveStateRoot, SUBJECT_REF, { completeness: 0.9 });
    await plantSlate(liveStateRoot, date, SUBJECT_REF);
    await trapMediaWrites(liveStateRoot);

    const result = await runLiveArticleProduction({ cycleId: "test-cycle", slot: "am", now });

    const stored = await loadArticlePackages(liveStateRoot);
    expect(stored.map((article) => article.status)).toEqual(["published"]);
    const record = JSON.parse(await readFile(path.join(liveStateRoot, "ventures", "mma-files", "runs", `${date}-am.json`), "utf8"));
    expect(record.status).toBe("published");
    expect(record.articleRef).toBe(stored[0]!.packageHash);
    // The failure is still on the record. Losing it would be the opposite mistake: a slot that
    // published, with no trace of the media files it never wrote.
    expect(record.reason).toBe("article_production_failed");
    expect(record.detail).toContain("media");
    expect(warn).toHaveBeenCalled();
    expect(result.status).toBe("published");
    expect(result.artifacts).toContain(`ventures/mma-files/articles/${date}-am-oktagon-gustavo-lopez.json`);
    // What the public calendar shows for this slot is decided by that record and nothing else.
    const feed = buildCalendarFeed({
      weekOf: mondayOfWeek(date),
      records: [],
      articleSlots: await loadArticleSlotOutcomes(liveStateRoot),
      now
    });
    // The article slot is a step of the MMA Files day, so the day's row is where its run shows.
    const slot = feed.slots.find((entry) => entry.kind === "mma-day" && pragueDate(new Date(entry.at)) === date);
    expect(slot?.status).toBe("held");
  });

  it("looks for the package under the date the store filed it by, not the run's Prague date", async () => {
    // storeArticlePackage names the file from publishAt in UTC; the run record is keyed by the
    // Prague date. Prague runs an hour or two ahead of UTC, so a run late enough in the UTC
    // evening is filed under one day and recorded under the next, and a lookup built from the
    // run's own date would miss the package and call the slot killed.
    const now = new Date("2026-08-05T22:30:00.000Z");
    const date = pragueDate(now);
    expect(date).toBe("2026-08-06");
    await plantFighter(liveStateRoot, SUBJECT_REF, { completeness: 0.9 });
    await plantSlate(liveStateRoot, date, SUBJECT_REF);
    await trapMediaWrites(liveStateRoot);

    const result = await runLiveArticleProduction({ cycleId: "test-cycle", slot: "am", now });

    expect((await readdir(path.join(liveStateRoot, "ventures", "mma-files", "articles"))).filter((name) => name.endsWith(".json")))
      .toEqual(["2026-08-05-am-oktagon-gustavo-lopez.json"]);
    const record = JSON.parse(await readFile(path.join(liveStateRoot, "ventures", "mma-files", "runs", "2026-08-06-am.json"), "utf8"));
    expect(record.status).toBe("published");
    expect(result.status).toBe("published");
  });

  it("still kills the slot when the throw leaves no package behind", async () => {
    // The same catch, with nothing stored: a corrupt record makes articleEvidenceFor throw long
    // before the writing call, so there is no article and killed is the whole of it.
    const now = new Date("2026-08-05T08:00:00.000Z");
    const date = pragueDate(now);
    await plantFighter(liveStateRoot, SUBJECT_REF, { completeness: 0.9 });
    await writeFile(path.join(liveStateRoot, "mma", "fighters", "oktagon:corrupt.json"), "{ not json");
    await plantSlate(liveStateRoot, date, SUBJECT_REF);

    const result = await runLiveArticleProduction({ cycleId: "test-cycle", slot: "am", now });

    expect(await loadArticlePackages(liveStateRoot)).toEqual([]);
    const record = JSON.parse(await readFile(path.join(liveStateRoot, "ventures", "mma-files", "runs", `${date}-am.json`), "utf8"));
    expect(record.status).toBe("killed");
    expect(record.reason).toBe("article_production_failed");
    expect(record.articleRef).toBeUndefined();
    expect(result.status).toBe("killed");
  });
});
