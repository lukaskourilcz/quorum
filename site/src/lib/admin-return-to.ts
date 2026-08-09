/**
 * Where to send the owner after they sign in.
 *
 * An expired session used to drop them at `/admin` whatever they had been looking at, so a session
 * that timed out on `?venture=fightaiq&tab=slates` cost them the workspace and the tab as well as
 * the session. The path travels through the login round-trip as a query parameter, which means it
 * is attacker-controlled text and has to be treated as such: the only thing allowed out of here is
 * a same-origin path inside `/admin` that is not the login page itself.
 *
 * Imported by the proxy (edge) and the submit route (node), so it stays dependency-free.
 */
const MAX_LENGTH = 512;

export function sanitizeAdminReturnTo(candidate: unknown, base: string): string | null {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > MAX_LENGTH) return null;
  // A protocol-relative "//evil.example" parses against `base` as a different origin, and a
  // backslash is folded to a slash by some parsers before the origin check ever runs.
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return null;

  let url: URL;
  let origin: string;
  try {
    origin = new URL(base).origin;
    url = new URL(candidate, base);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  // `startsWith("/admin")` would also accept `/administrator` and anything else sharing the
  // prefix. The destination has to be the admin itself or something under it.
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return null;
  // Returning to the login page after logging in is a loop, and to its submit route is a GET at a
  // POST-only handler.
  if (url.pathname === "/admin/login" || url.pathname.startsWith("/admin/login/")) return null;

  const resolved = `${url.pathname}${url.search}`;
  return resolved.length <= MAX_LENGTH ? resolved : null;
}
