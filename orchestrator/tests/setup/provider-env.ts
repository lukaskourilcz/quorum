import { beforeEach } from "vitest";

/**
 * No test may see a provider credential, whatever the process was started with.
 *
 * Between 9 and 11 August the council held no meeting. The release gate runs `pnpm test` inside
 * the cycle job, which carries the cycle's own secrets, so a test that read `process.env` took the
 * paid illustration rung and failed on what that render actually returned. CI exported neither
 * switch, never took the rung, and reported green the whole time — three days of skipped rooms
 * where the gate and CI were answering different questions about the same commit.
 *
 * The instance was fixed by blanking two variables for the gate step in `cycle.yml`. The shape
 * survived that fix: any test reading ambient environment still behaves differently under the gate
 * than under CI, and the next one to do so closes the gate the same way. This ends the class
 * instead — the suite cannot observe a credential, so it cannot depend on one, so the two
 * environments cannot disagree.
 *
 * `beforeEach` rather than a one-time clear because a test may legitimately set a variable to
 * exercise a configured path; this puts every test back to the same floor rather than letting one
 * leak into the next. A test that needs a key still sets it itself, which is the honest way to say
 * "this case is about the configured path" — and it says so in the test rather than in the shell
 * that happened to launch it.
 */
export const CLEARED_PROVIDER_ENV = [
  // Model providers. The two that pay per token.
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  // The image programme's one paid rung, and its switch. These are the two from the August
  // incident, and the reason this file exists.
  "FAL_KEY",
  "ARTICLE_ILLUSTRATION_ENABLED",
  // Metered or quota-bearing sources.
  "APIFY_TOKEN",
  "PEXELS_API_KEY",
  "PIXABAY_API_KEY",
  "THE_ODDS_API_KEY",
  "CITO_API_KEY",
  "PODCASTINDEX_API_KEY",
  "PODCASTINDEX_API_SECRET",
  // Write authority. A test must never be able to commit to a repository or post to a channel
  // because the shell that started it happened to hold the credential for one.
  "BOARDLESSAI_GITHUB_TOKEN",
  "DELIVERY_APP_ID",
  "DELIVERY_APP_PRIVATE_KEY",
  "CAUGHT_UP_THREADS_ACCESS_TOKEN",
  "CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN",
  "MMA_FILES_THREADS_ACCESS_TOKEN",
  "MMA_FILES_INSTAGRAM_ACCESS_TOKEN",
  "TITTY_TUESDAYS_THREADS_ACCESS_TOKEN",
  "TITTY_TUESDAYS_INSTAGRAM_ACCESS_TOKEN"
] as const;

beforeEach(() => {
  for (const name of CLEARED_PROVIDER_ENV) delete process.env[name];
});
