import { defineConfig, devices } from "@playwright/test";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken
} from "./src/lib/admin-session";

const adminUser = "e2e-owner";
const adminPassword = "e2e-password";
const sessionStartedAt = Date.now();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    }
  ],
  webServer: {
    command: "pnpm dev",
    env: {
      ADMIN_USER: adminUser,
      ADMIN_PASSWORD: adminPassword,
      BOARDLESSAI_REPO_ROOT: process.cwd().replace(/\/site$/, "")
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
