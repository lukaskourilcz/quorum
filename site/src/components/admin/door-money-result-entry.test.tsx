import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import { DoorMoneyResultEntry, doorMoneyOwnerResultEnvelope } from "./door-money-result-entry";

const metrics = {
  views: "42", likes: "", comments: "", shares: "", saves: "4", follows: "", linkTaps: "2"
};

describe("Door Money owner-result entry", () => {
  it("builds only a bounded, manual envelope with at least one whole metric", () => {
    expect(doorMoneyOwnerResultEnvelope({
      recommendationId: "fixture-radio-carousel",
      platform: "instagram",
      outcome: "  A synthetic owner-entered outcome.  ",
      metrics
    })).toEqual({
      recommendationId: "fixture-radio-carousel",
      platform: "instagram",
      metrics: { views: 42, saves: 4, linkTaps: 2 },
      outcome: "A synthetic owner-entered outcome."
    });
    expect(doorMoneyOwnerResultEnvelope({
      recommendationId: "fixture-radio-carousel", platform: "instagram", outcome: "Synthetic outcome.",
      metrics: { ...metrics, views: "-1", saves: "", linkTaps: "" }
    })).toBeNull();
  });

  it("renders the explicit manual posture and disables result writes on a read-only deployment", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <DoorMoneyResultEntry initialResults={[]} intent="A synthetic intent." platforms={["instagram", "threads"]}
          postedUrl="https://example.test/posts/synthetic-radio" recommendationId="fixture-radio-carousel" />
      </AdminWriteProvider>
    );
    expect(html).toContain("does not collect analytics");
    expect(html).toContain("Visible metrics (at least one required)");
    expect(html).toContain("Outcome (required)");
    expect(html).toContain("Record owner result");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});
