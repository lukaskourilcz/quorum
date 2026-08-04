import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialSlateSchema } from "../src/contracts/mma-files.js";
import { deterministicArticleImage } from "../src/images/article-image.js";
import type { LicensedPhotoCandidate } from "../src/images/licensed.js";

const altsRequested: string[] = [];

// materializeLicensedPhoto downloads the file and runs sharp over it. What this test is about is
// the one line above that call — which alt text it is handed — so the download is replaced and
// the argument recorded. Everything else in the pipeline runs for real.
vi.mock("../src/images/licensed.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/licensed.js")>("../src/images/licensed.js");
  return {
    ...actual,
    materializeLicensedPhoto: async ({ altCs, slug, candidate }: {
      altCs: string;
      slug: string;
      candidate: LicensedPhotoCandidate;
    }) => {
      altsRequested.push(altCs);
      // The bytes are the FRAME plate's, which keeps sharp out of this test; everything the
      // package schema checks — origin, licence, attribution, alt — is the photograph's.
      const plate = deterministicArticleImage({ venture: "mma-files", slug, title: "T" });
      return {
        ...plate,
        hero_path: `public/images/articles/${slug}/hero.webp`,
        thumb_path: `public/images/articles/${slug}/thumb.webp`,
        origin: "photo" as const,
        alt_cs: altCs,
        license: {
          name: candidate.license,
          author: candidate.author,
          source_url: candidate.sourceUrl,
          attribution_html: candidate.attributionHtml
        }
      };
    }
  };
});

const { produceMmaFilesArticle } = await import("../src/mma-files/pipeline.js");
const { loadStylebook } = await import("../src/mma-files/style.js");
const { repoRoot } = await import("../src/paths.js");

const roots: string[] = [];
afterEach(async () => {
  altsRequested.length = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const slate = EditorialSlateSchema.parse({
  schemaVersion: "editorial-slate/1",
  date: "2026-08-04",
  slots: [
    { slot: "am", format: "fighter-profile", subjectRefs: ["oktagon:gustavo-lopez"], rationale: "The sourced file is complete enough for a useful profile.", assignedWriter: "JAB", status: "assigned" },
    { slot: "pm", format: "desk-notes", subjectRefs: ["missing:2026-08-04:pm"], rationale: "No further source-backed subject is on file for this slot.", assignedWriter: "QUILL", status: "killed", killedReason: "No source-backed subject left on file." }
  ],
  vaultVerdicts: [
    { subjectRef: "oktagon:gustavo-lopez", verdict: "fresh", evidenceRef: "FIXTURE:article-image-alt#1" },
    { subjectRef: "missing:2026-08-04:pm", verdict: "repeat", evidenceRef: "state/mma/fighters" }
  ]
});

const CANDIDATE: LicensedPhotoCandidate = {
  id: "wikidata:Q4522047",
  provider: "wikimedia",
  title: "Valentina Shevchenko 2020.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  downloadUrl: "https://upload.wikimedia.org/file.jpg",
  width: 1_200,
  height: 1_600,
  license: "CC BY-SA",
  author: "Uploader",
  sourceUrl: "https://commons.wikimedia.org/?curid=1",
  attributionHtml: "Uploader · CC BY-SA · Wikimedia Commons"
};

/** What the 4 August writer produced: a stance nobody in the pipeline had seen. */
const INVENTED_ALT = "Gustavo Lopez v zápasovém postoji";

async function run(candidate: LicensedPhotoCandidate) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mma-alt-"));
  roots.push(root);
  return produceMmaFilesArticle({
    root,
    slate,
    slot: "am",
    slug: "gustavo-lopez",
    publishAt: new Date("2026-08-04T06:00:00.000Z"),
    mode: "data-only",
    evidence: {
      sources: [{ kind: "internal", ref: "state/mma/fighters/oktagon:gustavo-lopez.json" }],
      fighterRefs: ["oktagon:gustavo-lopez"],
      heroSpec: { template: "fighter-file", bindings: { headline: "Gustavo Lopez" } },
      evidenceText: "Fixture-only evidence packet."
    },
    imageCandidates: [candidate],
    gateway: {
      writeCzech: async () => ({
        title: "Profil zápasníka pro dnešní vydání",
        dek: "Redakční poznámka k dnešnímu profilu.",
        bodyMDX: "Karta zápasníka: [karta](/fighters/oktagon/gustavo-lopez)",
        imageAlt: INVENTED_ALT,
        imageCandidateIndex: 0
      })
    },
    stylebookRaw: await loadStylebook(repoRoot)
  });
}

describe("the alt text attached to a photograph", () => {
  it("uses the file's own description over anything the writer wrote", async () => {
    const fromCommons = "Fotografie, kterou Wikidata uvádí u osoby Valentina Shevchenko. Popis souboru na Wikimedia Commons: Valentina Shevchenko at a UFC media day in 2020";
    await run({ ...CANDIDATE, identityOf: "Q4522047", altCs: fromCommons });
    expect(altsRequested).toEqual([fromCommons]);
    expect(altsRequested[0]).not.toContain("postoji");
  });

  it("falls back to the writer only when the candidate describes nothing of itself", async () => {
    // A stock candidate from the event search carries a caption and no description, so the
    // writer's line is all there is. That path is why the field still exists.
    await run(CANDIDATE);
    expect(altsRequested).toEqual([INVENTED_ALT]);
  });

  it("refuses the writer's line outright for an illustrative photograph", async () => {
    // The rung-two photograph shows a cage and nobody the article is about, and the writer knows
    // whose article it is writing. The 4 August alt above is exactly one sentence away from
    // "Gustavo Lopez v kleci UFC" over a stock arena shot, which is the lie the rung exists to
    // prevent — so this is not a preference between two strings. The branch that would return the
    // writer's text is unreachable for this candidate.
    const illustrativeAlt = "Ilustrační fotografie ze zápasů MMA: prázdná klec ve sportovní hale. Nejde o snímek osoby, o níž článek pojednává.";
    await run({ ...CANDIDATE, illustrative: true, altCs: illustrativeAlt });
    expect(altsRequested).toEqual([illustrativeAlt]);
    expect(altsRequested[0]).not.toContain("Gustavo");
    expect(altsRequested[0]).not.toContain("Lopez");
  });

  it("still names nobody if an illustrative candidate somehow arrives with no alt of its own", async () => {
    // `illustrativeSportPhoto` always sets one, so this is the defence against the next caller
    // that constructs a candidate by hand. The old `??` chain would have reached straight past a
    // missing altCs to the writer's invented stance.
    await run({ ...CANDIDATE, illustrative: true });
    expect(altsRequested[0]).not.toContain(INVENTED_ALT);
    expect(altsRequested[0]).toContain("Ilustrační fotografie ze zápasů MMA");
  });
});
