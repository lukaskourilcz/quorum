import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  adminE2EServerEnv,
  adminE2EStorageState
} from "./tests/e2e/admin-e2e-auth";

const port = process.env.ADMIN_QA_PORT ?? "3190";
const baseURL = `http://localhost:${port}`;

/**
 * Read-only Admin proof against the same optimized server artifact used by production.
 *
 * The package pre-script builds that artifact first. Blank GitHub authority and a dedicated
 * authenticated session keep this project protected without giving it a canonical write path.
 * The repository root is this versioned worktree, never an owner-supplied private source.
 */
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide"
    }
  },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  outputDir: "test-results/admin-qa",
  projects: [
    {
      name: "admin-qa-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 1440 }
      }
    }
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./tests/e2e",
  testMatch: /admin-visual-qa\.spec\.ts/,
  timeout: 120_000,
  use: {
    baseURL,
    storageState: adminE2EStorageState(),
    trace: "retain-on-failure"
  },
  webServer: {
    command: `pnpm start --port ${port}`,
    env: adminE2EServerEnv(path.resolve(process.cwd(), "..")),
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL
  },
  workers: 1
});
