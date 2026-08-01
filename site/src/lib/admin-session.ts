import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "boardlessai_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const TOKEN_VERSION = "v1";

function signature(payload: string, user: string, password: string): string {
  return createHmac("sha256", `boardlessai-admin\0${user}\0${password}`)
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function createAdminSessionToken(
  user: string,
  password: string,
  now = Date.now()
): string {
  const expiresAt = Math.floor(now / 1_000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${signature(payload, user, password)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  user: string | undefined,
  password: string | undefined,
  now = Date.now()
): "ok" | "missing_config" | "denied" {
  if (!user || !password) return "missing_config";
  if (!token) return "denied";

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return "denied";
  const expiresAt = Number(parts[1]);
  const nowSeconds = Math.floor(now / 1_000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowSeconds ||
    expiresAt > nowSeconds + ADMIN_SESSION_MAX_AGE_SECONDS
  ) {
    return "denied";
  }

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = signature(payload, user, password);
  return safeEqual(parts[2] ?? "", expected) ? "ok" : "denied";
}

export function adminSessionCookie(token: string) {
  return {
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production"
  };
}
