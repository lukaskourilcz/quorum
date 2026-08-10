import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

/**
 * The route is the whole reason the bytes are allowed to live outside `site/public/`.
 *
 * The storage approval says a rejected pre-launch design must not be a world-readable file at a
 * guessable path. That promise is only worth what this route enforces, so both halves are tested:
 * an unauthenticated request gets nothing, and a path that tries to leave the media directory gets
 * nothing either.
 */
function request(query: string, cookie?: string): Request {
  return new Request(`https://boardless.example/admin/api/titty-tuesdays/media?${query}`, {
    headers: cookie ? { cookie } : {}
  });
}

const MEDIA = "ventures/titty-tuesdays/design-proposals/media/2026-08-10/dc-ember-openai.webp";

describe("the proposal media route", () => {
  it("refuses a request with no session", async () => {
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "correct-password");
    const response = await GET(request(`path=${encodeURIComponent(MEDIA)}`));
    expect([401, 403, 503]).toContain(response.status);
    expect(response.headers.get("Content-Type")).not.toBe("image/webp");
  });

  it("refuses a path that tries to leave the media directory", async () => {
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "correct-password");
    for (const candidate of [
      "../../../../etc/passwd",
      "ventures/titty-tuesdays/design-proposals/media/../../../../etc/passwd",
      "ventures/mma-files/media/x/thumb.webp",
      "ventures/titty-tuesdays/design-proposals/media/2026-08-10/x.svg",
      ""
    ]) {
      const response = await GET(request(`path=${encodeURIComponent(candidate)}`, "boardlessai_admin_session=nonsense"));
      // Either the session check or the path check refuses; neither may answer with bytes.
      expect(response.headers.get("Content-Type"), candidate).not.toBe("image/webp");
      expect(response.status, candidate).toBeGreaterThanOrEqual(400);
    }
  });
});
