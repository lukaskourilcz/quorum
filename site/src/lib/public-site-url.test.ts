import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicSiteUrl } from "./public-site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public site URL", () => {
  it("honors an explicit canonical URL", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.com");

    expect(getPublicSiteUrl()).toBe("https://example.com");
  });

  it("uses the known production URL when production configuration is absent", () => {
    vi.stubEnv("PUBLIC_SITE_URL", undefined);
    vi.stubEnv("NODE_ENV", "production");

    expect(getPublicSiteUrl()).toBe("https://quorum-site-chi.vercel.app");
  });
});
