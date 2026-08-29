import { describe, expect, it } from "vitest";
import { CLEARED_PROVIDER_ENV } from "./setup/provider-env.js";

describe("the environment a test starts in", () => {
  it("holds no provider credential, whatever the shell was carrying", () => {
    // Run this suite with ANTHROPIC_API_KEY or FAL_KEY exported and it still passes. That is the
    // whole point: the release gate runs inside the cycle job, which does carry those secrets, and
    // between 9 and 11 August a test that read them took the paid illustration rung and closed the
    // gate on what the render returned while CI stayed green.
    const leaked = CLEARED_PROVIDER_ENV.filter((name) => process.env[name] !== undefined);
    expect(leaked).toEqual([]);
  });

  it("puts a variable a test set back on the floor for the next one", () => {
    // Proving the clear is per-test rather than once per file. A case that needs a configured path
    // sets the key itself; this makes sure that choice cannot leak into the test after it.
    process.env.FAL_KEY = "set-by-this-test";
    expect(process.env.FAL_KEY).toBe("set-by-this-test");
  });

  it("starts clean again", () => {
    expect(process.env.FAL_KEY).toBeUndefined();
  });
});
