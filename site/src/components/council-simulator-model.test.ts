import routingSource from "../../../config/agent-routing.json";
import { describe, expect, it } from "vitest";
import type { AgentId } from "../data/agents";
import type { RoomTranscript } from "../data/fixtures";
import {
  buildCouncilRoomPreviews,
  buildCouncilSetupUrl,
  getRecordedRelationships,
  parseCouncilSetup
} from "./council-simulator-model";

const agentIds = [
  "VIZE",
  "FORGE",
  "PULSE",
  "AUDIT",
  "SCOUT",
  "SCRIBE",
  "LENS",
  "QUILL",
  "RADAR",
  "KEEPER",
  "THREADS",
  "INSTAGRAM",
  "PEOPLE",
  "LEDGER"
] satisfies AgentId[];

const previews = buildCouncilRoomPreviews(routingSource, agentIds);

describe("Council Simulator model", () => {
  it("routes preset, owner, reviewer and mandatory control seats", () => {
    const publicClaim = previews.find(
      (scenario) => scenario.id === "public-claim"
    );
    const incident = previews.find(
      (scenario) => scenario.id === "incident-response"
    );

    expect(publicClaim?.participants.map((item) => item.agent)).toEqual([
      "PULSE",
      "QUILL",
      "AUDIT",
      "KEEPER"
    ]);
    expect(incident?.participants.map((item) => item.agent)).toEqual([
      "AUDIT",
      "KEEPER",
      "FORGE"
    ]);
  });

  it("keeps every non-routed agent visible on standby", () => {
    const evidence = previews.find(
      (scenario) => scenario.id === "evidence-review"
    );
    expect(evidence?.participants.map((item) => item.agent)).toEqual([
      "VIZE",
      "SCOUT"
    ]);
    expect(evidence?.standby).toHaveLength(12);
    expect(evidence?.standby).toContain("LEDGER");
  });

  it("derives relationships only from explicitly addressed turns", () => {
    const transcript = {
      openedAt: "2026-07-23T05:28:00.000Z",
      closedAt: "2026-07-23T05:30:00.000Z",
      gavel: "VIZE",
      setting: "Fixture",
      turns: [
        { agent: "VIZE", mode: "gavel", text: "Open." },
        {
          agent: "FORGE",
          addressedTo: "VIZE",
          mode: "response",
          text: "Reply."
        },
        {
          agent: "VIZE",
          addressedTo: "FORGE",
          mode: "response",
          text: "Reply."
        },
        { agent: "AUDIT", mode: "statement", text: "Unaddressed." }
      ]
    } satisfies RoomTranscript;

    expect(getRecordedRelationships(transcript, "VIZE")).toEqual({
      speakingTurns: 2,
      relationships: [
        {
          counterpart: "FORGE",
          directExchanges: 2,
          incoming: 1,
          outgoing: 1
        }
      ]
    });
  });

  it("parses only routed seats and falls back to the room owner", () => {
    expect(
      parseCouncilSetup("?room=public-claim&seat=QUILL", previews)
    ).toEqual({
      scenarioId: "public-claim",
      seatId: "QUILL"
    });
    expect(
      parseCouncilSetup("?room=public-claim&seat=SCOUT", previews)
    ).toEqual({
      scenarioId: "public-claim",
      seatId: "PULSE"
    });
    expect(parseCouncilSetup("?room=unknown&seat=VIZE", previews)).toBeNull();
  });

  it("builds an exact setup URL without discarding unrelated parameters", () => {
    expect(
      buildCouncilSetupUrl("https://example.com/boardroom?ref=home", {
        scenarioId: "incident-response",
        seatId: "KEEPER"
      })
    ).toBe(
      "https://example.com/boardroom?ref=home&room=incident-response&seat=KEEPER#council-simulator"
    );
  });
});
