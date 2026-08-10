import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readMonetizationOptions } from "./monetization-options";

const option = {
  id: "display-ads",
  name: "Display / programmatic ads",
  category: "ads",
  description: "An ad network auctions banner slots on your pages and pays per impression.",
  fitFor: ["caught-up"],
  effort: "low",
  upfrontCostUsd: 0,
  recurringCostUsd: 0,
  blockers: ["Traffic is unmeasured"],
  status: "blocked"
};

async function root(file: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-monetization-"));
  if (file !== undefined) {
    await mkdir(path.join(directory, "config"), { recursive: true });
    await writeFile(
      path.join(directory, "config", "monetization-options.json"),
      typeof file === "string" ? file : JSON.stringify(file)
    );
  }
  return directory;
}

describe("the monetization catalog", () => {
  it("groups by category and keeps file order inside each", async () => {
    const catalog = await readMonetizationOptions(await root({
      schemaVersion: "monetization-option/1",
      updatedAt: "2026-08-09",
      options: [
        option,
        { ...option, id: "direct-banner-sales", name: "Direct banner sales" },
        { ...option, id: "affiliate", name: "Affiliate links", category: "affiliate", status: "idea" }
      ]
    }));

    expect(catalog.state).toBe("present");
    expect(catalog.total).toBe(3);
    expect(catalog.updatedAt).toBe("2026-08-09");
    expect(catalog.byCategory.map((group) => group.category)).toEqual(["ads", "affiliate"]);
    expect(catalog.byCategory[0]?.options.map((entry) => entry.id))
      .toEqual(["display-ads", "direct-banner-sales"]);
  });

  it("drops a malformed entry and counts it, instead of failing the page", async () => {
    const catalog = await readMonetizationOptions(await root({
      schemaVersion: "monetization-option/1",
      updatedAt: "2026-08-09",
      options: [
        option,
        { ...option, id: "bad-effort", effort: "enormous" },
        { ...option, id: "bad-cost", upfrontCostUsd: -5 },
        { ...option, id: "bad-status", status: "maybe" },
        { nothing: true }
      ]
    }));
    expect(catalog.total).toBe(1);
    expect(catalog.dropped).toBe(4);
  });

  it("reads a missing or wrong-version file as absent", async () => {
    expect((await readMonetizationOptions(await root(undefined))).state).toBe("missing");
    expect((await readMonetizationOptions(await root("{ not json"))).state).toBe("missing");
    expect((await readMonetizationOptions(await root({ schemaVersion: "monetization-option/2" }))).state)
      .toBe("missing");
  });

  it("reads the catalog this repository actually ships", async () => {
    const catalog = await readMonetizationOptions();
    expect(catalog.state).toBe("present");
    expect(catalog.dropped).toBe(0);
    expect(catalog.total).toBe(17);
    // Every option carries a description a non-technical reader can act on.
    for (const group of catalog.byCategory) {
      for (const entry of group.options) expect(entry.description.length).toBeGreaterThan(40);
    }
  });
});
