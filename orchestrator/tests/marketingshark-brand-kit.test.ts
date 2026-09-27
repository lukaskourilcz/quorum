import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// A brand kit that is missing or fails its hashes stops devShark's day before anything is paid
// for (owner request of 2026-09-27: posts are always built on the kit, never on a fallback look).
vi.mock("@boardlessai/carousel-studio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@boardlessai/carousel-studio")>()),
  brandKitProblem: () => "Brand kit marketingshark is unusable: devshark-fin-clean-white.svg does not match its recorded sha256"
}));

const { enabledBrands, loadMarketingSharkConfig } = await import("../src/ventures/marketingshark/config.js");
const { EMPTY_LEDGER } = await import("../src/ventures/marketingshark/ledger.js");
const { runBrandDay } = await import("../src/ventures/marketingshark/run.js");

describe("marketingShark without a usable brand kit", () => {
  it("aborts the quiz day at $0 with the kit's reason and never calls the writer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-kit-"));
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const call = vi.fn();
    const result = await runBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-09-28", cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true, call });
    expect(result.outcome).toMatchObject({ status: "aborted", reason: "render-failed", spendUsd: 0 });
    expect(result.outcome).toHaveProperty("detail", expect.stringContaining("does not match its recorded sha256"));
    expect(call).not.toHaveBeenCalled();
    expect(result.artifacts).toEqual([]);
  });
});
