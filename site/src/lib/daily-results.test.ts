import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { parseDailyResult, ventureLabel } from "./daily-results";

vi.mock("server-only", () => ({}));

describe("the daily results labels", () => {
  it("names every public venture rather than printing its registry id", () => {
    // The digest files each row under the venture the registry names for the slot. A venture
    // without a label here reached /results as its raw id, and marketingShark's and GoVIRAL's rows
    // used to read "Global board" because the digest filed them there.
    for (const venture of ventureRegistry.ventures.filter((entry) => entry.visibility === "public")) {
      expect(ventureLabel(venture.id), venture.id).not.toBe(venture.id);
    }
    expect(ventureLabel("marketingshark")).toBe("marketingShark");
    expect(ventureLabel("goviral")).toBe("GoVIRAL");
    expect(ventureLabel("webdev-signal")).toBe("WebDev Signal");
    expect(ventureLabel("global")).toBe("Global board");
  });
});

describe("a daily result row's status", () => {
  const receipt = (meeting: Record<string, unknown>) => ({
    digest: {
      date: "2026-09-24",
      meetings: [{ ventureId: "caught-up", kind: "cu-day", held: true, costUsd: 0.047319, ...meeting }],
      operations: [],
      portfolioLine: "Recorded API spend $0.0473 against the $1.00 daily budget."
    }
  });
  const nothingWritten = {
    text: "Today's candidate stories did not meet the source rules, so nothing was written.",
    roomLink: "/meetings/2026-09-24-cu-edition"
  };

  it("comes from the outcome the room recorded, not from the wording of its line (#577)", () => {
    // 2026-09-24: DNESKAi's edition room met and recorded NO_EDITION. The line is plain language,
    // and matching it for a NO_EDITION prefix called the day produced on /results and in the office.
    expect(parseDailyResult(receipt({ outcome: "NO_EDITION", bullets: [nothingWritten] }))?.rows[0]?.status).toBe("no-output");
    expect(parseDailyResult(receipt({ outcome: "EDITION", bullets: [{ ...nothingWritten, text: "The desk explained a verified model price cut." }] }))?.rows[0]?.status).toBe("produced");
    // The outcome decides even when the wording would say otherwise.
    expect(parseDailyResult(receipt({ outcome: "EDITION", bullets: [{ ...nothingWritten, text: "NO_EDITION was considered and set aside." }] }))?.rows[0]?.status).toBe("produced");
    for (const outcome of ["NO_ACTION", "NO_PROPOSAL"]) {
      expect(parseDailyResult(receipt({ outcome, bullets: [nothingWritten] }))?.rows[0]?.status, outcome).toBe("no-output");
    }
    // Not held and failed still come first.
    expect(parseDailyResult(receipt({ held: false, outcome: "EDITION", bullets: [nothingWritten] }))?.rows[0]?.status).toBe("not-held");
  });

  it("falls back to the line as written only for a receipt older than the outcome", async () => {
    // The committed August receipts carry no outcome. The earliest wrote it at the start of the
    // line, which the public rewrite turns into words, so the fallback reads the line as written.
    expect(parseDailyResult(receipt({ bullets: [{ ...nothingWritten, text: "NO_EDITION. The sources did not clear the gate." }] }))?.rows[0]?.status).toBe("no-output");
    const august = parseDailyResult(JSON.parse(await readFile(path.resolve(process.cwd(), "../state/notify/digest/2026-08-01.json"), "utf8")) as unknown);
    expect(august?.rows.find((row) => row.roomLink === "/meetings/2026-08-01-cu-edition")?.status).toBe("no-output");
    expect(parseDailyResult(receipt({ bullets: [nothingWritten] }))?.rows[0]?.status).toBe("produced");
    // A null outcome is a row no record decided, such as an article slot: its line decides.
    expect(parseDailyResult(receipt({ outcome: null, bullets: [{ ...nothingWritten, text: "The desk published this slot's article." }] }))?.rows[0]?.status).toBe("produced");
  });
});
