import { describe, expect, it, vi } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import { ventureLabel } from "./daily-results";

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
