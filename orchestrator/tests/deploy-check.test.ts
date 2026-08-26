import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runReleaseCheck } from "../../scripts/deploy/check.mjs";
import { releaseSteps, runWithSiteServer } from "../../scripts/deploy/shared.mjs";

const cleanState = {
  sha: "0123456789abcdef0123456789abcdef01234567",
  branch: "main",
  clean: true
};

describe("the local release gate", () => {
  it("stops at the first failed command and records an honest failure", async () => {
    const calls: string[] = [];
    const receipts: unknown[] = [];
    const runSiteSmoke = vi.fn();

    await expect(runReleaseCheck({
      gitState: async () => cleanState,
      run: async (command: string, args: string[]) => {
        calls.push([command, ...args].join(" "));
        if (calls.length === 3) throw new Error("lint failed");
        return { stdout: "", stderr: "" };
      },
      runSiteSmoke,
      writeReceipt: async (_path: string, receipt: unknown) => {
        receipts.push(receipt);
      },
      now: () => new Date("2026-08-26T12:00:00.000Z")
    })).rejects.toThrow("lint failed");

    expect(calls).toHaveLength(3);
    expect(runSiteSmoke).not.toHaveBeenCalled();
    expect(receipts).toMatchObject([{ validationResult: "failed", commitSha: cleanState.sha }]);
  });

  it("binds reusable validation to the same clean commit", async () => {
    let stateRead = 0;
    const receipts: unknown[] = [];
    await expect(runReleaseCheck({
      gitState: async () => ({
        ...cleanState,
        sha: stateRead++ === 0 ? cleanState.sha : "fedcba9876543210fedcba9876543210fedcba98"
      }),
      run: async () => ({ stdout: "", stderr: "" }),
      runSiteSmoke: async () => undefined,
      writeReceipt: async (_path: string, receipt: unknown) => {
        receipts.push(receipt);
      }
    })).rejects.toThrow("validation is not reusable");

    expect(receipts).toMatchObject([{ validationResult: "failed" }]);
  });

  it("runs every required command and the controlled smoke once", async () => {
    const calls: string[] = [];
    const runSiteSmoke = vi.fn(async () => undefined);
    const receipt = await runReleaseCheck({
      gitState: async () => cleanState,
      run: async (command: string, args: string[]) => {
        calls.push([command, ...args].join(" "));
        return { stdout: "", stderr: "" };
      },
      runSiteSmoke,
      writeReceipt: async () => undefined,
      now: () => new Date("2026-08-26T12:00:00.000Z")
    });

    expect(calls).toHaveLength(releaseSteps.length);
    expect(runSiteSmoke).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({
      validationResult: "passed",
      commitSha: cleanState.sha,
      clean: true
    });
  });
});

describe("the release gate site process", () => {
  it("always terminates the server after a successful smoke", async () => {
    const stop = vi.fn(async () => undefined);
    await runWithSiteServer({
      start: () => ({}) as never,
      ready: async () => undefined,
      smoke: async () => undefined,
      stop
    });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("always terminates the server after a failed smoke", async () => {
    const stop = vi.fn(async () => undefined);
    await expect(runWithSiteServer({
      start: () => ({}) as never,
      ready: async () => undefined,
      smoke: async () => {
        throw new Error("smoke failed");
      },
      stop
    })).rejects.toThrow("smoke failed");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("terminates the server when interrupted", async () => {
    const signals = new EventEmitter();
    const stop = vi.fn(async () => undefined);
    const run = runWithSiteServer({
      start: () => ({}) as never,
      ready: () => new Promise(() => undefined),
      smoke: async () => undefined,
      stop,
      signals: signals as never
    });
    signals.emit("SIGTERM");
    await expect(run).rejects.toThrow("interrupted by SIGTERM");
    expect(stop).toHaveBeenCalledOnce();
  });
});
