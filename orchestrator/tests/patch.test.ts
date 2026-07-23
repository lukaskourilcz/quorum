import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PatchValidationError,
  validatePatchOperations
} from "../src/patch.js";

describe("generated patch validator", () => {
  it("accepts a bounded page operation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-patch-"));
    const result = await validatePatchOperations({
      repoRoot: root,
      taskType: "page",
      operations: [
        {
          action: "write",
          path: "site/src/app/useful/page.tsx",
          content: "export default function Page(){ return <main>Useful</main> }"
        }
      ]
    });
    expect(result[0]?.path).toBe("site/src/app/useful/page.tsx");
  });

  it.each([
    "../package.json",
    "%2e%2e%2fpackage.json",
    "/tmp/escape.ts",
    "site/src/brand/tokens.css",
    "config/models.json",
    ".github/workflows/cycle.yml"
  ])("rejects forbidden path %s", async (target) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-patch-"));
    await expect(
      validatePatchOperations({
        repoRoot: root,
        taskType: "page",
        operations: [{ action: "write", path: target, content: "safe" }]
      })
    ).rejects.toBeInstanceOf(PatchValidationError);
  });

  it("blocks secrets, environment access, network and dynamic code", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-patch-"));
    for (const content of [
      "const token = 'sk-proj-1234567890123456789012345'",
      "const secret = process.env.OPENAI_API_KEY",
      "fetch('https://not-allowlisted.invalid')",
      "eval('2 + 2')"
    ]) {
      await expect(
        validatePatchOperations({
          repoRoot: root,
          taskType: "page",
          operations: [
            { action: "write", path: "site/src/app/check/page.tsx", content }
          ]
        })
      ).rejects.toBeInstanceOf(PatchValidationError);
    }
  });

  it("rejects a symlink component", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-patch-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "boardless-outside-"));
    await mkdir(path.join(root, "site", "src", "app"), { recursive: true });
    await symlink(outside, path.join(root, "site", "src", "app", "escape"));
    await expect(
      validatePatchOperations({
        repoRoot: root,
        taskType: "page",
        operations: [
          {
            action: "write",
            path: "site/src/app/escape/page.tsx",
            content: "export default 1"
          }
        ]
      })
    ).rejects.toBeInstanceOf(PatchValidationError);
  });
});

