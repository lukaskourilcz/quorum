import { afterEach, describe, expect, it, vi } from "vitest";
import { adminWritesEnabled } from "./admin-write-permission";

afterEach(() => vi.unstubAllEnvs());

describe("admin deployment write permission", () => {
  it("fails closed in production without the canonical GitHub token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");

    expect(adminWritesEnabled()).toBe(false);
  });

  it("keeps production saves available when the token is provisioned", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "configured-token");

    expect(adminWritesEnabled()).toBe(true);
  });

  it("keeps local authoring writable without a deployment token", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");

    expect(adminWritesEnabled()).toBe(true);
  });
});
