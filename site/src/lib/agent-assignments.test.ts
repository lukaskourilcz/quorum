import { describe, expect, it } from "vitest";
import { agentById } from "@/data/agents";
import { publicAgentAssignment, publicAgentAssignments } from "./agent-assignments";

function agent(id: "HACEK" | "QUILL" | "GHOST" | "FOLIO" | "LETOPIS" | "TRIBUN") {
  const value = agentById.get(id);
  if (!value) throw new Error(`${id} must be registered`);
  return value;
}

describe("public agent assignments", () => {
  it("names every recorded HACEK venture and keeps QUILL global", () => {
    expect(publicAgentAssignments(agent("HACEK"))).toEqual([
      "DNESKAi",
      "MMA Files",
      "Kvórum",
      "BOOKSOFHISTORY",
      "Tehdejší svět"
    ]);
    expect(publicAgentAssignment(agent("QUILL"))).toBe("Every venture");
  });

  it.each([
    ["GHOST", "Door Money"],
    ["FOLIO", "BOOKSOFHISTORY"],
    ["LETOPIS", "Tehdejší svět"],
    ["TRIBUN", "Kvórum"]
  ] as const)("names %s's venture", (id, expected) => {
    expect(publicAgentAssignment(agent(id))).toBe(expected);
  });

  it("drops an invalid machine id instead of printing it publicly", () => {
    expect(publicAgentAssignment({ ventures: ["private-machine-path"] })).toBe("No venture assignment recorded");
  });
});
