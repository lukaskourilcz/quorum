import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

const APPROVAL_IDS = [
  "BOOK-SOURCE-001",
  "BOOK-INGEST-002",
  "DM-ACCOUNTS-003",
  "DM-RESULTS-004"
] as const;

function markdownItem(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const next = source.indexOf("\n- [", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("Door Money owner approvals", () => {
  /*
   * Originally these were asserted as pending: the items had just been filed and the test proved
   * they existed, unsigned, in the house shape. The owner approved every pending item on
   * 2026-08-29, so the same guarantee now reads off the resolved record — each item still appears
   * exactly once, still carries its full scope text, and still binds the gates that grep for its
   * ticked line. What must never pass is the item silently disappearing or losing its scope.
   */
  it("keeps each approved HUMAN_APPROVAL on file once, in the house shape", async () => {
    const inbox = await readFile(path.join(repoRoot, "state", "INBOX.md"), "utf8");
    const resolved = inbox.slice(inbox.indexOf("## Resolved"));
    for (const id of APPROVAL_IDS) {
      expect(inbox.match(new RegExp(`^- \\[[xX ]\\] HUMAN_APPROVAL ${id}\\b`, "gmu")), id)
        .toHaveLength(1);
      const item = markdownItem(resolved, `- [x] HUMAN_APPROVAL ${id}`);
      expect(item, id).toContain("What this approves, exactly:");
      expect(item, id).toContain("Approved by the owner on 2026-08-29");
    }

    const source = markdownItem(resolved, "- [x] HUMAN_APPROVAL BOOK-SOURCE-001");
    expect(source).toContain("BOOK_SOURCE_TOKEN");
    expect(source).toContain("BOOK_PRIVATE_CLONE_PATH");
    expect(source).toContain("600 characters");
    expect(source).toContain("40 exemplars");
    expect(source).not.toContain("BOOK_DB_URL");
    expect(source).not.toContain("BOOK_DB_KEY");

    const ingest = markdownItem(resolved, "- [x] HUMAN_APPROVAL BOOK-INGEST-002");
    expect(ingest).toContain("$3.00");
    expect(ingest).toContain("$0.80");
    expect(ingest).toContain("BOOK_INGEST");
    expect(ingest).toContain("BOOK_STYLE");
    expect(ingest).toContain('kind: "embedding"');

    const results = markdownItem(resolved, "- [x] HUMAN_APPROVAL DM-RESULTS-004");
    expect(results).toContain("METRICS_INGESTION_ENABLED=false");
    expect(results).toContain("D9");
  });

  it("gives the owner one matching NEEDED action per approval", async () => {
    const needed = await readFile(path.join(repoRoot, "docs", "NEEDED.md"), "utf8");
    for (const id of APPROVAL_IDS) {
      const matching = needed.split("\n- [").filter((item) => item.includes(id));
      expect(matching, id).toHaveLength(1);
      expect(matching[0]).toContain("[owner:me]");
    }
  });
});
