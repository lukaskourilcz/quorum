import "server-only";

export class MmaBannerDeliveryError extends Error {}

export async function dispatchMmaBannerDelivery(): Promise<void> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (!token) throw new MmaBannerDeliveryError("BOARDLESSAI_GITHUB_TOKEN is not configured, so delivery cannot be dispatched.");
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/cycle.yml/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10"
    },
    body: JSON.stringify({
      ref: branch,
      inputs: { phase: "mag-desk", trigger: "manual", dry: false, delivery_only: true }
    })
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new MmaBannerDeliveryError(`GitHub refused the delivery dispatch with ${response.status}; the token needs Actions write access.`);
    throw new MmaBannerDeliveryError(`GitHub delivery dispatch failed with ${response.status}.`);
  }
}
