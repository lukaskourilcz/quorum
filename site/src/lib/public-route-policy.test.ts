import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = path.resolve(import.meta.dirname, "../..");

describe("MMA Files owns public fight data", () => {
  it("removes duplicate BoardlessAI fighter routes and links to the magazine", async () => {
    await expect(access(path.join(siteRoot, "src/app/fighters/page.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(siteRoot, "src/app/ventures/fightaiq/upcoming/page.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
    const header = await readFile(path.join(siteRoot, "src/components/site-header.tsx"), "utf8");
    expect(header).not.toContain('href: "/fighters"');
    const venture = await readFile(path.join(siteRoot, "src/components/fightaiq-venture-page.tsx"), "utf8");
    // The magazine is Czech-only and 307s /en to /cs, so the link names the locale it lands on.
    // What this guard protects is that the data desk lives in the magazine and BoardlessAI still
    // points at it, not which locale prefix the URL carried when the guard was written.
    expect(venture).toContain("https://mma-files.vercel.app/cs/data-desk");
  });
});
