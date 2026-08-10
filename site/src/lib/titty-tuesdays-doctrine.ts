import "server-only";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The second kind of no.
 *
 * `bad` is a taste rating: the image stays on file, because a rejected design is exactly what the
 * taste loop learns from. A doctrine rejection means the image should not exist — a body in the
 * frame, a wordmark that reads as something else — so its bytes are deleted and everything that
 * proves it happened is kept: the hash, the prompt, the reason and the time.
 *
 * Policy violations do not stay on disk. The evidence that they happened does.
 */
export class DoctrineRejectError extends Error {
  constructor(readonly code: "NOT_FOUND" | "UNAVAILABLE" | "CORRUPT", message: string) {
    super(message);
  }
}

/** Resolved per call, not at import, for the same reason the reader's is. */
function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const VARIANT = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/u;

function insideState(relative: string): string {
  const stateRoot = path.resolve(repositoryRoot(), "state");
  const target = path.resolve(stateRoot, relative);
  const boundary = path.relative(stateRoot, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new DoctrineRejectError("NOT_FOUND", "That path is not inside the state directory.");
  }
  return target;
}

export interface DoctrineRejectResult {
  /** The record as it now stands, for the caller to hand straight back to the panel. */
  variantId: string;
  bytesRemoved: boolean;
}

export async function rejectOnDoctrine(input: {
  date: string;
  variantId: string;
  reason: string;
  now: Date;
}): Promise<DoctrineRejectResult> {
  if (!DATE.test(input.date) || !VARIANT.test(input.variantId)) {
    throw new DoctrineRejectError("NOT_FOUND", "That is not a proposal this admin knows.");
  }
  const reason = input.reason.trim().slice(0, 400);
  if (reason.length === 0) {
    throw new DoctrineRejectError("CORRUPT", "A doctrine rejection needs a reason.");
  }

  const relative = `ventures/titty-tuesdays/design-proposals/${input.date}.json`;
  const target = insideState(relative);

  let file: { variants?: Array<Record<string, unknown>> };
  try {
    file = JSON.parse(await readFile(target, "utf8")) as typeof file;
  } catch (error) {
    throw new DoctrineRejectError(
      (error as NodeJS.ErrnoException).code === "ENOENT" ? "NOT_FOUND" : "CORRUPT",
      "That day's proposals could not be read."
    );
  }

  const variant = file.variants?.find((entry) => entry.variantId === input.variantId);
  if (!variant) throw new DoctrineRejectError("NOT_FOUND", "That render is not in this day's record.");

  // Bytes first, then the record. If the delete fails the record still says "proposed", which is
  // true; doing it the other way round would leave a record claiming bytes were gone while they
  // sat on disk.
  const imagePath = typeof variant.imagePath === "string" ? variant.imagePath : null;
  let bytesRemoved = false;
  if (imagePath) {
    await rm(insideState(imagePath), { force: true });
    bytesRemoved = true;
  }

  variant.status = "doctrine-rejected";
  variant.imagePath = null;
  variant.rejectedAt = input.now.toISOString();
  variant.reason = reason;

  if (process.env.NODE_ENV === "production" && !process.env.BOARDLESSAI_GITHUB_TOKEN) {
    throw new DoctrineRejectError("UNAVAILABLE", "Proposal storage is not configured for this deployment.");
  }
  await writeFile(target, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  return { variantId: input.variantId, bytesRemoved };
}
