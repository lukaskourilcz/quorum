import { describe, expect, it } from "vitest";
import { fighterIdentityPhoto, identityPhotoAlt, readImageFilename } from "../src/images/fighter-photo.js";
import { candidatesNaming, wikimediaLicense } from "../src/images/licensed.js";

/**
 * The bodies below were read off the live services on 4 August 2026 and trimmed to the fields the
 * code reads. Values are verbatim, dimensions and licences included, because the previous version
 * of this file invented them and the invention was load-bearing: it claimed Q4522047's file was
 * 1200x1600 CC BY-SA 4.0, where the real file is 483x644 CC BY 3.0, and 483 is below the 640-pixel
 * floor. The recorded happy path therefore asserted an outcome the live services do not produce.
 * Nothing here goes to the network.
 *
 * Q30123133 (Alexander Volkanovski) is the fighter whose card resolves to a publishable photograph
 * and Q4522047 (Valentina Shevchenko) the one whose real file is too small to fill the hero — 16
 * of the 55 files the roster names are, every one of them on width. Q104839627 (the OKTAGON
 * bantamweight Gustavo Lopez) carries no P18 at all.
 */
function respond(bodies: Record<string, unknown>) {
  return async (url: string): Promise<unknown> => {
    for (const [fragment, body] of Object.entries(bodies)) if (url.includes(fragment)) return body;
    throw new Error(`No recorded response for ${url}`);
  };
}

const VOLKANOVSKI_ITEM = {
  entities: {
    Q30123133: {
      labels: { en: { language: "en", value: "Alexander Volkanovski" } },
      claims: {
        P18: [{
          mainsnak: {
            snaktype: "value",
            property: "P18",
            datavalue: { value: "Alexander Volkanovski at UFC 232.jpg", type: "string" },
            datatype: "commonsMedia"
          },
          type: "statement",
          rank: "normal"
        }]
      }
    }
  }
};

const VOLKANOVSKI_FILE = {
  query: {
    pages: {
      "93013596": {
        pageid: 93_013_596,
        title: "File:Alexander Volkanovski at UFC 232.jpg",
        imageinfo: [{
          url: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Alexander_Volkanovski_at_UFC_232.jpg",
          thumburl: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Alexander_Volkanovski_at_UFC_232.jpg",
          width: 932,
          height: 1_300,
          mime: "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY 3.0" },
            Artist: { value: "MMAnytt" },
            Credit: { value: "<bdi lang=\"en\" dir=\"ltr\"><a href=\"//commons.wikimedia.org/wiki/Commons:YouTube_files\">YouTube</a></bdi> at 3:33 cropped" },
            ImageDescription: { value: "Alexander Volkanovski at UFC 232" }
          }
        }]
      }
    }
  }
};

const SHEVCHENKO_ITEM = {
  entities: {
    Q4522047: {
      labels: { en: { language: "en", value: "Valentina Shevchenko" } },
      claims: {
        P18: [{
          mainsnak: {
            snaktype: "value",
            property: "P18",
            datavalue: { value: "Valentina Shevchenko 2020.jpg", type: "string" },
            datatype: "commonsMedia"
          },
          type: "statement",
          rank: "normal"
        }]
      }
    }
  }
};

const SHEVCHENKO_FILE = {
  query: {
    pages: {
      "148376837": {
        pageid: 148_376_837,
        title: "File:Valentina Shevchenko 2020.jpg",
        imageinfo: [{
          url: "https://upload.wikimedia.org/wikipedia/commons/7/79/Valentina_Shevchenko_2020.jpg",
          thumburl: "https://upload.wikimedia.org/wikipedia/commons/7/79/Valentina_Shevchenko_2020.jpg",
          width: 483,
          height: 644,
          mime: "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY 3.0" },
            Artist: { value: "MMAnytt" },
            Credit: { value: "<a rel=\"nofollow\" class=\"external free\" href=\"https://m.youtube.com/watch?v=eBbBhUhtXrI\">https://m.youtube.com/watch?v=eBbBhUhtXrI</a>" },
            ImageDescription: { value: "Valentina Shevchenko at UFC 256 interview" }
          }
        }]
      }
    }
  }
};

