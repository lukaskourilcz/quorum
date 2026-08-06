import { describe, expect, it } from "vitest";
import {
  ILLUSTRATIVE_SPORT_PHOTOGRAPHS,
  illustrativePhotoAlt,
  illustrativeRotation,
  illustrativeSportPhoto
} from "../src/images/illustrative.js";
import { PHOTO_CERTAINTY_LADDER, photoCertaintyOf } from "../src/images/licensed.js";

/**
 * The two bodies below were read off Commons on 4 August 2026 and are verbatim, including the
 * markup Commons puts in `Artist` and the tracking parameters it appends to `url`. Nothing here
 * goes to the network; the live run that produced the rung counts is reported separately.
 */
function respond(bodies: Record<string, unknown>) {
  return async (url: string): Promise<unknown> => {
    for (const [fragment, body] of Object.entries(bodies)) if (url.includes(fragment)) return body;
    throw new Error(`No recorded response for ${url}`);
  };
}

const GMC_OCTAGON = {
  query: {
    pages: {
      "39226871": {
        pageid: 39_226_871,
        title: "File:GMC Octagon.jpg",
        imageinfo: [{
          url: "https://upload.wikimedia.org/wikipedia/commons/5/5d/GMC_Octagon.jpg",
          thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/GMC_Octagon.jpg/960px-GMC_Octagon.jpg",
          width: 2_519,
          height: 1_551,
          mime: "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY-SA 4.0" },
            Artist: { value: "<a href=\"//commons.wikimedia.org/w/index.php?title=User:GMC-MMA\" class=\"new\">GMC-MMA</a>" },
            Credit: { value: "<span class=\"int-own-work\" lang=\"en\">Own work</span>" },
            ImageDescription: { value: "GMC Octagon" }
          }
        }]
      }
    }
  }
};

const PFL_2018 = {
  query: {
    pages: {
      "112399571": {
        pageid: 112_399_571,
        title: "File:PFL 2018 Photo.jpg",
        imageinfo: [{
          url: "https://upload.wikimedia.org/wikipedia/commons/d/d3/PFL_2018_Photo.jpg",
          thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/PFL_2018_Photo.jpg/960px-PFL_2018_Photo.jpg",
          width: 2_559,
          height: 1_439,
          mime: "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY-SA 4.0" },
            Artist: { value: "PFL MMA" },
            Credit: { value: "<span class=\"int-own-work\" lang=\"en\">Own work</span>" },
            ImageDescription: { value: "Professional Fighters League event in 2018." }
          }
        }]
      }
    }
  }
};

describe("an illustrative photograph is never presented as being the fighter", () => {
  it("writes an alt that names nobody, for a subject whose name the caller knows perfectly well", async () => {
    // This is the rule the whole rung exists for. On 3 and 4 August this site published "Gustavo
    // Lopez v zápasovém postoji" over a photograph of an Argentinian government official and a
    // Shevchenko hero that was a firearms range. Both alts were written by something that knew the
    // article's subject; the fix is that the subject cannot reach the alt at all.
    const photo = await illustrativeSportPhoto({
      seed: "ufc:valentina-shevchenko",
      fetchJson: respond({ "commons.wikimedia.org": PFL_2018 })
    });
    expect(photo?.illustrative).toBe(true);
    const alt = photo?.altCs ?? "";
    for (const word of ["Valentina", "Shevchenko", "valentina", "shevchenko"]) expect(alt).not.toContain(word);
    expect(alt).toContain("Ilustrační");
    expect(alt).toContain("Nejde o snímek osoby");
  });

  it("has no parameter a name could arrive through", () => {
    // The guarantee is structural rather than careful: `illustrativePhotoAlt` takes one scene
    // phrase and the six phrases are fixed in this repository, so there is no call site — present
    // or future, model-driven or not — that can put a person into this string.
    expect(illustrativePhotoAlt.length).toBe(1);
    for (const photo of ILLUSTRATIVE_SPORT_PHOTOGRAPHS) {
      const alt = illustrativePhotoAlt(photo.sceneCs);
      expect(alt.startsWith("Ilustrační fotografie ze zápasů MMA:")).toBe(true);
      expect(alt.length).toBeLessThanOrEqual(300);
    }
  });

  it("says what the photograph is rather than only what it is not", () => {
    // "Not a photograph of the subject" alone leaves a screen-reader user with nothing. The scene
    // is the half of the sentence that carries information.
    expect(illustrativePhotoAlt("prázdná klec ve sportovní hale před začátkem galavečera"))
      .toBe("Ilustrační fotografie ze zápasů MMA: prázdná klec ve sportovní hale před začátkem galavečera. Nejde o snímek osoby, o níž článek pojednává.");
  });
});

