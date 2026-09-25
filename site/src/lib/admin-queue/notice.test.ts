import { describe, expect, it } from "vitest";
import { queueActionFailure, queueActionNotice } from "./notice";

describe("what a Queue card says after an action", () => {
  it("reads a started publisher as a success and passes on GitHub's run page", () => {
    expect(queueActionNotice(true, {
      ok: true,
      message: "Queued. The publisher runs within a few minutes.",
      dispatch: { state: "dispatched", reason: "started", runUrl: "https://github.com/lukaskourilcz/quorum/actions/runs/42" }
    })).toEqual({ tone: "success", text: "Queued. The publisher runs within a few minutes.", runUrl: "https://github.com/lukaskourilcz/quorum/actions/runs/42" });
  });

  it("reads a saved approval whose wake-up failed, or waits for its window, as a warning", () => {
    const failed = queueActionNotice(true, { message: "Queued, but the publisher did not start.", dispatch: { state: "failed", reason: "refused", runUrl: null } });
    expect(failed).toEqual({ tone: "warning", text: "Queued, but the publisher did not start.", runUrl: null });
    expect(queueActionNotice(true, { message: "Queued for its window.", dispatch: { state: "skipped", reason: "window-not-open", runUrl: null } }).tone).toBe("warning");
    expect(queueActionNotice(true, { message: "Queued.", dispatch: { state: "skipped", reason: "local-checkout", runUrl: null } }).tone).toBe("success");
  });

  it("keeps every other action's answer as it was", () => {
    expect(queueActionNotice(true, { message: "Held. It will not be sent.", dispatch: null })).toEqual({ tone: "success", text: "Held. It will not be sent.", runUrl: null });
    expect(queueActionNotice(true, {})).toEqual({ tone: "success", text: "Saved.", runUrl: null });
    expect(queueActionNotice(false, { error: "The post changed since this page loaded.", code: "CONFLICT" })).toEqual({ tone: "destructive", text: "The post changed since this page loaded.", runUrl: null });
    expect(queueActionNotice(false, "not an object")).toEqual(queueActionFailure());
  });

  it("links only to a GitHub Actions run", () => {
    for (const runUrl of ["https://example.com/actions/runs/1", "javascript:alert(1)", "https://github.com/lukaskourilcz/quorum/settings", 42]) {
      expect(queueActionNotice(true, { message: "Queued.", dispatch: { state: "dispatched", reason: "started", runUrl } }).runUrl).toBeNull();
    }
  });
});
