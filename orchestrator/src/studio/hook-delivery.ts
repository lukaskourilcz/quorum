import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { HOOKS_ROOT, LIBRARY_FILES, VECTORS_FILE, lintLibrary, type Finding } from "@boardlessai/carousel-studio";
import {
  HookLibraryPackageSchema,
  HOOK_LIBRARY_TARGET_PATHS,
  type HookLibraryPackage
} from "../contracts/hook-library.js";
import { atomicWriteJson, readJson } from "../state.js";

export const HOOK_DELIVERY_PATH = "ventures/carousel-studio/hook-delivery.json";
export const HOOK_RECEIPT_PATH = "ventures/carousel-studio/hook-delivery-receipt.json";

/** A refusal to cut a delivery, with the reason a reviewer needs. */
export class HookDeliveryError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "HookDeliveryError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Cut a `hook-library/1` package from the current library and vectors.
 *
 * The lint runs here rather than being trusted from CI, because this is the last point where
 * refusing costs nothing. `docs/hooks/06-hook-brain.md` makes re-delivery conditional on the lint
 * passing, and a delivery that shipped a library the lint would have rejected is a copy the apps
 * would then serve to readers — the one direction this must never fail in.
 *
 * Warnings do not block. The three `unreachable-variant` warnings are a standing, deliberate state
 * and blocking on them would mean the library could never ship at all; they travel in the package
 * so the acceptance is on the record.
 */
export async function buildHookLibraryPackage(input: {
  generatedAt: string;
  hooksRoot?: string;
}): Promise<HookLibraryPackage> {
  const root = input.hooksRoot ?? HOOKS_ROOT;

  const librarySource = await readFile(path.join(root, LIBRARY_FILES.quiz.hooks), "utf8");
  const researchSource = await readFile(path.join(root, LIBRARY_FILES.quiz.research), "utf8");
  const vectorsSource = await readFile(path.join(root, VECTORS_FILE), "utf8");

  const findings: Finding[] = lintLibrary({
    surface: "quiz",
    hooks: JSON.parse(librarySource),
    research: JSON.parse(researchSource)
  });
  const errors = findings.filter((finding) => finding.level === "error");
  if (errors.length > 0) {
    throw new HookDeliveryError(
      `lint:hooks fails on the quiz library, so nothing may be delivered:\n`
      + errors.map((finding) => `- [${finding.rule}] ${finding.hookId ?? finding.surface}: ${finding.detail}`).join("\n")
    );
  }

  const libraryHash = sha256(librarySource);
  const vectorsHash = sha256(vectorsSource);
  const warnings = findings.filter((finding) => finding.level === "warning");

  return HookLibraryPackageSchema.parse({
    schemaVersion: "hook-library/1",
    surface: "quiz",
    targetRepository: "lukaskourilcz/react-express-app",
    generatedAt: input.generatedAt,
    hookCount: (JSON.parse(librarySource) as unknown[]).length,
    libraryHash,
    vectorsHash,
    idempotencyKey: sha256(`${libraryHash}:${vectorsHash}`),
    lint: {
      errors: 0,
      warnings: warnings.length,
      warningRules: [...new Set(warnings.map((finding) => finding.rule))].sort()
    },
    files: [
      { path: HOOK_LIBRARY_TARGET_PATHS[0], contents: librarySource, sha256: libraryHash },
      { path: HOOK_LIBRARY_TARGET_PATHS[1], contents: vectorsSource, sha256: vectorsHash }
    ]
  });
}

export interface HookDeliveryReceipt {
  schemaVersion: 1;
  idempotencyKey: string;
  libraryHash: string;
  vectorsHash: string;
  hookCount: number;
  deliveredAt: string;
  targetRepository: string;
  targetCommit: string | null;
}

/**
 * The package to deliver, or null when the app already has this library.
 *
 * Idempotency is the whole reason the key exists: the daily cycle would otherwise push an
 * identical library every morning, and a receipt trail of no-op commits makes a real re-delivery
 * impossible to spot.
 */
export async function pendingHookDelivery(input: {
  stateRoot: string;
  generatedAt: string;
  hooksRoot?: string;
}): Promise<HookLibraryPackage | null> {
  const packaged = await buildHookLibraryPackage(input);
  const receipt = await readJson<HookDeliveryReceipt | null>(input.stateRoot, HOOK_RECEIPT_PATH, null);
  if (receipt?.idempotencyKey === packaged.idempotencyKey) return null;
  return packaged;
}

/** Stage the package where the delivery job reads it. */
export async function stageHookDelivery(stateRoot: string, packaged: HookLibraryPackage): Promise<string> {
  await atomicWriteJson(stateRoot, HOOK_DELIVERY_PATH, packaged);
  return HOOK_DELIVERY_PATH;
}

export async function recordHookDelivery(input: {
  stateRoot: string;
  packaged: HookLibraryPackage;
  deliveredAt: string;
  targetCommit: string | null;
}): Promise<string> {
  const receipt: HookDeliveryReceipt = {
    schemaVersion: 1,
    idempotencyKey: input.packaged.idempotencyKey,
    libraryHash: input.packaged.libraryHash,
    vectorsHash: input.packaged.vectorsHash,
    hookCount: input.packaged.hookCount,
    deliveredAt: input.deliveredAt,
    targetRepository: input.packaged.targetRepository,
    targetCommit: input.targetCommit
  };
  await atomicWriteJson(input.stateRoot, HOOK_RECEIPT_PATH, receipt);
  return HOOK_RECEIPT_PATH;
}

export async function readHookDeliveryReceipt(stateRoot: string): Promise<HookDeliveryReceipt | null> {
  return readJson<HookDeliveryReceipt | null>(stateRoot, HOOK_RECEIPT_PATH, null);
}
