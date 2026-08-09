import { defineConfig, devices } from "@playwright/test";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken
} from "./src/lib/admin-session";

const adminUser = "e2e-owner";
const adminPassword = "e2e-password";
const sessionStartedAt = Date.now();
const e2ePort = process.env.E2E_PORT ?? "3107";
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
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseUrl,
    storageState: {
      cookies: [
        {
          domain: "localhost",
          expires:
            Math.floor(sessionStartedAt / 1_000) +
            ADMIN_SESSION_MAX_AGE_SECONDS,
          httpOnly: true,
          name: ADMIN_SESSION_COOKIE,
          path: "/",
          sameSite: "Strict",
          secure: false,
          value: createAdminSessionToken(
            adminUser,
            adminPassword,
            sessionStartedAt
          )
        }
      ],
      origins: []
    },
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
    command: `pnpm dev --port ${e2ePort}`,
    env: {
      ADMIN_USER: adminUser,
      ADMIN_PASSWORD: adminPassword,
      BOARDLESSAI_REPO_ROOT: process.cwd().replace(/\/site$/, "")
    },
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
