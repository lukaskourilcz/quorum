import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { FOUNDING_AGENT_IDS } from "../src/org/registry.js";
import { repoRoot } from "../src/paths.js";

const InventorySchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(
    z.object({
      url: z.string().startsWith("/"),
      purpose: z.string().min(10),
      searchIntent: z.string().min(3),
      primaryQuery: z.string().min(3),
      audience: z.string().min(3),
      evidenceRefs: z.array(z.string().min(1)).min(1),
      author: z.string().min(2),
      reviewer: z.string().min(2),
      updatedAt: z.iso.date(),
      status: z.enum(["draft", "indexable", "noindex", "retired"]),
      informationGain: z.enum(["none", "low", "material"])
    })
  )
});

describe("public content inventory", () => {
  it("tracks every stable agent route and keeps fixtures noindex", async () => {
    const inventory = InventorySchema.parse(
      JSON.parse(
        await readFile(
          path.join(repoRoot, "state", "CONTENT_INVENTORY.json"),
          "utf8"
        )
      ) as unknown
    );
    const urls = inventory.pages.map((page) => page.url);

    expect(new Set(urls).size).toBe(urls.length);
    for (const id of FOUNDING_AGENT_IDS) {
      expect(urls).toContain(`/agents/${id.toLowerCase()}`);
    }
    expect(
      inventory.pages
        .filter(
          (page) =>
            page.url.startsWith("/ventures/") ||
            page.url === "/standups/2026-07-23-founding" ||
            page.url === "/admin"
        )
        .every((page) => page.status === "noindex")
    ).toBe(true);
    expect(
      inventory.pages
        .filter((page) => page.status === "indexable")
        .every((page) => page.informationGain === "material")
    ).toBe(true);
  });

  it("excludes fixture records from feeds and sitemap source", async () => {
    const [jsonFeed, xmlFeed, sitemap] = await Promise.all([
      readFile(path.join(repoRoot, "site/src/app/feed.json/route.ts"), "utf8"),
      readFile(path.join(repoRoot, "site/src/app/feed.xml/route.ts"), "utf8"),
      readFile(path.join(repoRoot, "site/src/app/sitemap.ts"), "utf8")
    ]);

    expect(jsonFeed).toContain("!standup.fixture");
    expect(xmlFeed).toContain("!standup.fixture");
    expect(sitemap).toContain("!standup.fixture");
  });
});