const volkanovskiResponses = respond({
  "wikidata.org": VOLKANOVSKI_ITEM,
  "commons.wikimedia.org": VOLKANOVSKI_FILE
});

describe("a fighter's photograph resolved through their own Wikidata item", () => {
  it("takes the file the item names and the licence from that file", async () => {
    const photo = await fighterIdentityPhoto({
      wikidataId: "Q30123133",
      fallbackName: "Alexander Volkanovski",
      fetchJson: volkanovskiResponses
    });
    expect(photo).toMatchObject({
      identityOf: "Q30123133",
      title: "Alexander Volkanovski at UFC 232.jpg",
      license: "CC BY",
      author: "MMAnytt",
      sourceUrl: "https://commons.wikimedia.org/?curid=93013596",
      downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Alexander_Volkanovski_at_UFC_232.jpg"
    });
  });

  it("accepts the portrait, which is what a P18 file usually is", async () => {
    // 932x1300. Landscape-only would drop it, and 43 of the 55 files the roster names are the
    // same shape — the rule that protects a stock search would have deleted the identity path.
    const photo = await fighterIdentityPhoto({
      wikidataId: "Q30123133",
      fallbackName: "Alexander Volkanovski",
      fetchJson: volkanovskiResponses
    });
    expect(photo?.height).toBeGreaterThan(photo!.width);
  });

  it("refuses a file too small to fill the hero, however certainly it depicts the fighter", async () => {
    // Q4522047's P18 is unarguably Valentina Shevchenko and it is 483 pixels wide, under the
    // 640-pixel floor `heroReady` applies. Deciding that here is the point: offered anyway, the
    // writer picks a photograph, `materializeLicensedPhoto` throws on the same dimensions three
    // steps later, and the article gets its FRAME cover by way of a failure the log calls a
    // successful image search. 16 of the 55 files the roster names come out this way.
    const photo = await fighterIdentityPhoto({
      wikidataId: "Q4522047",
      fallbackName: "Valentina Shevchenko",
      fetchJson: respond({ "wikidata.org": SHEVCHENKO_ITEM, "commons.wikimedia.org": SHEVCHENKO_FILE })
    });
    expect(photo).toBeNull();
  });

  it("returns nothing when the item names no image, and never falls back to a name", async () => {
    // Q104839627 is the real item for the OKTAGON bantamweight Gustavo Lopez. It carries 11
    // claims and no P18 among them, checked live on 4 August 2026, which is why his article must
    // run the FRAME cover.
    const photo = await fighterIdentityPhoto({
      wikidataId: "Q104839627",
      fallbackName: "Gustavo Lopez (fighter)",
      fetchJson: respond({
        "wikidata.org": {
          entities: {
            Q104839627: {
              labels: { en: { language: "en", value: "Gustavo Lopez" } },
              claims: { P31: [{ mainsnak: { snaktype: "value", property: "P31" }, rank: "normal" }] }
            }
          }
        }
      })
    });
    expect(photo).toBeNull();
  });

  it("rejects a file whose own metadata carries no licence we may publish under", async () => {
    const photo = await fighterIdentityPhoto({
      wikidataId: "Q30123133",
      fallbackName: "Alexander Volkanovski",
      fetchJson: respond({
        "wikidata.org": VOLKANOVSKI_ITEM,
        "commons.wikimedia.org": {
          query: {
            pages: {
              "93013596": {
                pageid: 93_013_596,
                imageinfo: [{
                  ...VOLKANOVSKI_FILE.query.pages["93013596"].imageinfo[0],
                  extmetadata: { LicenseShortName: { value: "CC BY-NC 4.0" } }
                }]
              }
            }
          }
        }
      })
    });
    expect(photo).toBeNull();
  });

  it("prefers the rank the item's maintainers marked and never a deprecated value", () => {
    expect(readImageFilename([
      { mainsnak: { datavalue: { value: "Old.jpg" } }, rank: "normal" },
      { mainsnak: { datavalue: { value: "Current.jpg" } }, rank: "preferred" }
    ])).toBe("Current.jpg");
    expect(readImageFilename([{ mainsnak: { datavalue: { value: "Wrong.jpg" } }, rank: "deprecated" }])).toBeNull();
    expect(readImageFilename(undefined)).toBeNull();
  });
});

