import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fighterHref, parsePublicEvent, parsePublicFighter } from "./fightaiq-records";

vi.mock("server-only", () => ({}));

const fixture = async (name: string) => JSON.parse(await readFile(path.resolve(process.cwd(), "..", "contracts", "fixtures", name), "utf8"));

describe("FightAIQ public record checks", () => {
  it("accepts the contract fixtures and builds safe fighter links", async () => {
    const fighter = parsePublicFighter(await fixture("fighter-record.valid.json"));
    const event = parsePublicEvent(await fixture("event-card.valid.json"));
    expect(fighter?.id).toBe("ufc:alex-example");
    expect(event?.org).toBe("ufc");
    expect(fighterHref("oktagon:losene-keita")).toBe("/fighters/oktagon/losene-keita");
  });

  it("hides poisoned and unsafe records", async () => {
    expect(parsePublicFighter(await fixture("fighter-record.poison.json"))).toBeNull();
    expect(parsePublicEvent(await fixture("event-card.poison.json"))).toBeNull();
    expect(fighterHref("ufc:../../admin")).toBeNull();
  });
});
