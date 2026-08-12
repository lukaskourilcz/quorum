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
  it("files each pending HUMAN_APPROVAL once in the house shape", async () => {
    const inbox = await readFile(path.join(repoRoot, "state", "INBOX.md"), "utf8");
    const pending = inbox.slice(inbox.indexOf("## Pending"), inbox.indexOf("## Resolved"));
    for (const id of APPROVAL_IDS) {
      expect(pending.match(new RegExp(`^- \\[ \\] HUMAN_APPROVAL ${id}\\b`, "gmu")))
        .toHaveLength(1);
      const item = markdownItem(pending, `- [ ] HUMAN_APPROVAL ${id}`);
      expect(item).toContain("What this approves, exactly:");
    }

    const source = markdownItem(pending, "- [ ] HUMAN_APPROVAL BOOK-SOURCE-001");
    expect(source).toContain("BOOK_SOURCE_TOKEN");
    expect(source).toContain("BOOK_PRIVATE_CLONE_PATH");
    expect(source).toContain("600 characters");
    expect(source).toContain("40 exemplars");
    expect(source).not.toContain("BOOK_DB_URL");
    expect(source).not.toContain("BOOK_DB_KEY");

    const ingest = markdownItem(pending, "- [ ] HUMAN_APPROVAL BOOK-INGEST-002");
    expect(ingest).toContain("$3.00");
    expect(ingest).toContain("$0.80");
    expect(ingest).toContain("BOOK_INGEST");
    expect(ingest).toContain("BOOK_STYLE");
    expect(ingest).toContain('kind: "embedding"');

    const results = markdownItem(pending, "- [ ] HUMAN_APPROVAL DM-RESULTS-004");
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
