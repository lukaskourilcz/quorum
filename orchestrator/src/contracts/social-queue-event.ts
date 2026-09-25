import { z } from "zod";
import { DateTimeSchema, Sha256Schema, VentureIdSchema } from "./common.js";

/**
 * One owner decision on one social queue item, recorded by the Admin Queue workspace (quorum#573).
 *
 * The event is the evidence the item cannot carry itself. Queue v2 has no field for a reason, a
 * supersession or who approved, so each of those lives here, and the item points back at it:
 * an approval writes this event's id into `approvalProvenance.approvalRef`. Every event binds the
 * content hash the owner was shown (`expectedContentHash`), so a decision can never be replayed
 * onto copy the owner did not see.
 *
 * Nothing here sends. `approve` moves an item to `queued`; the publisher still applies the kill
 * switch, the channel mode, the held connection, the provider verdict and the cadence before it
 * touches a platform.
 */
export const SOCIAL_QUEUE_EVENT_ACTIONS = ["approve", "edit", "hold", "reject", "rerender"] as const;
export const SOCIAL_QUEUE_OWNER_EVIDENCE = ["brand", "claims", "quill", "keeper", "policy"] as const;

const QueueStatusSchema = z.enum([
  "draft",
  "approved",
  "queued",
  "publishing",
  "published",
  "failed",
  "expired",
  "needs_reconciliation",
  "cancelled"
]);

export const SocialQueueItemIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160);

/** The six checks the Queue computes itself before it accepts an approval. */
const DeterministicChecksSchema = z.strictObject({
  schema: z.literal("pass"),
  duplicate: z.literal("pass"),
  accessibility: z.literal("pass"),
  budget: z.literal("pass"),
  capability: z.literal("pass"),
  authority: z.literal("pass")
});

const BoundedTextSchema = z.string().trim().min(1).max(500);

export const SocialQueueEventSchema = z.strictObject({
  schemaVersion: z.literal("social-queue-event/1"),
  id: z.string().regex(/^social-queue-event-[a-f0-9]{24}$/u),
  at: DateTimeSchema,
  actor: z.literal("owner"),
  action: z.enum(SOCIAL_QUEUE_EVENT_ACTIONS),
  itemId: SocialQueueItemIdSchema,
  sourceVentureId: VentureIdSchema,
  channel: z.enum(["instagram", "threads", "linkedin"]),
  expectedContentHash: Sha256Schema,
  previousStatus: QueueStatusSchema,
  nextStatus: QueueStatusSchema,
  /** The approved item's hash, or the superseding item's; null when the item is only cancelled. */
  resultingContentHash: Sha256Schema.nullable(),
  mode: z.enum(["now", "window"]).nullable(),
  publishWindow: z.strictObject({ notBefore: DateTimeSchema, notAfter: DateTimeSchema }).nullable(),
  deterministicChecks: DeterministicChecksSchema.nullable(),
  /** The checks a model cannot pass for itself, which the owner's approval stands in for. */
  ownerEvidenceFor: z.array(z.enum(SOCIAL_QUEUE_OWNER_EVIDENCE)).max(SOCIAL_QUEUE_OWNER_EVIDENCE.length),
  supersedingItemId: SocialQueueItemIdSchema.nullable(),
  changedFields: z.array(z.enum(["caption", "altText", "frames"])).max(3),
  reason: BoundedTextSchema.nullable(),
  /** A rejection's lesson, addressed to the venture that drafted the item. */
  tasteNote: z.strictObject({ releaseId: z.string().trim().min(1).max(200), note: BoundedTextSchema }).nullable()
}).superRefine((event, context) => {
  const issue = (message: string, path: string) => context.addIssue({ code: "custom", message, path: [path] });
  const approving = event.action === "approve";
  const superseding = event.action === "edit" || event.action === "rerender";
  const cancelling = event.action === "hold" || event.action === "reject";

  if (approving) {
    if (!["draft", "approved"].includes(event.previousStatus) || event.nextStatus !== "queued") issue("An approval moves a draft to queued and nowhere else", "nextStatus");
    if (event.mode === null || event.publishWindow === null) issue("An approval states its mode and the window it approved", "publishWindow");
    if (event.publishWindow && Date.parse(event.publishWindow.notAfter) <= Date.parse(event.publishWindow.notBefore)) issue("An approved window must end after it opens", "publishWindow");
    if (event.deterministicChecks === null) issue("An approval records the deterministic checks it ran", "deterministicChecks");
    if (new Set(event.ownerEvidenceFor).size !== SOCIAL_QUEUE_OWNER_EVIDENCE.length) issue("An approval is the owner's evidence for brand, claims, quill, keeper and policy", "ownerEvidenceFor");
    if (event.resultingContentHash === null) issue("An approval binds the approved item's hash", "resultingContentHash");
  } else {
    if (event.mode !== null || event.publishWindow !== null || event.deterministicChecks !== null || event.ownerEvidenceFor.length > 0) issue("Only an approval carries a mode, a window, checks or owner evidence", "action");
  }

  if (superseding) {
    if (!["draft", "approved", "queued", "failed"].includes(event.previousStatus) || event.nextStatus !== "cancelled") issue("A superseded item is cancelled", "nextStatus");
    const base = event.itemId.replace(/-r[1-9]\d*$/u, "");
    if (event.supersedingItemId === null || !new RegExp(`^${base}-r[1-9]\\d*$`, "u").test(event.supersedingItemId) || event.supersedingItemId === event.itemId) {
      issue("A superseding item is the same item with the next revision suffix", "supersedingItemId");
    }
    if (event.resultingContentHash === null) issue("An edit binds the superseding item's hash", "resultingContentHash");
    if (event.action === "edit" && !event.changedFields.some((field) => field === "caption" || field === "altText")) issue("An edit changes the caption or the alt text", "changedFields");
    if (event.action === "rerender" && !event.changedFields.includes("frames")) issue("A re-render changes the frames", "changedFields");
  } else if (event.supersedingItemId !== null || event.changedFields.length > 0) {
    issue("Only an edit or a re-render supersedes an item", "supersedingItemId");
  }

  if (cancelling) {
    if (!["draft", "approved", "queued", "failed", "expired"].includes(event.previousStatus) || event.nextStatus !== "cancelled") issue("A hold or a rejection cancels the item", "nextStatus");
    if (event.reason === null) issue("A hold or a rejection says why", "reason");
    if (event.resultingContentHash !== null) issue("A cancelled item binds no new hash", "resultingContentHash");
  }
  if ((event.action === "reject") !== (event.tasteNote !== null)) issue("Only a rejection leaves a taste note, and every rejection does", "tasteNote");
});

export type SocialQueueEvent = z.infer<typeof SocialQueueEventSchema>;
export type SocialQueueEventAction = (typeof SOCIAL_QUEUE_EVENT_ACTIONS)[number];
