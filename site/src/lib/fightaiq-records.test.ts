import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fighterHref, parsePublicEvent, parsePublicFighter, parsePublicModelRun, parsePublicTrackRecord } from "./fightaiq-records";

vi.mock("server-only", () => ({}));

const fixture = async (name: string) => JSON.parse(await readFile(path.resolve(process.cwd(), "..", "contracts", "fixtures", name), "utf8"));

describe("FightAIQ public record checks", () => {
  it("accepts the contract fixtures and builds safe fighter links", async () => {
    const fighter = parsePublicFighter(await fixture("fighter-record.valid.json"));
    const event = parsePublicEvent(await fixture("event-card.valid.json"));
    expect(fighter?.id).toBe("ufc:alex-example");
    expect(event?.org).toBe("ufc");
    expect(fighterHref("oktagon:losene-keita")).toBe("https://mma-files.vercel.app/en/fighters/oktagon/losene-keita");
    expect(parsePublicModelRun(await fixture("model-run.valid.json"))?.[0]).toMatchObject({ boutRef: "bout-1", modelVersion: "mma-1.0.0+aaaaaaaa" });
    expect(parsePublicTrackRecord(await fixture("track-record.valid.json"))?.picks[0]).toMatchObject({ closing: 0.56, clv: 0.02, brierContribution: null });
  });

  it("hides poisoned and unsafe records", async () => {
    expect(parsePublicFighter(await fixture("fighter-record.poison.json"))).toBeNull();
    expect(parsePublicEvent(await fixture("event-card.poison.json"))).toBeNull();
    expect(fighterHref("ufc:../../admin")).toBeNull();
  });
});
