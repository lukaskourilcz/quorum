import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverLicensedPhotos } from "../src/images/licensed.js";
import { pixabayCacheKey, readPixabayCache, writePixabayCache } from "../src/images/pixabay-cache.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const made = await mkdtemp(path.join(os.tmpdir(), "licensed-retrieval-"));
  roots.push(made);
  return made;
}

/** One Openverse hit, shaped as the API shapes it, hosted where the downloader may reach it. */
function openverseHit(id: string, title: string) {
  return {
    id,
    title,
    license: "by",
    creator: "A photographer",
    foreign_landing_url: `https://example.test/${id}`,
    thumbnail: `https://api.openverse.org/${id}/thumb/`,
    url: `https://live.staticflickr.com/${id}.jpg`,
    width: 1_920,
    height: 1_080
  };
}

function pixabayHit(id: number, tags: string) {
  return {
    id,
    tags,
    user: "A photographer",
    previewURL: `https://cdn.pixabay.com/${id}-preview.jpg`,
    largeImageURL: `https://cdn.pixabay.com/${id}-large.jpg`,
    imageWidth: 1_920,
    imageHeight: 1_080,
    pageURL: `https://pixabay.com/photos/${id}/`
  };
}

/** Answers every provider, recording which URLs were asked for. */
function fetcher(calls: string[], results: Record<string, unknown> = {}) {
  return async (url: string) => {
    calls.push(url);
    const parsed = new URL(url);
    const key = `${parsed.hostname}:${parsed.searchParams.get("q") ?? parsed.searchParams.get("query") ?? parsed.searchParams.get("gsrsearch") ?? ""}`;
    if (key in results) return results[key];
    if (parsed.hostname === "api.openverse.org") {
      const query = parsed.searchParams.get("q") ?? "";
      return { results: [openverseHit(`ov-${query.replace(/\s+/gu, "-")}`, `Openverse ${query}`)] };
    }
    if (parsed.hostname === "pixabay.com") {
      const query = parsed.searchParams.get("q") ?? "";
      return { hits: [pixabayHit(query.length, `Pixabay ${query}`)] };
    }
    return {};
  };
}

describe("retrieval across phrases and providers", () => {
  it("asks every provider for every phrase", async () => {
    const calls: string[] = [];
    await discoverLicensedPhotos({
      queries: ["empty courtroom bench", "government building facade"],
      pexelsKey: "pexels-key",
      pixabayKey: "pixabay-key",
      fetchJson: fetcher(calls),
      cacheRoot: await root()
    });

    // Two phrases, four providers, eight requests. No provider is asked twice for one phrase.
    expect(calls).toHaveLength(8);
    const hosts = calls.map((url) => new URL(url).hostname);
    for (const host of ["api.openverse.org", "commons.wikimedia.org", "api.pexels.com", "pixabay.com"]) {
      expect(hosts.filter((entry) => entry === host)).toHaveLength(2);
    }
  });

  it("interleaves by round, so no one provider fills the shortlist", async () => {
    const calls: string[] = [];
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      pixabayKey: "pixabay-key",
      fetchJson: fetcher(calls, {
        "api.openverse.org:alpha": {
          results: [
            openverseHit("ov-1", "First from Openverse"),
            openverseHit("ov-2", "Second from Openverse")
          ]
        }
      }),
      cacheRoot: await root()
    });

    // Openverse offered two and Pixabay one; the shortlist reads one from each before it reads
    // Openverse's second. Round-robin is the whole difference between a shortlist and a queue.
    expect(found.candidates.map((candidate) => candidate.provider)).toEqual([
      "openverse",
      "pixabay",
      "openverse"
    ]);
  });

  it("counts one photograph once, whichever phrase or provider found it", async () => {
    const shared = openverseHit("shared", "The same picture");
    const found = await discoverLicensedPhotos({
      queries: ["alpha", "beta"],
      fetchJson: fetcher([], {
        "api.openverse.org:alpha": { results: [shared] },
        "api.openverse.org:beta": { results: [shared] }
      }),
      cacheRoot: await root()
    });

    expect(found.candidates).toHaveLength(1);
  });

  it("counts one caption once, even under two source URLs", async () => {
    // The same event photographed five times is one picture as far as an editor is concerned,
    // and twelve views of one frame waste the gate's single call.
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      fetchJson: fetcher([], {
        "api.openverse.org:alpha": {
          results: [
            openverseHit("a", "Weigh-in stage"),
            { ...openverseHit("b", "Weigh-in stage") }
          ]
        }
      }),
      cacheRoot: await root()
    });

    expect(found.candidates).toHaveLength(1);
  });

  it("gives a contested shortlist to the archives that have actually won", async () => {
    // Every provider answers with plenty. The measured yield says Pexels is the only archive that
    // has ever produced a published hero and that Pixabay has never produced one in sixty-six
    // looks, so the twelve slots must not come out evenly.
    const pexelsMany = Array.from({ length: 8 }, (_, index) => ({
      id: 5_000 + index,
      photographer: "A photographer",
      alt: `Pexels picture ${index}`,
      width: 1_920,
      height: 1_080,
      url: `https://www.pexels.com/photo/${5_000 + index}/`,
      src: { large2x: `https://images.pexels.com/photos/${5_000 + index}/large.jpg`, medium: `https://images.pexels.com/photos/${5_000 + index}/medium.jpg` }
    }));
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      pexelsKey: "pexels-key",
      pixabayKey: "pixabay-key",
      fetchJson: fetcher([], {
        "api.pexels.com:alpha": { photos: pexelsMany },
        "api.openverse.org:alpha": {
          results: Array.from({ length: 8 }, (_, index) => openverseHit(`ov-${index}`, `Openverse ${index}`))
        },
        "pixabay.com:alpha": {
          hits: Array.from({ length: 8 }, (_, index) => pixabayHit(9_000 + index, `Pixabay ${index}`))
        }
      }),
      cacheRoot: await root()
    });

    const share = (provider: string) =>
      found.candidates.filter((candidate) => candidate.provider === provider).length;
    expect(share("pixabay")).toBeLessThanOrEqual(2);
    expect(share("openverse")).toBeLessThanOrEqual(2);
    // The archive with every recorded win takes the slots the other two are no longer holding.
    expect(share("pexels")).toBeGreaterThan(share("pixabay") + share("openverse"));
  });

  it("still fills from a capped archive when it is the only one answering", async () => {
    // No Pexels or Pixabay key, and Commons has nothing for this phrase: the keyless floor is the
    // whole of the shortlist. A share cap that shrank this to two would hand the gate ten fewer
    // candidates and call it discipline.
    const many = Array.from({ length: 20 }, (_, index) => openverseHit(`only-${index}`, `Only ${index}`));
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      fetchJson: fetcher([], { "api.openverse.org:alpha": { results: many } }),
      cacheRoot: await root()
    });

    expect(found.candidates).toHaveLength(12);
    expect(found.candidates.every((candidate) => candidate.provider === "openverse")).toBe(true);
  });

  it("stops at twelve", async () => {
    const many = Array.from({ length: 20 }, (_, index) => openverseHit(`n${index}`, `Picture ${index}`));
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      fetchJson: fetcher([], { "api.openverse.org:alpha": { results: many } }),
      cacheRoot: await root()
    });

    expect(found.candidates).toHaveLength(12);
  });

  it("names the providers it could not use, and never a key", async () => {
    const found = await discoverLicensedPhotos({
      queries: ["alpha"],
      fetchJson: fetcher([]),
      cacheRoot: await root()
    });

    expect(found.skippedProviders).toEqual([
      { provider: "pexels", reason: "missing-key" },
      { provider: "pixabay", reason: "missing-key" }
    ]);
  });

  it("says nothing rather than search on an empty phrase list", async () => {
    const calls: string[] = [];
    const found = await discoverLicensedPhotos({
      queries: ["", "   "],
      fetchJson: fetcher(calls),
      cacheRoot: await root()
    });

    expect(calls).toEqual([]);
    expect(found.candidates).toEqual([]);
  });
});