describe("where an illustrative photograph comes from", () => {
  it("resolves a curated file by name and never runs a search", async () => {
    const seen: string[] = [];
    const photo = await illustrativeSportPhoto({
      seed: "oktagon:gustavo-lopez",
      fetchJson: async (url) => {
        seen.push(url);
        return GMC_OCTAGON;
      }
    });
    expect(photo).toMatchObject({
      provider: "wikimedia",
      license: "CC BY-SA",
      author: "GMC-MMA",
      sourceUrl: "https://commons.wikimedia.org/?curid=39226871",
      attributionHtml: "GMC-MMA · CC BY-SA · Wikimedia Commons",
      illustrative: true
    });
    // One request, addressed to a file by title. `generator=search` is what returned the
    // politician and the operetta singer, and it must not appear on this path at any query.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("titles=File%3A");
    expect(seen[0]).not.toContain("generator=search");
    // Nothing of the subject travels to Commons: the seed picks a file and is not a query term.
    expect(seen[0]?.toLowerCase()).not.toContain("lopez");
    expect(seen[0]?.toLowerCase()).not.toContain("gustavo");
  });

  it("records licence and attribution from the file's own live metadata", async () => {
    // Nothing about the licence is trusted to the curated list. A file relicensed on Commons stops
    // being publishable on the next run, without anybody editing this repository.
    const relicensed = structuredClone(GMC_OCTAGON);
    for (const page of Object.values(relicensed.query.pages)) {
      page.imageinfo[0]!.extmetadata.LicenseShortName.value = "CC BY-NC-SA 4.0";
    }
    expect(await illustrativeSportPhoto({ seed: "seed", fetchJson: respond({ "commons": relicensed }) })).toBeNull();
  });

  it("moves to the next file in the rotation when one cannot be fetched", async () => {
    // A momentarily unreachable file costs the article its first choice, not its photograph.
    let calls = 0;
    const photo = await illustrativeSportPhoto({
      seed: "oktagon:gustavo-lopez",
      fetchJson: async () => {
        calls += 1;
        if (calls === 1) throw new Error("commons timed out");
        return PFL_2018;
      }
    });
    expect(calls).toBe(2);
    // The second entry of this seed's rotation, whatever the set's length happens to be.
    expect(photo?.title).toBe(illustrativeRotation("oktagon:gustavo-lopez")[1]!.file);
  });

  it("gives one article the same photograph every time and neighbours different ones", async () => {
    const first = illustrativeRotation("oktagon:gustavo-lopez")[0];
    expect(illustrativeRotation("oktagon:gustavo-lopez")[0]).toBe(first);
    expect(illustrativeRotation("ufc:valentina-shevchenko")[0]).not.toBe(first);
    // Every file is reachable, so the tail of the rotation is a real fallback and not decoration.
    expect(new Set(illustrativeRotation("seed").map((photo) => photo.file)).size)
      .toBe(ILLUSTRATIVE_SPORT_PHOTOGRAPHS.length);
  });

  it("is a small set a reviewer can check by hand", async () => {
    expect(ILLUSTRATIVE_SPORT_PHOTOGRAPHS.length).toBeGreaterThanOrEqual(4);
    expect(ILLUSTRATIVE_SPORT_PHOTOGRAPHS.length).toBeLessThanOrEqual(12);
    for (const photo of ILLUSTRATIVE_SPORT_PHOTOGRAPHS) expect(photo.sceneCs.trim()).not.toBe("");
  });
});

describe("the certainty ladder", () => {
  it("names three rungs, highest certainty first", () => {
    expect([...PHOTO_CERTAINTY_LADDER]).toEqual(["entity-linked", "illustrative", "generated"]);
  });

  it("reads a candidate's rung off how it was found, not off how it looks", async () => {
    expect(photoCertaintyOf({ identityOf: "Q30123133" })).toBe("entity-linked");
    expect(photoCertaintyOf({ illustrative: true })).toBe("illustrative");
    // No candidate is rung three: the caller draws the FRAME plate.
    expect(photoCertaintyOf(null)).toBe("generated");
    expect(photoCertaintyOf(await illustrativeSportPhoto({
      seed: "seed",
      fetchJson: async () => { throw new Error("commons unreachable"); }
    }))).toBe("generated");
  });
});
