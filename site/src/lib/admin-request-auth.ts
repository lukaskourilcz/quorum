import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken
} from "./admin-session";

function requestCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function verifyAdminRequest(
  request: Request
): "ok" | "missing_config" | "denied" {
  return verifyAdminSessionToken(
    requestCookie(request, ADMIN_SESSION_COOKIE),
    process.env.ADMIN_USER,
    process.env.ADMIN_PASSWORD
  );
}

export function adminAuthorizationError(
  authorization: "missing_config" | "denied"
): Response {
  return Response.json(
    {
      error:
        authorization === "missing_config"
          ? "Admin login is not configured."
          : "Your admin session expired. Sign in again."
    },
    {
      status: authorization === "missing_config" ? 503 : 401,
      headers: { "Cache-Control": "no-store, private" }
    }
  );
}
