import { describe, expect, it } from "vitest";
import { resolveSourcePath } from "../src/ventures/marketingshark/source-path.js";

describe("an import script's --source", () => {
  it("is read from the directory the command was typed in, not the orchestrator package", () => {
    // `pnpm --filter @boardlessai/orchestrator exec` runs the script in <repo>/orchestrator.
    expect(resolveSourcePath("../react-express-app", { INIT_CWD: "/work/quorum" }, "/work/quorum/orchestrator")).toBe("/work/react-express-app");
  });

  it("falls back to the process directory without pnpm, and keeps an absolute path as given", () => {
    expect(resolveSourcePath("../react-express-app", {}, "/work/quorum")).toBe("/work/react-express-app");
    expect(resolveSourcePath("/srv/react-express-app", { INIT_CWD: "/work/quorum" }, "/work/quorum/orchestrator")).toBe("/srv/react-express-app");
  });
});
