import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSocialAttributionEvent, parseSocialBaseline, parseSocialBoostProposal, parseSocialExperiment, parseSocialResultObservation } from "./results-model";

const root = path.resolve(process.cwd(), "..");

describe("Social Distribution Admin result parsers", () => {
  it("projects only bounded aggregate evidence from the valid contracts", async () => {
    const fixture = JSON.parse(await readFile(path.join(root, "contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as Record<string, unknown>;
    expect(parseSocialResultObservation(fixture.observation)).toMatchObject({ targetRole: "primary", metrics: [], unavailableReason: "missing-permission" });
    expect(parseSocialAttributionEvent(fixture.attribution)).toMatchObject({ eventType: "qualified-action", attribution: { state: "attributed", targetRole: "primary" } });
    expect(parseSocialBaseline(fixture.baseline)).toMatchObject({ status: "complete", elapsedDays: 28 });
    expect(parseSocialExperiment(fixture.experiment)).toMatchObject({ verdict: "INSUFFICIENT_DATA", evidenceCount: 0 });
    expect(parseSocialBoostProposal(fixture.boostProposal)).toMatchObject({ status: "held-owner-proposal" });
  });

  it("drops identity/private-message fields and dishonest missing metrics", async () => {
    const fixture = JSON.parse(await readFile(path.join(root, "contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as { observation: Record<string, unknown>; attribution: Record<string, unknown> };
    expect(parseSocialResultObservation({ ...fixture.observation, visitorId: "person-1" })).toBeNull();
    expect(parseSocialResultObservation({ ...fixture.observation, privateMessage: "body" })).toBeNull();
    expect(parseSocialResultObservation({ ...fixture.observation, metrics: [{ name: "reach", value: null, unavailableReason: null }] })).toBeNull();
    expect(parseSocialAttributionEvent({ ...fixture.attribution, identityExcluded: false })).toBeNull();
  });
});
