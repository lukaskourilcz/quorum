import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/sources/adapters/util.js", async original => ({ ...await original<object>(), fetchJson: vi.fn(), fetchText: vi.fn() }));
import { fetchJson, fetchText } from "../src/sources/adapters/util.js";
import { fetchHn } from "../src/sources/adapters/hn.js";
import { fetchGithub } from "../src/sources/adapters/github.js";
import { fetchReadable } from "../src/sources/adapters/reader.js";
import { fetchHtml } from "../src/sources/adapters/html.js";
import type { SourceConfig } from "../src/sources/types.js";
const source: SourceConfig = { id: "fixture", kind: "hn", name: "Fixture", url: "https://hacker-news.firebaseio.com/v0/newstories.json", weight: 0.5, tags: ["ai"], enabled: true, stage: ["caught-up"], maxItems: 2 };
const now = new Date("2026-10-13T20:00:00Z");
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("existing adapters expose bounded collection diagnostics", () => {
  it("reports HN cap plus one failed item while retaining the successful item", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([1, 2, 3]).mockResolvedValueOnce({ id: 1, type: "story", title: "Actual fixture item", time: 1791910000 }).mockRejectedValueOnce(new Error("secret"));
    const reportIssue = vi.fn();
    const items = await fetchHn(source, { now, allowHosts: [], reportIssue });
    expect(items).toHaveLength(1); expect(reportIssue.mock.calls).toEqual([["upstream-cap"], ["fetch-failed"]]);
  });
  it("reports per-repository failures instead of silently declaring complete releases", async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error("secret")); const reportIssue = vi.fn();
    expect(await fetchGithub({ ...source, kind: "github", repos: ["fixture/repo"] }, { now, allowHosts: [], reportIssue })).toEqual([]);
    expect(reportIssue).toHaveBeenCalledWith("fetch-failed");
  });
  it("preserves the existing default reader policy outside free collection", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", ""); vi.stubEnv("JINA_API_KEY", "");
    vi.mocked(fetchText).mockResolvedValueOnce("Fixture readable article");
    expect(await fetchReadable(source.url, { now, allowHosts: ["r.jina.ai"] })).toBe("Fixture readable article");
    expect(vi.mocked(fetchText).mock.calls[0]?.[0]).toBe(`https://r.jina.ai/${source.url}`);
  });
  it("blocked HTML does not invoke Firecrawl or Jina in free collection", async () => {
    vi.mocked(fetchText).mockRejectedValueOnce(new Error("publisher denied")); const reportIssue = vi.fn();
    expect(await fetchHtml({ ...source, kind: "html" }, { now, allowHosts: [], reportIssue, allowPaidReaders: false })).toEqual([]);
    expect(fetchText).toHaveBeenCalledTimes(1); expect(fetchJson).not.toHaveBeenCalled();
    expect(reportIssue.mock.calls).toEqual([["fetch-failed"], ["reader-disabled"]]);
  });
});
