import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets jsx: "preserve", which is what Next wants and what vite's transform
  // inherits: importing any .tsx from a test failed import analysis with JSX still in the
  // output. Compiling it here affects .tsx and .jsx only, and no other site test imports one.
  oxc: { jsx: { runtime: "automatic" } },
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
