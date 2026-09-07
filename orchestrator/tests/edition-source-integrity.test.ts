import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { write } from "../src/edition/write.js";
import { loadEditionQualityConfig } from "../src/edition/config.js";
import { SourceItemSchema } from "../src/sources/types.js";
import type { CuratedBrief } from "../src/edition/types.js";

async function setup() {
  const raw = JSON.parse(await readFile(new URL("./fixtures/edition/source-items.json", import.meta.url), "utf8"));
  const items = raw.map((item: unknown) => SourceItemSchema.parse(item));
  const brief: CuratedBrief = { date: "2026-09-07", headline: "Example", angle: "Example", picks: items.slice(0, 3).map((item: { externalId: string }) => ({ itemId: item.externalId, why: "Source evidence", evidence: "confirmed_fact" as const })), usage: { provider: "anthropic", model: "fixture", stage: "curate", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 } };
  return { items, brief, config: await loadEditionQualityConfig(), gateway: { invoke: vi.fn() }, read: vi.fn() };
}
describe("writer source integrity before provider calls", () => {
  it.each(["missing", "duplicate", "ambiguous"])("refuses %s references without fetching or billing", async mode => {
    const { items, brief, config, gateway, read } = await setup();
    if (mode === "missing") brief.picks.push({ ...brief.picks[0]!, itemId: "absent-source" });
    if (mode === "duplicate") brief.picks.push(brief.picks[0]!);
    if (mode === "ambiguous") items.push({ ...items[0], url: "https://example.org/unrelated" });
    await expect(write(brief, items, config, gateway, [], new Date("2026-09-07"), read)).rejects.toThrow(/write: (selected|duplicate|ambiguous)/);
    expect(gateway.invoke).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
