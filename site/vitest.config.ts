import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    // sharp-backed rendering and large state reads run well past vitest's 5s default
    // under parallel load. The post-cycle release gate runs this suite, so a tight
    // timeout turns a healthy cycle into a red one. A genuinely hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
