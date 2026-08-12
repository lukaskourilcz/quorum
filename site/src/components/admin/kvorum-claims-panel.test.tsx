import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KvorumClaimsPanel } from "./kvorum-claims-panel";

describe("the pre-ledger Kvórum claims surface", () => {
  it("does not promote draft evidence into a published claim or offer an untyped correction", () => {
    const html = renderToStaticMarkup(<KvorumClaimsPanel />);
    expect(html).toContain("No published-claim ledger is stored yet");
    expect(html).toContain("standing, corrected or retracted status");
    expect(html).toContain("cannot draft a correction without a canonical claim record");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});