describe("the alt text of an identity photograph", () => {
  it("quotes the file's own description instead of describing a picture nobody looked at", () => {
    const alt = identityPhotoAlt({
      name: "Alexander Volkanovski",
      filename: "Alexander Volkanovski at UFC 232.jpg",
      description: "Alexander Volkanovski at UFC 232"
    });
    expect(alt).toContain("Alexander Volkanovski at UFC 232");
    expect(alt).toContain("Wikimedia Commons");
    expect(alt.length).toBeLessThanOrEqual(300);
  });

  it("says so when Commons has no description, rather than inventing one", () => {
    const alt = identityPhotoAlt({ name: "Gustavo Lopez", filename: "Some file.jpg", description: "   " });
    expect(alt).toContain("neuvádí popis");
    expect(alt).toContain("Some file.jpg");
  });

  it("drops pasted links and never ends mid-word", () => {
    // Commons file "Brian Ortega on MMAnytt.jpg" carries a 420-character video blurb ending in a
    // URL; the alt attribute is not the place for either.
    const alt = identityPhotoAlt({
      name: "Brian Ortega",
      filename: "Brian Ortega on MMAnytt.jpg",
      description: `BRIAN ORTEGA CONFIRMS THE UFC HAVE A REPLACEMENT READY ${"words ".repeat(60)}https://mmanytt.se/subscribe`
    });
    expect(alt).not.toContain("https://");
    expect(alt.length).toBeLessThanOrEqual(300);
    expect(alt.endsWith("…")).toBe(true);
  });
});

describe("reading a Commons licence name", () => {
  it("refuses the non-commercial and no-derivatives clauses instead of reading them as CC BY", () => {
    // Every one of these came back as a permissive licence before the clause check went in
    // front, which meant the validator's non-commercial refusal was unreachable through Commons.
    expect(wikimediaLicense("CC BY-NC 4.0")).toBeNull();
    expect(wikimediaLicense("CC BY-NC-SA 3.0")).toBeNull();
    expect(wikimediaLicense("CC BY-ND 2.0")).toBeNull();
  });

  it("still reads the licences the site may publish under", () => {
    expect(wikimediaLicense("CC BY-SA 4.0")).toBe("CC BY-SA");
    expect(wikimediaLicense("CC BY 3.0")).toBe("CC BY");
    expect(wikimediaLicense("Public domain")).toBe("CC0");
    expect(wikimediaLicense("CC0")).toBe("CC0");
  });
});

describe("why the name search could not have done this", () => {
  it("passes and then top-ranks the politician for a fighter of the same name", () => {
    // Both are the real Commons files. "678 - Gustavo Lopez.jpg" is an Argentinian government
    // official; it shipped as the hero of the 4 August OKTAGON article.
    const politician = {
      id: "politician",
      provider: "wikimedia" as const,
      title: "678 - Gustavo Lopez",
      thumbnailUrl: "https://upload.wikimedia.org/a.jpg",
      downloadUrl: "https://upload.wikimedia.org/a.jpg",
      width: 1_600,
      height: 900,
      license: "CC BY-SA" as const,
      author: "Uploader",
      sourceUrl: "https://commons.wikimedia.org/?curid=1",
      attributionHtml: "Uploader · CC BY-SA · Wikimedia Commons"
    };
    const ranked = candidatesNaming([politician], "gustavo lopez");
    // The textual filter cannot tell the two men apart, and the ranking added yesterday actively
    // prefers this one: its caption is almost purely the name, so its residual is the lowest a
    // caption can have. This is the behaviour the identity path exists to bypass, not a bug in
    // `candidatesNaming` — which is why a fighter subject must never be routed through it.
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("politician");
  });
});
