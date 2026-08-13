import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TehdejsiSignalDigestSchema, TehdejsiSignalHarvestSchema } from "../src/contracts/tehdejsi-signal.js";
import { extractSundaySignalDigest, runSundaySignalOverlay } from "../src/ventures/tehdejsi-svet/signals.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function harvest(id: string, pastedAt: string, comments: string[]) {
  return TehdejsiSignalHarvestSchema.parse({
    schemaVersion: "ts-signal/1", kind: "harvest", id, ventureId: "tehdejsi-svet", source: "owner-paste",
    sourceLabel: "Synthetic owner paste", pastedAt, comments
  });
}

describe("Tehdejsi svet community signals", () => {
  it("extracts recurrence deterministically while every line and correction remains a recollection", () => {
    const digest = extractSundaySignalDigest({
      date: "2026-08-16",
      extractedAt: "2026-08-16T16:00:00.000Z",
      harvests: [
        harvest("ts-signal-harvest-11111111111111111111", "2026-08-15T10:00:00.000Z", [
          "[theme: fictional tram rides] [city: Testov] [year: 1988] I remember a made-up bell.",
          "[correction: The invented timetable may be wrong.] A synthetic correction request."
        ]),
        harvest("ts-signal-harvest-22222222222222222222", "2026-08-15T11:00:00.000Z", [
          "[theme: fictional tram rides] [city: Testov] Another imaginary memory."
        ])
      ]
    });
    expect(TehdejsiSignalDigestSchema.safeParse(digest).success).toBe(true);
    expect(digest.themes).toEqual([{ label: "fictional tram rides", recurrence: 2, lastSeenAt: "2026-08-15T11:00:00.000Z" }]);
    expect(digest.requests).toEqual([
      { kind: "city", value: "Testov", recurrence: 2, lastSeenAt: "2026-08-15T11:00:00.000Z" },
      { kind: "year", value: "1988", recurrence: 1, lastSeenAt: "2026-08-15T10:00:00.000Z" }
    ]);
    expect([...digest.recollections, ...digest.correctionClaims]).toEqual(expect.arrayContaining([
      expect.objectContaining({ classification: "recollection-not-fact", allowedUses: ["research-question", "prompt-seed"] })
    ]));
    expect(JSON.stringify(digest)).not.toContain("verified-fact");
    expect(extractSundaySignalDigest({ ...digest, harvests: [
      harvest("ts-signal-harvest-11111111111111111111", "2026-08-15T10:00:00.000Z", [
        "[theme: fictional tram rides] [city: Testov] [year: 1988] I remember a made-up bell.",
        "[correction: The invented timetable may be wrong.] A synthetic correction request."
      ]),
      harvest("ts-signal-harvest-22222222222222222222", "2026-08-15T11:00:00.000Z", ["[theme: fictional tram rides] [city: Testov] Another imaginary memory."])
    ] })).toEqual(digest);
  });

  it("writes only on Sunday, only after approval, and consumes each canonical harvest once", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-signals-")); roots.push(root);
    const directory = path.join(root, "ventures/tehdejsi-svet/signals/harvests");
    await mkdir(directory, { recursive: true });
    const record = harvest("ts-signal-harvest-33333333333333333333", "2026-08-15T12:00:00.000Z", ["[theme: synthetic radios] A fictional radio memory."]);
    await writeFile(path.join(directory, `${record.id}.json`), `${JSON.stringify(record)}\n`);
    await writeFile(path.join(directory, "wrong-name.json"), `${JSON.stringify({ ...record, id: "ts-signal-harvest-44444444444444444444" })}\n`);
    await writeFile(path.join(directory, "poison.json"), "not-json\n");

    expect(await runSundaySignalOverlay({ root, date: "2026-08-15", now: new Date("2026-08-15T16:00:00.000Z"), approvalGranted: true })).toEqual([]);
    expect(await runSundaySignalOverlay({ root, date: "2026-08-16", now: new Date("2026-08-16T16:00:00.000Z"), approvalGranted: false })).toEqual([]);
    const paths = await runSundaySignalOverlay({ root, date: "2026-08-16", now: new Date("2026-08-16T16:00:00.000Z"), approvalGranted: true });
    expect(paths).toHaveLength(1);
    const stored = JSON.parse(await readFile(path.join(root, paths[0]!), "utf8")) as { sourceHarvestIds: string[] };
    expect(stored.sourceHarvestIds).toEqual([record.id]);
    expect(await runSundaySignalOverlay({ root, date: "2026-08-16", now: new Date("2026-08-16T17:00:00.000Z"), approvalGranted: true })).toEqual([]);
  });
});
