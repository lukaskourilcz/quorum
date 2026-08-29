import path from "node:path";
import { pathToFileURL } from "node:url";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { refreshSocialActivation, SOCIAL_VENTURES } from "./activation.js";
import { TT_SAFETY_CHECKER_VERSION } from "./tt-safety.js";

/**
 * Recompute how far each venture is from its own publishing gate.
 *
 * The counters were three weeks stale, and the reason was circular. `refreshSocialActivation` is
 * only reached from inside `runSocialPublisher`, and that workflow's schedule is commented out
 * on purpose — every channel is off, so twenty-four firings a day existed to confirm there was
 * nothing to publish. So the numbers that gate the channels could only be refreshed by the thing
 * the channels gate, and `state/social/activation.json` sat at 5 August saying DNESKAi was 2/7
 * while the magazine went on delivering.
 *
 * Running it from the daily cycle costs nothing: no model call, no network, no credential. It
 * reads delivery records and campaign records off disk and counts them.
 *
 * It cannot publish anything, and that is a property of the runner rather than of this file: a
 * post additionally requires `SOCIAL_KILL_SWITCH === "false"`, a channel with `autopublish` the
 * owner approved through the INBOX, and credentials that do not exist. A venture reaching
 * `enabled` here means its own readiness count is met — the distance the launch board shows —
 * and nothing more.
 */
async function main(): Promise<void> {
  const activation = await refreshSocialActivation({
    repoRoot,
    stateRoot,
    configRoot,
    safetyCheckerReady: TT_SAFETY_CHECKER_VERSION === "keeper-tt-1"
  });
  for (const venture of SOCIAL_VENTURES) {
    const entry = activation.ventures[venture];
    if (!entry) continue;
    console.log(`${venture}: ${entry.counter}/${entry.required} ${entry.status} — ${entry.reason}`);
  }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
