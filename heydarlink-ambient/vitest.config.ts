import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // sharp renders full 1080x1920 frames in the grading and gate tests.
    testTimeout: 30_000,
    // The same floor as the orchestrator: no test can see a provider or ingest credential.
    setupFiles: ["tests/setup/clear-env.ts"],
    include: ["tests/**/*.test.ts"]
  }
});
