import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseDeploymentArguments,
  runDeployment
} from "../../scripts/deploy/release.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const sha = "0123456789abcdef0123456789abcdef01234567";
const cleanMain = { sha, branch: "main", clean: true };
const validation = { commitSha: sha, validationResult: "passed", clean: true };
const link = { projectId: "project_quorum", orgId: "team_owner" };

function previewHarness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const receipts: Array<Record<string, unknown>> = [];
  const run = vi.fn(async (command: string, args: string[]) => {
    calls.push([command, ...args].join(" "));
    return {
      stdout: args.includes("deploy") ? "https://quorum-preview.example.test\n" : "",
      stderr: ""
    };
  });
  const options = {
    target: "preview",
    buildMode: "prebuilt-local",
    productionConfirmation: null,
    gitState: async () => ({ ...cleanMain, branch: "feature/deploy" }),
    readValidation: async () => validation,
    projectLink: async () => link,
    run,
    capture: async () => ({ stdout: sha, stderr: "" }),
    writeReceipt: async (_path: string, receipt: Record<string, unknown>) => {
      receipts.push(receipt);
    },
    now: () => new Date("2026-08-26T12:00:00.000Z"),
    ...overrides
  };
  return { options, calls, receipts, run };
}

describe("deployment argument guards", () => {
  it("requires an explicit acknowledgement for a cloud build", () => {
    expect(() => parseDeploymentArguments("preview", ["--remote-build"]))
      .toThrow("consume one Vercel cloud build");
    expect(parseDeploymentArguments("preview", ["--remote-build", "--confirm-remote-build"]))
      .toMatchObject({ buildMode: "manual-remote-build" });
  });

  it("rejects unknown targets and flags", () => {
    expect(() => parseDeploymentArguments("staging", [])).toThrow("preview or production");
    expect(() => parseDeploymentArguments("preview", ["--prod"])).toThrow("unknown deployment argument");
  });
});

describe("explicit preview deployment", () => {
  it("pulls Preview settings, builds locally and uploads exactly once", async () => {
    const harness = previewHarness();
    const receipt = await runDeployment(harness.options as never);

    expect(harness.calls).toEqual([
      "pnpm exec vercel pull --yes --environment=preview",
      "pnpm exec vercel build",
      "pnpm exec vercel deploy --prebuilt"
    ]);
    expect(receipt).toMatchObject({
      buildMode: "prebuilt-local",
      deploymentResult: "deployed",
      deploymentUrl: "https://quorum-preview.example.test",
      commitSha: sha
    });
  });

  it("rejects validation evidence from another commit", async () => {
    const harness = previewHarness({
      readValidation: async () => ({ ...validation, commitSha: "different" })
    });
    await expect(runDeployment(harness.options as never)).rejects.toThrow("different commit");
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("does not retry or fall back when a successful command has no URL", async () => {
    const harness = previewHarness({
      run: vi.fn(async (_command: string, args: string[]) => {
        harness.calls.push(args.join(" "));
        return { stdout: "deployment accepted but URL unavailable", stderr: "" };
      })
    });
    await expect(runDeployment(harness.options as never)).rejects.toThrow("do not retry automatically");
    expect(harness.calls.filter((call) => call.includes("deploy"))).toHaveLength(1);
    expect(harness.receipts.at(-1)).toMatchObject({ deploymentResult: "ambiguous" });
  });

  it("uses one disclosed remote build only when explicitly selected", async () => {
    const harness = previewHarness({ buildMode: "manual-remote-build" });
    await runDeployment(harness.options as never);
    expect(harness.calls).toEqual([
      "pnpm exec vercel pull --yes --environment=preview",
      "pnpm exec vercel deploy"
    ]);
    expect(harness.receipts.at(-1)).toMatchObject({ buildMode: "manual-remote-build" });
  });

  it("stops before build when pull changes the linked project", async () => {
    let links = 0;
    const harness = previewHarness({
      projectLink: async () => links++ === 0 ? link : { ...link, projectId: "another-project" }
    });
    await expect(runDeployment(harness.options as never)).rejects.toThrow("changed the linked project");
    expect(harness.calls).toEqual(["pnpm exec vercel pull --yes --environment=preview"]);
  });
});

describe("production deployment", () => {
  it("rejects a dirty tree before any Vercel command", async () => {
    const harness = previewHarness({
      target: "production",
      gitState: async () => ({ ...cleanMain, clean: false }),
      productionConfirmation: sha
    });
    await expect(runDeployment(harness.options as never)).rejects.toThrow("clean Git working tree");
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("requires main and an exact commit confirmation", async () => {
    const wrongBranch = previewHarness({
      target: "production",
      productionConfirmation: sha
    });
    await expect(runDeployment(wrongBranch.options as never)).rejects.toThrow("only from main");

    const unconfirmed = previewHarness({
      target: "production",
      gitState: async () => cleanMain,
      productionConfirmation: null
    });
    await expect(runDeployment(unconfirmed.options as never)).rejects.toThrow(`--confirm-production=${sha}`);
  });

  it("requires main to match origin and uses Production flags", async () => {
    const harness = previewHarness({
      target: "production",
      gitState: async () => cleanMain,
      productionConfirmation: sha
    });
    await runDeployment(harness.options as never);
    expect(harness.calls).toEqual([
      "git fetch --quiet origin main",
      "pnpm exec vercel pull --yes --environment=production",
      "pnpm exec vercel build --prod",
      "pnpm exec vercel deploy --prebuilt --prod"
    ]);
  });

  it("stops when local main is not the fetched remote tip", async () => {
    const harness = previewHarness({
      target: "production",
      gitState: async () => cleanMain,
      productionConfirmation: sha,
      capture: async () => ({ stdout: "different\n", stderr: "" })
    });
    await expect(runDeployment(harness.options as never)).rejects.toThrow("origin/main");
    expect(harness.calls).toEqual(["git fetch --quiet origin main"]);
  });
});

describe("deployment secret hygiene", () => {
  it("ignores Vercel state, pulled local environments and deployment receipts", async () => {
    const ignored = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
    expect(ignored).toContain(".deploy/");
    expect(ignored).toContain(".vercel/");
    expect(ignored).toContain("site/.vercel/");
    expect(ignored).toContain(".env.*.local");
  });
});
