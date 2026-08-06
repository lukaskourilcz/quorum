import { describe, expect, it } from "vitest";
import { readsAsMachineText } from "./public-prose";
import { parsePublicMeetingRecord } from "./meeting-record-model";
import { meetingFixtures } from "../data/meeting-fixtures";

/**
 * The second of three layers. The first is the writer that makes the record, which now composes
 * sentences; the third is the plain-language pass at render time. This one exists because the
 * first layer failed in public on 5 August and nothing downstream noticed.
 */
describe("machine text never reaches a reader", () => {
  it.each([
    ["a CI runner path", "schema invalid: tsx scripts/consume.ts /home/runner/work/_temp/delivery-1"],
    ["a workflow link", "The run failed. See https://github.com/lukaskourilcz/quorum/actions/runs/30978478801"],
    ["a commit hash", "The release gate failed at commit 34aef4b3709c, so the room did not open."],
    ["a lowercase stop code", "no edition. stet_block_after_rewrite"],
    ["a shouted stop code", "NO_EDITION. budget_exhausted"],
    ["the outcome repeated at the reader", "EDITION. The digest cleared every gate."],
    ["a raw idea reference", "VAULT hard-stopped idea-2026-08-05-bbffd7f5 as a duplicate."],
    ["a raw agenda reference", "Opened against agenda-1f7e454d7495c427."],
    ["a raw source reference", "Cited source:the-odds-api:2026-08-05 for the price."]
  ])("rejects %s", (_name, value) => {
    expect(readsAsMachineText(value)).toBe(true);
  });

  it.each([
    ["a plain failure sentence", "The finished edition did not match the delivery format the magazine accepts."],
    ["a code the label map knows", "Delivery is NEEDS_RECONCILIATION today."],
    ["a shouted scope note", "DATA_ONLY. No probability, bookmaker link or bet placement is authorized."],
    ["an agent id", "AUDIT blocked the idea and HERALD recorded it."],
    ["a shouted English word", "No BUILD task was assigned today."],
    ["an all-caps compound the label pass lowercases", "This is MMA-ANALYSIS phase."],
    ["hyphenated English", "The source-backed subject cleared its source-independence check."],
    ["a Czech headline", "Tři laboratoře, jeden evaluátor a devatenáct útoků, které nikdo nečekal."]
  ])("passes %s", (_name, value) => {
    expect(readsAsMachineText(value)).toBe(false);
  });

  it("drops a whole record rather than render its leak", () => {
    const leaking = structuredClone(meetingFixtures[0]) as { decision: { summary: string } };
    expect(parsePublicMeetingRecord(leaking)).not.toBeNull();
    leaking.decision.summary =
      "schema_invalid: tsx scripts/consume-edition-package.ts /home/runner/work/quorum/quorum/state";
    expect(parsePublicMeetingRecord(leaking)).toBeNull();
  });

  it("keeps every committed fixture readable", () => {
    for (const fixture of meetingFixtures) {
      expect(parsePublicMeetingRecord(fixture)).not.toBeNull();
    }
  });
});
