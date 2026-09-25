import { describe, expect, it } from "vitest";
import { readQueueFixture } from "./fixture-root";
import { parseQueueItemV2 } from "./item";
import { linkedinTrackedLink, queueCaptionLimit } from "./linkedin";

/**
 * The site's copy of the orchestrator's tracked link. The same literal is pinned in
 * `orchestrator/tests/social-buffer.test.ts` for the same fixture, so the two cannot drift.
 */
describe("the LinkedIn caption budget", () => {
  it("builds the tracked link Buffer appends exactly as the orchestrator does", async () => {
    const item = parseQueueItemV2(await readQueueFixture("marketingshark-queue-linkedin.valid.json"))!;
    expect(linkedinTrackedLink(item)).toBe("https://devshark.app/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=marketingshark-devshark&utm_content=2026-09-26-en-rm-abbr-19");
    expect(queueCaptionLimit(item)).toBe(2_857);
  });

  it("leaves Instagram and Threads at their own limits", async () => {
    const linkedin = parseQueueItemV2(await readQueueFixture("marketingshark-queue-linkedin.valid.json"))!;
    const instagram = parseQueueItemV2(await readQueueFixture("marketingshark-queue-instagram.valid.json"))!;
    const threads = parseQueueItemV2(await readQueueFixture("marketingshark-queue-threads.valid.json"))!;
    expect([linkedin, instagram, threads].map((item) => item.channel)).toEqual(["linkedin", "instagram", "threads"]);
    expect(queueCaptionLimit(instagram)).toBe(2_200);
    expect(queueCaptionLimit(threads)).toBe(500);
  });
});
