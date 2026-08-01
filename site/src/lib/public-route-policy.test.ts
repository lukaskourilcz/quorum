import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = path.resolve(import.meta.dirname, "../..");

describe("MMA Files stays private", () => {
  it("has no public magazine route or header link", async () => {
    await expect(access(path.join(siteRoot, "src/app/magazine"))).rejects.toMatchObject({ code: "ENOENT" });
    const header = await readFile(path.join(siteRoot, "src/components/site-header.tsx"), "utf8");
    expect(header).not.toContain("/magazine");
  });
});
