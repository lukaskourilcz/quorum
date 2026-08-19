import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const globalsUrl = new URL("../../app/globals.css", import.meta.url);
const shellUrl = new URL("./admin-shell.tsx", import.meta.url);
const designSystemUrl = new URL("../../../../docs/ADMIN-DESIGN-SYSTEM.md", import.meta.url);

describe("Admin design tokens", () => {
  it("keeps the Admin palette scoped away from public surfaces", async () => {
    const stylesheet = await readFile(globalsUrl, "utf8");
    const [publicStyles, adminStyles] = stylesheet.split(
      "/* ---- Protected Admin design foundation",
    );

    expect(publicStyles).not.toContain("--admin-");
    expect(adminStyles).toContain("[data-admin] {");
    expect(adminStyles).toContain('[data-admin][data-admin-theme="dark"]');
    expect(adminStyles).not.toMatch(/:root\s*{[^}]*--admin-/s);
  });

  it("defines the semantic surface, state, density and focus contract", async () => {
    const stylesheet = await readFile(globalsUrl, "utf8");
    const requiredTokens = [
      "--admin-background",
      "--admin-surface",
      "--admin-foreground",
      "--admin-border",
      "--admin-primary",
      "--admin-information",
      "--admin-success",
      "--admin-warning",
      "--admin-risk",
      "--admin-destructive",
      "--admin-radius",
      "--admin-row-dense",
      "--admin-touch-target",
      "--admin-type-page",
      "--admin-type-body",
      "--admin-type-label",
      "--admin-focus",
    ];

    for (const token of requiredTokens) {
      expect(stylesheet).toContain(`${token}:`);
    }

    expect(stylesheet).toContain(".admin-focus-ring:focus-visible");
    expect(stylesheet).toContain("--admin-touch-target: 2.75rem");
  });

  it("pins the legacy Admin shell to the dark compatibility palette", async () => {
    const shell = await readFile(shellUrl, "utf8");

    expect(shell).toContain("data-admin");
    expect(shell).toContain('data-admin-theme="dark"');
  });

  it("pins the canonical design contract to the inspected reference", async () => {
    const designSystem = await readFile(designSystemUrl, "utf8");

    expect(designSystem).toContain("lukaskourilcz/own-dashboard");
    expect(designSystem).toContain("3049c5008b53e7d34d794822eedd552a470492c1");
    expect(designSystem).toContain("pnpm admin:design-audit");
    expect(designSystem).toContain("does not alter the locked public presentation");
  });
});
