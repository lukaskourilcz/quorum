/**
 * A deployed admin can only make canonical changes through the GitHub Contents API.
 * Local development remains writable without a token so fixtures and authoring tools continue
 * to work there; production must never advertise a save it cannot complete.
 */
export function adminWritesEnabled(): boolean {
  if (process.env.BOARDLESSAI_GITHUB_TOKEN) return true;
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}
