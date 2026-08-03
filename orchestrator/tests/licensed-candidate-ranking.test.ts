import { describe, expect, it } from "vitest";
import { candidatesNaming, captionResidual } from "../src/images/licensed.js";

/**
 * Both captions are real, copied from the Wikimedia Commons files the live search returns for
 * "valentina shevchenko" on 3 August 2026. The first is what shipped as the hero of her
 * retirement-trilogy profile.
 */
const RANGE = {
  id: "range",
  provider: "wikimedia" as const,
  title: "Valentina Shevchenko, UFC bantamweight fighter, and her coach, Pavel Fedotov, operate Engagement Skills Trainer weapons during a visit to Joint Base Langley-Eustis",
  thumbnailUrl: "https://upload.wikimedia.org/a.jpg",
  downloadUrl: "https://upload.wikimedia.org/a.jpg",
  width: 6155,
  height: 4103,
  license: "CC0" as const,
  author: "Tech. Sgt. Katie Gar Ward",
  sourceUrl: "https://commons.wikimedia.org/?curid=74924049",
  attributionHtml: "Tech. Sgt. Katie Gar Ward"
};

const PORTRAIT = {
  ...RANGE,
  id: "portrait",
  title: "Kyrgyzstani-Peruvian muay thai and MMA fighter Valentina Shevchenko",
  downloadUrl: "https://upload.wikimedia.org/b.jpg",
  width: 1159,
  height: 1077,
  license: "CC BY" as const,
  author: "MMAnytt.se",
  sourceUrl: "https://commons.wikimedia.org/?curid=1",
  attributionHtml: "MMAnytt.se"
};

describe("choosing between two photographs that both name the subject", () => {
  it("puts the one that is mostly about her first", () => {
    // Naming the subject is not the same as being a photograph of the subject: the range caption
    // also names her coach, a weapon system and an air force base.
    const ranked = candidatesNaming([RANGE, PORTRAIT], "valentina shevchenko");
    expect(ranked.map((candidate) => candidate.id)).toEqual(["portrait", "range"]);
  });

  it("still keeps the long caption, because it may be the only photograph there is", () => {
    expect(candidatesNaming([RANGE], "valentina shevchenko")).toHaveLength(1);
  });

  it("counts only the words that are not the subject's own name", () => {
    expect(captionResidual("Valentina Shevchenko", ["valentina", "shevchenko"])).toBe(0);
    expect(captionResidual("Kyrgyzstani-Peruvian muay thai and MMA fighter Valentina Shevchenko", ["valentina", "shevchenko"])).toBe(7);
    expect(captionResidual(RANGE.title, ["valentina", "shevchenko"])).toBeGreaterThan(15);
  });

  it("drops a photograph that does not name the subject at all", () => {
    const other = { ...PORTRAIT, id: "other", title: "Alexa Grasso at UFC 285" };
    expect(candidatesNaming([other], "valentina shevchenko")).toEqual([]);
  });
});
