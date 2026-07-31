import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    httpCredentials: { username: "e2e-owner", password: "e2e-password" },
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
      ADMIN_USER: "e2e-owner",
      ADMIN_PASSWORD: "e2e-password",
      BOARDLESSAI_REPO_ROOT: process.cwd().replace(/\/site$/, "")
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