describe("Pixabay's twenty-four hour caching term", () => {
  it("consults the cache before the network for a repeated query", async () => {
    const cacheRoot = await root();
    const calls: string[] = [];
    const at = new Date("2026-08-08T06:00:00.000Z");
    const options = {
      queries: ["alpha"],
      pixabayKey: "pixabay-key",
      fetchJson: fetcher(calls),
      cacheRoot,
      now: at
    };

    const first = await discoverLicensedPhotos(options);
    expect(calls.filter((url) => url.includes("pixabay.com/api"))).toHaveLength(1);

    // Same query, later the same day: the response comes off disk and no request is made.
    const second = await discoverLicensedPhotos({
      ...options,
      now: new Date("2026-08-08T18:00:00.000Z")
    });
    expect(calls.filter((url) => url.includes("pixabay.com/api"))).toHaveLength(1);
    expect(second.candidates.map((candidate) => candidate.id))
      .toEqual(first.candidates.map((candidate) => candidate.id));

    // A day later the term is satisfied and the archive is asked again.
    await discoverLicensedPhotos({ ...options, now: new Date("2026-08-09T07:00:00.000Z") });
    expect(calls.filter((url) => url.includes("pixabay.com/api"))).toHaveLength(2);
  });

  it("keys the cache on the query and never on the credential", async () => {
    // A key in a cache filename is a key on disk in a place nobody is watching.
    const withKey = "https://pixabay.com/api/?key=secret-value&q=alpha";
    const withAnother = "https://pixabay.com/api/?key=a-different-secret&q=alpha";
    expect(pixabayCacheKey(withKey)).toBe(pixabayCacheKey(withAnother));
    expect(pixabayCacheKey(withKey)).not.toContain("secret");
  });

  it("ignores an entry that has aged out", async () => {
    const cacheRoot = await root();
    const url = "https://pixabay.com/api/?key=k&q=alpha";
    await writePixabayCache(cacheRoot, url, { hits: [] }, new Date("2026-08-07T06:00:00.000Z"));
    expect(await readPixabayCache(cacheRoot, url, new Date("2026-08-07T20:00:00.000Z"))).toEqual({ hits: [] });
    expect(await readPixabayCache(cacheRoot, url, new Date("2026-08-08T09:00:00.000Z"))).toBeNull();
  });
});
