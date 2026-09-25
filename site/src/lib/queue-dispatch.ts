import "server-only";
import type { QueueDispatchReason, QueueDispatchView } from "@/lib/admin-queue/types";

/**
 * The Queue's wake-up for the social publisher (quorum#574).
 *
 * After the owner approves a post, this starts `social-publisher.yml` through `workflow_dispatch`
 * so the post goes out without another step. It is a wake-up, not authority: it asks for the one
 * thing the workflow's own "Run workflow" form offers, a run with `validate_only` off, and the run
 * decides everything else — the kill switch, the channel, the connection, activation, cadence and
 * every check. A run that finds nothing due ends without a change.
 *
 * The Admin therefore never decides from its own copy of the repository whether a post may send.
 * That copy is as old as the last deploy, so a connection the owner activated since would read as
 * held here while the publisher, which checks out the branch, sees it live.
 *
 * A wake-up that fails leaves the item `queued`, and says so; the next approval or a run started
 * from GitHub Actions picks it up inside its window. No schedule does yet: the workflow's hourly
 * cron stays commented out until a later decision (docs/SOCIAL-DAILY-OPERATIONS.md).
 */

export const SOCIAL_PUBLISHER_WORKFLOW = "social-publisher.yml";

export interface QueueDispatchRequest {
  /** Where the approval was saved. Only GitHub's copy is what the publisher reads. */
  persistence: "github" | "filesystem";
  publishWindow: { notBefore: string; notAfter: string };
  now: Date;
}

export interface QueueDispatchOutcome extends QueueDispatchView {
  /** One sentence for the owner on what happened to the wake-up. */
  detail: string;
}

const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
// Every other admin write waits on GitHub too; ten seconds is long enough for a slow answer and
// short enough that an approval already saved is not left looking unsaved.
const TIMEOUT_MS = 10_000;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const BRANCH = /^(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/u;
const RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d{1,20}$/u;

const pragueTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });

function outcome(state: QueueDispatchOutcome["state"], reason: QueueDispatchReason, detail: string, runUrl: string | null = null): QueueDispatchOutcome {
  return { state, reason, runUrl, detail };
}

/** GitHub's page for the run, when API version 2026-03-10 answered 200 with the run's details. */
async function runUrlOf(response: Response): Promise<string | null> {
  if (response.status !== 200) return null;
  try {
    const body = await response.json() as { html_url?: unknown };
    return typeof body.html_url === "string" && RUN_URL.test(body.html_url) ? body.html_url : null;
  } catch {
    return null;
  }
}

function refusal(status: number, branch: string): QueueDispatchOutcome {
  if (status === 401 || status === 403) {
    return outcome("failed", "refused", `GitHub refused to start the publisher (${status}); the token needs the Actions write permission listed in NEEDED.md.`);
  }
  if (status === 404) return outcome("failed", "not-found", "GitHub did not find the publisher workflow, or the token cannot see this repository's Actions (404).");
  if (status === 422) return outcome("failed", "rejected", `GitHub rejected the dispatch (422); the publisher workflow on ${branch} does not accept it.`);
  return outcome("failed", "remote", `GitHub could not start the publisher (${status}).`);
}

export async function dispatchSocialPublisher(request: QueueDispatchRequest): Promise<QueueDispatchOutcome> {
  if (request.persistence !== "github") {
    return outcome("skipped", "local-checkout", "It was saved to this checkout rather than to GitHub, so the publisher, which reads GitHub, was not started.");
  }
  if (Date.parse(request.publishWindow.notAfter) <= request.now.getTime()) {
    return outcome("skipped", "window-closed", "Its window has closed, so there is nothing left for the publisher to send.");
  }
  const opens = Date.parse(request.publishWindow.notBefore);
  if (opens > request.now.getTime()) {
    // The runner takes only items inside their window, so a run started now would find nothing.
    return outcome("skipped", "window-not-open", `Its window opens ${pragueTime.format(new Date(opens))} Prague time, and no schedule starts the publisher yet: run it from GitHub Actions with validate_only off once the window is open.`);
  }
  const token = process.env[TOKEN_ENV];
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  if (!token || !REPOSITORY.test(repository) || !BRANCH.test(branch)) {
    return outcome("failed", "unconfigured", "This deployment has no usable GitHub token or repository setting to start the publisher with.");
  }
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${SOCIAL_PUBLISHER_WORKFLOW}/dispatches`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10"
      },
      // A string, as the "Run workflow" form and `gh workflow run -f` send it: GitHub accepts a
      // string for every input type, and the workflow compares the rendered value to "true".
      body: JSON.stringify({ ref: branch, inputs: { validate_only: "false" } }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    return outcome("failed", "unreachable", "GitHub could not be reached to start the publisher.");
  }
  // 200 with the run's details under API version 2026-03-10; 204 under the versions before it.
  if (response.status === 200 || response.status === 204) {
    return outcome("dispatched", "started", "The publisher runs within a few minutes.", await runUrlOf(response));
  }
  return refusal(response.status, branch);
}
