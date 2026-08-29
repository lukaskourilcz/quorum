import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json-summary"]
    },
    // sharp-backed rendering and large state reads run well past vitest's 5s default
    // under parallel load. The post-cycle release gate runs this suite, so a tight
    // timeout turns a healthy cycle into a red one. A genuinely hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "node",
    // Every run starts without a provider credential. See the file for the outage this ends.
    setupFiles: ["tests/setup/provider-env.ts"],
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"]
  }
});
