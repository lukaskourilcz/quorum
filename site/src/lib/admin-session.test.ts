import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken
} from "./admin-session";

describe("admin session", () => {
  const now = Date.parse("2026-08-01T12:00:00Z");

  it("accepts a signed, unexpired session", () => {
    const token = createAdminSessionToken("owner", "correct horse battery staple", now);
    expect(
      verifyAdminSessionToken(
        token,
        "owner",
        "correct horse battery staple",
        now + 60_000
      )
    ).toBe("ok");
  });

  it("rejects tampering, expiry and credential rotation", () => {
    const token = createAdminSessionToken("owner", "original", now);
    expect(verifyAdminSessionToken(`${token}x`, "owner", "original", now)).toBe("denied");
    expect(verifyAdminSessionToken(token, "owner", "rotated", now)).toBe("denied");
    expect(
      verifyAdminSessionToken(
        token,
        "owner",
        "original",
        now + (ADMIN_SESSION_MAX_AGE_SECONDS + 1) * 1_000
      )
    ).toBe("denied");
  });

  it("fails closed when login credentials are missing", () => {
    expect(verifyAdminSessionToken("token", undefined, undefined, now)).toBe(
      "missing_config"
    );
  });
});
