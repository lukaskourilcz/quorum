import { describe, expect, it } from "vitest";
import { publicKindLabel } from "./slot-labels";

/**
 * The board had this map and nothing else did. The decisions feed carried its own chain of
 * conditionals whose final else was "Incubator synthesis", so every MMA Files and FightAIQ
 * meeting was published to the feed under the name of a room it had nothing to do with.
 */
describe("a slot is called the same thing everywhere", () => {
  it.each([
    ["mag-editorial", "MMA Files story meeting"],
    ["mag-desk", "MMA Files desk review"],
    ["mma-intake", "Fight data check"],
    ["mma-analysis", "Fight analysis review"],
    ["cu-edition", "DNESKAi edition production"],
    ["kv-desk", "Kvórum political recommendation desk"],
    ["dm-desk", "Door Money recommendation meeting"],
    ["dm-growth", "Door Money growth meeting"],
    ["bh-desk", "BOOKSOFHISTORY editorial desk"],
    ["ts-desk", "Tehdejší svět editorial desk"],
    ["article-am", "Morning MMA Files article"]
  ])("names %s", (kind, label) => {
    expect(publicKindLabel(kind)).toBe(label);
  });

  it("maps a company shift onto its calendar name", () => {
    expect(publicKindLabel("morning")).toBe("Morning company meeting");
    expect(publicKindLabel("night")).toBe("Night company meeting");
  });

  it("spells out a kind it has never seen rather than printing the slug", () => {
    expect(publicKindLabel("some_new_room")).toBe("some new room");
  });
});
