import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadWebDevSelectionConfig, WebDevSelectionConfigSchema } from "../src/ventures/webdev-signal/selection/config.js";
import {
  canonicalizeWebDevProject,
  canonicalizeWebDevUrl,
  explicitWebDevIdentifier,
  normalizeWebDevVersion,
  stableWebDevRecordId
} from "../src/ventures/webdev-signal/selection/canonical.js";

const fixtureRoot = path.join(import.meta.dirname, "fixtures", "webdev-signal");

describe("WebDev Signal pure canonicalization", () => {
  it("uses one validated versioned configuration", async () => {
    const config = await loadWebDevSelectionConfig();
    expect(config).toMatchObject({ canonicalizationVersion: "1.0.0", scoringVersion: "1.0.0" });
    expect(Object.keys(config.weights)).toHaveLength(12);
  });

  it("normalizes official blog, release, advisory and documentation URLs without losing semantic parameters", async () => {
    const config = await loadWebDevSelectionConfig();
    const fixtures = JSON.parse(await readFile(path.join(fixtureRoot, "canonicalization.json"), "utf8")) as Array<{ input: string; expected: string }>;
    for (const fixture of fixtures) expect(canonicalizeWebDevUrl(fixture.input, config)).toBe(fixture.expected);
  });

  it("unwraps only an exact configured redirect wrapper", async () => {
    const base = await loadWebDevSelectionConfig();
    const config = WebDevSelectionConfigSchema.parse({
      ...base,
      redirectWrappers: [{ host: "redirect.example", path: "/out", targetParameter: "target" }]
    });
    expect(canonicalizeWebDevUrl("https://redirect.example/out?target=https%3A%2F%2Fweb.dev%2Ffeature%3Fversion%3D2", config)).toBe("https://web.dev/feature?version=2");
    expect(canonicalizeWebDevUrl("https://redirect.example/other?target=https%3A%2F%2Fweb.dev%2Ffeature", config)).toContain("redirect.example/other");
  });

  it("normalizes project aliases and explicit versions or advisory ids", async () => {
    const config = await loadWebDevSelectionConfig();
    expect(canonicalizeWebDevProject("ReactJS", config)).toBe("React");
    expect(canonicalizeWebDevProject("Node.js", config)).toBe("Node.js");
    expect(normalizeWebDevVersion("version v20.01.0-beta.1")).toBe("20.01.0-beta.1");
    expect(explicitWebDevIdentifier("fixed by GHSA-ABCD-1234-EFGH")).toBe("ghsa-abcd-1234-efgh");
    expect(explicitWebDevIdentifier("release v20.0.0")).toBe("20.0.0");
  });

  it("derives stable collision-resistant ids from canonical inputs", async () => {
    const config = await loadWebDevSelectionConfig();
    const left = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.0.0?utm_source=x", project: "ReactJS", explicitIdentifier: "20.0.0", config });
    const right = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.0.0#notes", project: "React", explicitIdentifier: "20.0.0", config });
    const distinct = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.1.0", project: "React", explicitIdentifier: "20.1.0", config });
    expect(left).toBe(right);
    expect(left).toMatch(/^wds_[a-f0-9]{24}$/u);
    expect(distinct).not.toBe(left);
  });
});
