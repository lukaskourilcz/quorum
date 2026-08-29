import { defineConfig, devices } from "@playwright/test";
import {
  adminE2EServerEnv,
  adminE2EStorageState
} from "./tests/e2e/admin-e2e-auth";

const e2ePort = process.env.E2E_PORT ?? "3187";
const e2eBaseUrl = `http://localhost:${e2ePort}`;
const desktopChrome = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1440, height: 900 }
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  /*
   * 30s was Playwright's default and it stopped matching the work.
   *
   * Most of this suite loads a page to `networkidle` against a dev server and then runs a
   * whole-DOM axe sweep over it. Measured across four full runs of this programme, the heavier
   * admin surfaces take 18-30s each and the home page has grown with the Facilities section — so
   * routes were tipping over the default one at a time, whichever happened to be unlucky, and
   * failing with "Test timeout exceeded" rather than with anything about the app. Every failure
   * chased in this programme's e2e runs was one of those.
   *
   * 120s is sized to that measurement with room for a loaded machine, and it still fails loudly
   * on a route that genuinely will not load — which is what a timeout is for.
   */
  timeout: 120_000,
  /*
   * Where `toHaveScreenshot` looks for its baselines.
   *
   * Without this it looks in `tests/e2e/admin-visual-qa.spec.ts-snapshots/`, and the three
   * committed baselines live in `tests/e2e/snapshots/`. So the visual guard has never compared
   * against them: it reported "a snapshot doesn't exist, writing actual", failed, wrote an
   * untracked file, and did the same again on the next fresh checkout. Three shell screenshots
   * that could not catch a regression if one happened.
   *
   * The names carry no project or platform suffix because the committed files carry none. One
   * baseline per view is the intent; a rendering difference between platforms shows up as a diff
   * to look at rather than as a missing file to ignore.
   */
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseUrl,
    storageState: adminE2EStorageState(),
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@write-journey/,
      use: desktopChrome
    },
    {
      name: "chromium-write-journeys",
      grep: /@write-journey/,
      testMatch: /operating-surfaces\.spec\.ts/,
      use: desktopChrome
    }
  ],
  webServer: {
    // State-writing journeys touch files outside `site/`. Webpack reads those dynamic files
    // without Turbopack's broad repository trace restarting the dev server on each expected write.
    // The dedicated port also keeps concurrent programme worktrees from sharing a test server.
    // The read-only project visits every public/admin surface in one server lifetime. Next
    // otherwise caps its child at half of an 8 GB machine and can restart before that audit ends,
    // invalidating in-flight hydration. The explicit, bounded heap lets that project finish; the
    // package runner then starts a fresh server for the state-writing project.
    command: `pnpm dev:e2e --webpack --port ${e2ePort}`,
    env: adminE2EServerEnv(process.cwd().replace(/\/site$/, "")),
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
