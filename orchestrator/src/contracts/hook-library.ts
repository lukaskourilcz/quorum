import { createHash } from "node:crypto";
import { z } from "zod";
import { openObject } from "./common.js";

/**
 * Where a delivered file may land in the consuming repository.
 *
 * An allowlist expressed as a schema, not only as a shell pattern in the workflow. The workflow's
 * `git status` check is the last line; this is the first, and it fails in a place a test can reach.
 */
export const HOOK_LIBRARY_TARGET_PATHS = [
  "lib/hooks/quiz.hooks.json",
  "lib/hooks/hooks.predicates.spec.json"
] as const;

export const HookLibraryFileSchema = openObject({
  path: z.enum(HOOK_LIBRARY_TARGET_PATHS),
  /** The bytes as the studio wrote them, so the consumer never re-serialises and re-hashes. */
  contents: z.string().min(2).max(2_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
});

/**
 * The lint verdict this delivery was cut behind.
 *
 * Re-delivery happens only after `lint:hooks` passes, so the verdict travels with the package
 * rather than being asserted by the job that ships it. `errors` is a literal zero: a package that
 * could record a failing lint is a package that could ship one.
 */
export const HookLibraryLintSchema = openObject({
  errors: z.literal(0),
  warnings: z.number().int().min(0).max(200),
  /** The rules that warned, so a reviewer sees what was accepted rather than only that it passed. */
  warningRules: z.array(z.string().min(1)).max(200)
});

export const HookLibraryPackageSchema = openObject({
  schemaVersion: z.literal("hook-library/1"),
  surface: z.literal("quiz"),
  targetRepository: z.literal("lukaskourilcz/react-express-app"),
  generatedAt: z.iso.datetime({ offset: true }),
  hookCount: z.number().int().min(1).max(500),
  /** sha256 of the library file's bytes. The app records it and refuses a re-delivery of the same. */
  libraryHash: z.string().regex(/^[a-f0-9]{64}$/),
  vectorsHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** Both hashes together: what makes a re-run of an unchanged library a no-op rather than a push. */
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
  lint: HookLibraryLintSchema,
  files: z.array(HookLibraryFileSchema).length(2)
}).superRefine((packaged, context) => {
  // Every file hashes to what it says it does. Without this the envelope's hashes are a label
  // rather than a checksum: contents edited after the package was cut would travel with the
  // original hash, and the consumer would record a receipt for bytes it never received.
  for (const [index, file] of packaged.files.entries()) {
    const actual = createHash("sha256").update(file.contents, "utf8").digest("hex");
    if (actual !== file.sha256) {
      context.addIssue({
        code: "custom",
        message: `${file.path} does not hash to its recorded sha256`,
        path: ["files", index, "sha256"]
      });
    }
  }

  const paths = packaged.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", message: "A delivery carries each target path once", path: ["files"] });
  }
  for (const target of HOOK_LIBRARY_TARGET_PATHS) {
    if (!paths.includes(target)) {
      context.addIssue({ code: "custom", message: `Missing ${target}`, path: ["files"] });
    }
  }
  // The vectors ship with every library delivery or neither ships. They are what pins the app's
  // selector to this repo's evaluator, and a library delivered without them is a library the app
  // can implement differently without anything noticing.
  const library = packaged.files.find((file) => file.path === "lib/hooks/quiz.hooks.json");
  const vectors = packaged.files.find((file) => file.path === "lib/hooks/hooks.predicates.spec.json");
  if (library && library.sha256 !== packaged.libraryHash) {
    context.addIssue({ code: "custom", message: "libraryHash does not match the delivered library file", path: ["libraryHash"] });
  }
  if (vectors && vectors.sha256 !== packaged.vectorsHash) {
    context.addIssue({ code: "custom", message: "vectorsHash does not match the delivered vectors file", path: ["vectorsHash"] });
  }
});

export type HookLibraryPackage = z.infer<typeof HookLibraryPackageSchema>;
export type HookLibraryFile = z.infer<typeof HookLibraryFileSchema>;
