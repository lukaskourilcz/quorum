import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Current state for authenticated admin readers. Never fall back to stale deployed state after a remote failure. */
function endpoint(relative: string): { url: string; headers: Record<string, string> } | null {
  if (!/^(?:state|config)\/[a-zA-Z0-9/._-]+$/u.test(relative) || relative.split("/").includes("..")) throw new Error("Invalid admin state path");
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (!token) return null;
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) throw new Error("Invalid admin repository");
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  return { url: `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } };
}

export async function readAdminJson(root: string, relative: string): Promise<unknown> {
  const remote = endpoint(relative);
  if (!remote) return JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
  const response = await fetch(remote.url, { headers: { ...remote.headers, Accept: "application/vnd.github.raw+json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw Object.assign(new Error(`Admin state read failed with ${response.status}`), { status: response.status, code: response.status === 404 ? "ENOENT" : "REMOTE" });
  return response.json();
}

export async function listAdminJson(root: string, relative: string): Promise<string[]> {
  const remote = endpoint(relative);
  if (!remote) return (await readdir(path.join(root, relative))).filter(name => /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(name)).sort();
  const response = await fetch(remote.url, { headers: remote.headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw Object.assign(new Error("Admin state could not be listed"), { code: response.status === 404 ? "ENOENT" : "REMOTE" });
  const items: unknown = await response.json();
  // Contents listings truncate at 1,000. Refuse an incomplete inventory instead of approving from it.
  if (!Array.isArray(items) || items.length >= 1000) throw new Error("Admin directory needs archival before it can be read completely");
  return items.flatMap(item => typeof item === "object" && item !== null && "type" in item && item.type === "file" && "name" in item && typeof item.name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(item.name) ? [item.name] : []).sort();
}

export async function readAdminSocialImage(root: string, relative: string): Promise<Uint8Array> {
  if (!/^site\/public\/social\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g)$/u.test(relative)) throw new Error("Invalid social image path");
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (!token) return new Uint8Array(await readFile(path.join(root, relative)));
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) throw new Error("Invalid admin repository");
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${relative}?ref=${encodeURIComponent(branch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" }, cache: "no-store", signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error("Social image unavailable");
  return new Uint8Array(await response.arrayBuffer());
}
