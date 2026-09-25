import type { QueueDispatchView } from "./types";

/**
 * What a Queue card says after an action, read from the actions route's answer.
 *
 * A saved approval whose publisher wake-up failed, or could not start yet because the window has
 * not opened, is a warning rather than a success: the post is queued, but nothing will send it
 * until someone starts a run. The words carry that on their own; the tone only repeats it.
 */
export interface QueueActionNotice {
  tone: "success" | "warning" | "destructive";
  text: string;
  /** GitHub's page for the publisher run the approval started, when GitHub named one. */
  runUrl: string | null;
}

const RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d{1,20}$/u;
const NOT_SAVED = "The queue action was not saved.";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function dispatchOf(value: unknown): Partial<QueueDispatchView> | null {
  return value && typeof value === "object" ? value as Partial<QueueDispatchView> : null;
}

export function queueActionNotice(ok: boolean, body: unknown): QueueActionNotice {
  const fields = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (!ok) return { tone: "destructive", text: text(fields.error, NOT_SAVED), runUrl: null };
  const dispatch = dispatchOf(fields.dispatch);
  const waiting = dispatch?.state === "failed" || dispatch?.reason === "window-not-open";
  const runUrl = typeof dispatch?.runUrl === "string" && RUN_URL.test(dispatch.runUrl) ? dispatch.runUrl : null;
  return { tone: waiting ? "warning" : "success", text: text(fields.message, "Saved."), runUrl };
}

export function queueActionFailure(): QueueActionNotice {
  return { tone: "destructive", text: NOT_SAVED, runUrl: null };
}
