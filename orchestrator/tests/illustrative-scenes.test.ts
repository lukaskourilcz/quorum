import { describe, expect, it } from "vitest";
import {
  ILLUSTRATIVE_SCENES,
  illustrativeSceneAlt,
  illustrativeScenePhoto,
  sceneRotation
} from "../src/images/illustrative-scenes.js";
import { VISUAL_SUBJECT, imageSubjectQuery } from "../src/images/subject-query.js";

function commonsPage(file: string, license = "CC BY-SA 4.0") {
  return {
    query: {
      pages: {
        "1234": {
          pageid: 1234,
          imageinfo: [{
            url: `https://upload.wikimedia.org/wikipedia/commons/${file}`,
            thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/${file}`,
            width: 1_920,
            height: 1_080,
            mime: "image/jpeg",
            extmetadata: {
              LicenseShortName: { value: license },
              Artist: { value: "<a href='#'>A photographer</a>" }
            }
          }]
        }
      }
    }
  };
}

/**
 * The daily edition's photograph used to be whatever a live archive search ranked first that
 * morning, in an order nobody had looked at and which moves between runs. The MMA desk has run a
 * curated rung since launch for exactly that reason, and this is the same design.
 */
describe("the curated scene rung", () => {
  it("keys every curated set on a concept the vocabulary can actually produce", () => {
    // A key nobody's tags can resolve to is a set that never runs. imageSubjectQuery only ever
    // emits values from VISUAL_SUBJECT, so those values are the whole of the reachable keys.
    const reachable = new Set(Object.values(VISUAL_SUBJECT));
    for (const concept of Object.keys(ILLUSTRATIVE_SCENES)) {
      expect(reachable, `${concept} is not a concept any tag maps to`).toContain(concept);
    }
  });

  it("covers the concepts a live day actually resolves to", () => {
    // The tags the 5 and 6 August editions delivered, through the real mapping.
    const august6 = imageSubjectQuery([[
      "ai-bezpecnost", "ai-agenti", "openai", "meta", "kyberneticka-bezpecnost"
    ]]);
    expect(sceneRotation(august6, "2026-08-06").length).toBeGreaterThan(0);

    const august5 = imageSubjectQuery([["spacex", "ai", "openai", "amd", "vesmir", "telekomunikace"]]);
    expect(sceneRotation(august5, "2026-08-05").length).toBeGreaterThan(0);
  });

  it("gives one day the same photograph every time and neighbouring days different ones", () => {
    const query = "data centre cybersecurity";
    expect(sceneRotation(query, "2026-08-06")[0]).toBe(sceneRotation(query, "2026-08-06")[0]);
    expect(new Set(sceneRotation(query, "2026-08-06").map((scene) => scene.file)).size)
      .toBe(sceneRotation(query, "2026-08-06").length);
  });

  it("returns nothing for a concept nobody has reviewed photographs for", () => {
    // Not a failure: the caller then runs the live search, exactly as it did before this rung.
    expect(sceneRotation("advertising billboard", "2026-08-06")).toEqual([]);
    expect(sceneRotation("", "2026-08-06")).toEqual([]);
  });

  it("resolves a curated file to a candidate that claims nothing about a subject", async () => {
    const candidate = await illustrativeScenePhoto({
      subjectQuery: "data centre",
      seed: "2026-08-06",
      fetchJson: async () => commonsPage("Servers.jpg")
    });

    expect(candidate?.illustrative).toBe(true);
    expect(candidate?.license).toBe("CC BY-SA");
    // The alt has no parameter a subject could arrive through, and says so on the page.
    expect(candidate?.altCs).toContain("Ilustrační fotografie");
    expect(candidate?.altCs).toContain("Nejde o snímek konkrétní události");
  });

  it("drops a file whose licence is not on the allowlist rather than publishing it", async () => {
    expect(await illustrativeScenePhoto({
      subjectQuery: "data centre",
      seed: "2026-08-06",
      fetchJson: async () => commonsPage("Servers.jpg", "All rights reserved")
    })).toBeNull();
  });

  it("moves to the next file when one cannot be fetched", async () => {
    let calls = 0;
    const candidate = await illustrativeScenePhoto({
      subjectQuery: "data centre",
      seed: "2026-08-06",
      fetchJson: async () => {
        calls += 1;
        if (calls === 1) throw new Error("commons timed out");
        return commonsPage("Servers.jpg");
      }
    });

    expect(calls).toBe(2);
    expect(candidate).not.toBeNull();
  });

  it("cannot be handed a subject to name", () => {
    // The whole point of the function: there is no parameter through which "OpenAI" could reach
    // the alt text, so no caller can produce a sentence claiming what is in the frame.
    expect(illustrativeSceneAlt("řady serverových skříní v datovém centru"))
      .toBe("Ilustrační fotografie k tématu: řady serverových skříní v datovém centru. Nejde o snímek konkrétní události, o níž článek pojednává.");
  });
});
