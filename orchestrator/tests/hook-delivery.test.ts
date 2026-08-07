import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkVectors, HOOKS_ROOT } from "@boardlessai/carousel-studio";
import { describe, expect, it } from "vitest";
import { HookLibraryPackageSchema, HOOK_LIBRARY_TARGET_PATHS } from "../src/contracts/hook-library.js";
import {
  buildHookLibraryPackage,
  HookDeliveryError,
  pendingHookDelivery,
  readHookDeliveryReceipt,
  recordHookDelivery
} from "../src/studio/hook-delivery.js";
import { repoRoot } from "../src/paths.js";

const AT = "2026-08-08T07:00:00.000Z";

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "hook-delivery-"));
}

/** A hooks directory the test owns, so a lint failure can be staged without touching the shipped one. */
async function hooksRootWith(overrides: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "hooks-root-"));
  for (const file of ["quiz.hooks.json", "quiz.research.json", "hooks.predicates.spec.json"]) {
    await writeFile(path.join(root, file), overrides[file] ?? await readFile(path.join(HOOKS_ROOT, file), "utf8"), "utf8");
  }
  return root;
}

describe("hook-library/1 delivery", () => {
  it("packages the library and the vectors together, with the lint verdict it was cut behind", async () => {
    const packaged = await buildHookLibraryPackage({ generatedAt: AT });

    expect(packaged.schemaVersion).toBe("hook-library/1");
    expect(packaged.targetRepository).toBe("lukaskourilcz/react-express-app");
    expect(packaged.hookCount).toBe(49);
    expect(packaged.files.map((file) => file.path).sort()).toEqual([...HOOK_LIBRARY_TARGET_PATHS].sort());
    expect(packaged.lint.errors).toBe(0);
    // The three standing unreachable-variant warnings travel with the package, so the acceptance
    // is on the record rather than implied by the absence of a failure.
    expect(packaged.lint.warningRules).toEqual(["unreachable-variant"]);
    expect(packaged.lint.warnings).toBe(3);
  });

  it("delivers the library bytes as written, not a re-serialisation", async () => {
    const packaged = await buildHookLibraryPackage({ generatedAt: AT });
    const onDisk = await readFile(path.join(HOOKS_ROOT, "quiz.hooks.json"), "utf8");
    const delivered = packaged.files.find((file) => file.path === "lib/hooks/quiz.hooks.json")!;
    expect(delivered.contents).toBe(onDisk);
  });

  it("ships vectors the app can assert its own selector against", async () => {
    const packaged = await buildHookLibraryPackage({ generatedAt: AT });
    const vectors = JSON.parse(packaged.files.find((file) => file.path.endsWith("hooks.predicates.spec.json"))!.contents);
    // Two implementations, one spec: whatever the app does, these are the answers it must reach.
    expect(checkVectors(vectors)).toEqual([]);
    expect(vectors.vectors.length).toBeGreaterThan(10);
  });

  it("refuses to deliver a library the lint rejects", async () => {
    const library = JSON.parse(await readFile(path.join(HOOKS_ROOT, "quiz.hooks.json"), "utf8")) as Array<{ variants: { dev: { en: string } } }>;
    library[0]!.variants.dev.en = "x".repeat(80);
    const root = await hooksRootWith({ "quiz.hooks.json": JSON.stringify(library) });

    await expect(buildHookLibraryPackage({ generatedAt: AT, hooksRoot: root }))
      .rejects.toThrowError(HookDeliveryError);
    await expect(buildHookLibraryPackage({ generatedAt: AT, hooksRoot: root }))
      .rejects.toThrowError(/char-budget-en/u);
  });

  it("is a no-op once the app already has this library", async () => {
    const root = await stateRoot();
    const first = await pendingHookDelivery({ stateRoot: root, generatedAt: AT });
    expect(first).not.toBeNull();

    await recordHookDelivery({ stateRoot: root, packaged: first!, deliveredAt: AT, targetCommit: "abc1234" });
    // The daily cycle would otherwise push an identical library every morning, and a trail of
    // no-op commits makes a real re-delivery impossible to spot.
    expect(await pendingHookDelivery({ stateRoot: root, generatedAt: AT })).toBeNull();

    const receipt = await readHookDeliveryReceipt(root);
    expect(receipt).toMatchObject({ hookCount: 49, targetCommit: "abc1234", targetRepository: "lukaskourilcz/react-express-app" });
  });

  it("delivers again once the library changes", async () => {
    const root = await stateRoot();
    const first = (await pendingHookDelivery({ stateRoot: root, generatedAt: AT }))!;
    await recordHookDelivery({ stateRoot: root, packaged: first, deliveredAt: AT, targetCommit: "abc1234" });

    // A correction to one line — the only edit the append rules allow — changes the hash and
    // therefore the delivery.
    const library = JSON.parse(await readFile(path.join(HOOKS_ROOT, "quiz.hooks.json"), "utf8")) as Array<{ variants: { dev: { en: string } } }>;
    library[0]!.variants.dev.en = "Miss it and the explanation still pays.";
    const hooksRoot = await hooksRootWith({ "quiz.hooks.json": JSON.stringify(library, null, 2) });

    const next = await pendingHookDelivery({ stateRoot: root, generatedAt: AT, hooksRoot });
    expect(next).not.toBeNull();
    expect(next!.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("rejects a package whose contents were edited after it was hashed", () => {
    // The envelope's hashes have to be checksums, not labels: otherwise a package edited in
    // transit records a receipt for bytes the app never received.
    const good = {
      schemaVersion: "hook-library/1",
      surface: "quiz",
      targetRepository: "lukaskourilcz/react-express-app",
      generatedAt: AT,
      hookCount: 1,
      lint: { errors: 0, warnings: 0, warningRules: [] }
    };
    const parsed = HookLibraryPackageSchema.safeParse({
      ...good,
      libraryHash: "0".repeat(64),
      vectorsHash: "0".repeat(64),
      idempotencyKey: "0".repeat(64),
      files: [
        { path: "lib/hooks/quiz.hooks.json", contents: "[]", sha256: "0".repeat(64) },
        { path: "lib/hooks/hooks.predicates.spec.json", contents: "{}", sha256: "0".repeat(64) }
      ]
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("does not hash to its recorded sha256");
  });
});

describe("the delivery's target paths", () => {
  it("are the only paths the workflow allowlist permits", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github", "workflows", "cycle.yml"), "utf8");
    // The schema is the first line and the workflow's git-status check is the last. They have to
    // name the same two files, or one of them is not actually bounding anything.
    expect(workflow).toContain("react-express-app");
    expect(workflow).toContain("lib/hooks/(quiz\\.hooks|hooks\\.predicates\\.spec)\\.json");
    for (const target of HOOK_LIBRARY_TARGET_PATHS) {
      expect(target.startsWith("lib/hooks/")).toBe(true);
    }
  });

  it("never reaches the quiz app's own source", () => {
    // Contents-only, and only under lib/hooks/. The app owns its selector; this repo owns copy.
    for (const target of HOOK_LIBRARY_TARGET_PATHS) {
      expect(target).toMatch(/^lib\/hooks\/[a-z0-9.-]+\.json$/u);
    }
  });
});

/** Keep the fixture directory helper honest: it must produce a loadable tree. */
describe("the test's own hooks root", () => {
  it("mirrors the shipped one when nothing is overridden", async () => {
    const root = await hooksRootWith({});
    await mkdir(root, { recursive: true });
    const packaged = await buildHookLibraryPackage({ generatedAt: AT, hooksRoot: root });
    const shipped = await buildHookLibraryPackage({ generatedAt: AT });
    expect(packaged.idempotencyKey).toBe(shipped.idempotencyKey);
  });
});
