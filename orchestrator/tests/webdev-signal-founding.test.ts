import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

async function repoText(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("WebDev Signal founding boundary", () => {
  it("records a held working name, separate audiences and zero-or-one editorial promise", async () => {
    const [audit, decision] = await Promise.all([
      repoText("docs/WEBDEV-SIGNAL-FOUNDING.md"),
      repoText("state/decisions/2026-08-28-webdev-signal-founding.md")
    ]);
    expect(audit).toContain("keep as a working name; hold final public use");
    expect(audit).toContain("### Czech edition");
    expect(audit).toContain("### English edition");
    expect(audit).toContain("zero or one canonical record");
    expect(audit).toContain("`NO_EDITION`");
    /*
     * The owner countersigned this on 2026-08-30, which authorises the build and nothing else.
     * What the guard is for survives that signature and is what it asserts: the record still has
     * to say that live behaviour is held, because the founding grants no rendering, profile,
     * connection, provider, queue or publishing authority and never did.
     */
    expect(decision).toContain("Status: countersigned");
    expect(decision).toContain("Held by this decision: live behavior held.");
    expect(decision).toContain("Those edges grant\nno rendering, profile, connection, provider, routine-scope, queue or publishing authority.");
    expect(decision).toContain("no new cron, meeting or public");
  });

  it("keeps first-party authority and unproven endpoints out of the enabled set", async () => {
    const sources = await repoText("docs/WEBDEV-SIGNAL-SOURCES.md");
    expect(sources).toContain("Lead/corroboration only; no factual authority");
    expect(sources).toContain("`github-npm-advisories`");
    for (const source of ["`vercel-changelog`", "`netlify-changelog`", "`w3c-news`"]) {
      const row = sources.split("\n").find((line) => line.includes(source));
      expect(row).toContain("**held**");
    }
    expect(sources.split("\n").find((line) => line.includes("`cloudflare-developer-platform`"))).toContain("**keep**");
    expect(sources).toContain("sharing a host never grants access to another repository");
  });

  it("records the exact service boundaries and owner-only external authority", async () => {
    const audit = await repoText("docs/WEBDEV-SIGNAL-FOUNDING.md");
    expect(audit).toContain("`goviral-intelligence/1`");
    expect(audit).toContain("`bounded-render-summary/1`");
    expect(audit).toContain("`approved-publish-package/1`");
    for (const denied of ["Caught Up/DNESKAi", "devShark", "Personal Growth", "Kvórum", "Door Money"]) {
      expect(audit).toContain(denied);
    }
    expect(audit).toContain("Accounts, handles, OAuth, App Review, credentials and routine scopes remain owner-only");
    expect(audit).toContain("`$0.03` per selected day and `$0.75` per calendar month");
  });
});
