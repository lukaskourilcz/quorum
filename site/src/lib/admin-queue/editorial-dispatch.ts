import "server-only";
/** Wakes only reviewed article delivery; it cannot run a paid editorial cycle. */
export async function dispatchEditorialRelease(persistence: "github" | "filesystem"): Promise<string> {
  if (persistence === "filesystem") return "Saved locally. Run the reviewed-article delivery worker to deliver the article.";
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  if (!token || !/^[\w.-]+\/[\w.-]+$/u.test(repository)) return "Approval saved. Delivery could not start: GitHub is not configured.";
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/cycle.yml/dispatches`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: branch, inputs: { phase: "cu-edition", trigger: "manual", dry: "false", delivery_only: "true" } })
    });
    return response.ok ? "Article approved. Delivery to DNESKAi has been requested."
      : "Approval saved, but delivery could not start. The next Caught Up delivery run can retry it.";
  } catch { return "Approval saved, but GitHub could not be reached. The next Caught Up delivery run can retry it."; }
}
