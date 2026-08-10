import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { dispatchMmaBannerDelivery } from "./mma-banner-delivery";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("MMA banner delivery dispatch", () => {
  it("requests only the guarded manual delivery-only path", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
    vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "claude/mma-files-redesign-2sacl9");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await dispatchMmaBannerDelivery();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/actions/workflows/cycle.yml/dispatches");
    expect(JSON.parse(String(init.body))).toEqual({
      ref: "claude/mma-files-redesign-2sacl9",
      inputs: { phase: "mag-desk", trigger: "manual", dry: false, delivery_only: true }
    });
  });

  it("refuses to pretend a dispatch happened without a token", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    await expect(dispatchMmaBannerDelivery()).rejects.toThrow(/not configured/u);
  });
});
