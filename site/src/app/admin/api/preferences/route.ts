import { NextResponse } from "next/server";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  ADMIN_RAIL_COOKIE,
  ADMIN_THEME_COOKIE,
  parseAdminShellPreferencePatch
} from "@/lib/admin-shell-preferences";
import { MAX_ADMIN_PREFERENCE_BYTES } from "@/lib/admin-route-limits";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive"
};

function json(value: unknown, status: number): NextResponse {
  return NextResponse.json(value, { status, headers: privateHeaders });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Admin preference writes are not allowed." }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_ADMIN_PREFERENCE_BYTES) {
    return json({ error: `Admin preference payload exceeds ${MAX_ADMIN_PREFERENCE_BYTES} bytes.` }, 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_ADMIN_PREFERENCE_BYTES) {
    return json({ error: `Admin preference payload exceeds ${MAX_ADMIN_PREFERENCE_BYTES} bytes.` }, 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return json({ error: "Admin preference payload must be valid JSON." }, 400);
  }
  const patch = parseAdminShellPreferencePatch(value);
  if (!patch) return json({ error: "Choose a supported Admin preference." }, 422);

  const response = json({ ok: true }, 200);
  const options = {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/admin",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production"
  };
  if (patch.theme) {
    response.cookies.set({ name: ADMIN_THEME_COOKIE, value: patch.theme, ...options });
  }
  if (typeof patch.collapsed === "boolean") {
    response.cookies.set({
      name: ADMIN_RAIL_COOKIE,
      value: patch.collapsed ? "collapsed" : "expanded",
      ...options
    });
  }
  return response;
}
