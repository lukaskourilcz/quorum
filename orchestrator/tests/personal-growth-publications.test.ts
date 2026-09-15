import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersonalGrowthPublicationsSchema } from "../src/contracts/personal-growth.js";
import { PersonalGrowthPillarSchema } from "../src/contracts/personal-growth-recommendations.js";
import { repoRoot } from "../src/paths.js";
import {
  choosePublicationPromotion,
  PUBLICATIONS_PATH,
  publicationRecommendationInput,
  readPersonalGrowthPublications
} from "../src/ventures/personal-growth/publications.js";
import { runPersonalGrowthDesk } from "../src/ventures/personal-growth/room.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function committedPublications() {
  return PersonalGrowthPublicationsSchema.parse(
    JSON.parse(await readFile(path.join(repoRoot, "state", PUBLICATIONS_PATH), "utf8"))
  );
}

async function rootWithPublications(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pg-publications-"));
  temporary.push(root);
  await mkdir(path.join(root, "ventures", "personal-growth"), { recursive: true });
  await writeFile(
    path.join(root, PUBLICATIONS_PATH),
    await readFile(path.join(repoRoot, "state", PUBLICATIONS_PATH), "utf8"),
    "utf8"
  );
  return root;
}

/**
 * The desk knew nothing about the owner's book. The publications file is the owner's own list,
 * copied from the shop page, and every promotion the desk suggests is a frame around those facts:
 * the owner still writes every word.
 */
describe("the owner's publications", () => {
  it("are recorded as facts the schema accepts, under pillars the registry knows", async () => {
    const file = await committedPublications();
    expect(file.publications.map(({ id }) => id)).toEqual(["rapovej-denik-kniha", "rapovej-denik-audiokniha"]);
    for (const publication of file.publications) {
      expect(PersonalGrowthPillarSchema.options).toContain(publication.pillar);
      expect(publication.url.startsWith("https://okraj.shop/")).toBe(true);
    }
    // Reading the same bytes through the desk's own reader gives the same list, and a malformed
    // file gives nothing rather than a thrown desk.
    const root = await rootWithPublications();
    expect(await readPersonalGrowthPublications(root)).toEqual(file);
    await writeFile(path.join(root, PUBLICATIONS_PATH), "{\"schemaVersion\":\"personal-growth-publications/1\"}", "utf8");
    expect(await readPersonalGrowthPublications(root)).toBeNull();
  });

  it("rotate every Nth day from the anchor and never before it", async () => {
    const publications = await committedPublications();
    expect(publications.promotion).toEqual({ anchorDate: "2026-09-16", everyNthDay: 3 });
    expect(choosePublicationPromotion({ publications, targetPragueDate: "2026-09-15" })).toBeNull();
    expect(choosePublicationPromotion({ publications, targetPragueDate: "2026-09-17" })).toBeNull();
    expect(choosePublicationPromotion({ publications, targetPragueDate: "2026-09-16" }))
      .toMatchObject({ rotationIndex: 0, publication: { id: "rapovej-denik-kniha" } });
    expect(choosePublicationPromotion({ publications, targetPragueDate: "2026-09-19" }))
      .toMatchObject({ rotationIndex: 1, publication: { id: "rapovej-denik-audiokniha" } });
    expect(choosePublicationPromotion({ publications, targetPragueDate: "2026-09-22" }))
      .toMatchObject({ rotationIndex: 2, publication: { id: "rapovej-denik-kniha" } });
  });

  it("frame a story sequence around the recorded facts and nothing else", async () => {
    const publications = await committedPublications();
    const promotion = choosePublicationPromotion({ publications, targetPragueDate: "2026-09-19" })!;
    const input = publicationRecommendationInput(promotion, "2026-09-19");
    expect(input).toMatchObject({
      actionType: "story-sequence",
      pillar: "rapovej-denik",
      dueWindow: "2026-09-19",
      ownerSourceRefs: ["ventures/personal-growth/publications.json#rapovej-denik-audiokniha"],
      collaborator: "OKRAJ Media s.r.o."
    });
    expect(input.assetChecklist.join("\n")).toContain("https://okraj.shop/products/audiokniha-rapovej-denik-namluvil-petr-stn-purmensky");
    expect(input.storiesSupport).toEqual(promotion.publication.facts);
    // No sentence a reader would see is written here: the checklists name links and facts.
    expect(JSON.stringify(input)).not.toMatch(/kup|buy now|dnes jen/iu);
  });

  it("take the desk's Instagram slot on a promotion day and leave the other days to the lanes", async () => {
    const root = await rootWithPublications();
    // 15 September at 23:00 Prague plans the 16th, the anchor day.
    const anchorDay = await runPersonalGrowthDesk({ now: new Date("2026-09-15T21:00:00.000Z"), dry: true, root });
    expect(anchorDay.status).toBe("planned");
    const instagram = JSON.parse(await readFile(path.join(root, "ventures/personal-growth/recommendations/instagram/2026-09-16.json"), "utf8"));
    expect(instagram).toMatchObject({
      actionType: "story-sequence",
      format: "story",
      pillar: "rapovej-denik",
      ownerSourceRefs: ["ventures/personal-growth/publications.json#rapovej-denik-kniha"],
      ownerWritesArtifact: true,
      publishingAuthorized: false
    });
    // The next evening plans the 17th, which is nobody's promotion day.
    await runPersonalGrowthDesk({ now: new Date("2026-09-16T21:00:00.000Z"), dry: true, root });
    const nextDay = JSON.parse(await readFile(path.join(root, "ventures/personal-growth/recommendations/instagram/2026-09-17.json"), "utf8"));
    expect(nextDay.actionType).not.toBe("story-sequence");
    expect(nextDay.ownerSourceRefs.join("\n")).not.toContain("publications.json");
  });
});
