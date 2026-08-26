import { z } from "zod";

/**
 * Everything waiting on the owner, in one file the admin reads and nothing else writes.
 *
 * Two questions the admin could never answer: what am I approving, and what can only I do. The
 * answers were spread across `state/INBOX.md`, `docs/NEEDED.md` and a set of environment
 * variables nobody could see the state of. This file is the join, rebuilt from those sources every
 * cycle — which is what makes it self-cleaning. Acting at the source (countersigning the inbox
 * entry, ticking the NEEDED line, setting the variable) clears the item on the next run, so there
 * is no second place to keep in sync and no way for this file to disagree with the truth for long.
 *
 * `plain` is the whole point of the contract: one sentence a non-technical reader can act on. An
 * item whose ref the dictionary does not know keeps its raw title and says `needsPlainCopy`, so
 * the gap is visible rather than papered over with jargon.
 */
export const OwnerAttentionSchema = z.object({
  schemaVersion: z.literal("owner-attention/1"),
  generatedAt: z.string().datetime(),
  approvals: z.array(z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(280),
    plain: z.string().min(1).max(400),
    source: z.object({
      kind: z.literal("inbox"),
      ref: z.string().min(1).max(200)
    }),
    since: z.string().date().nullable(),
    urgency: z.enum(["blocking", "soon", "whenever"]),
    needsPlainCopy: z.boolean().optional()
  })),
  manualTasks: z.array(z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(280),
    plain: z.string().min(1).max(400),
    /** At most three, each short enough to read at a glance. */
    steps: z.array(z.string().min(1).max(200)).max(3),
    source: z.object({
      kind: z.enum(["needed", "runtime"]),
      ref: z.string().min(1).max(200)
    }),
    since: z.string().date().nullable(),
    urgency: z.enum(["blocking", "soon", "whenever"]),
    needsPlainCopy: z.boolean().optional()
  })),
  operationalIncidents: z.array(z.object({
    incidentId: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(160),
    conditionKey: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(200),
    nodeId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    affectedScope: z.string().min(1).max(240),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    evidenceRefs: z.array(z.string().min(1).max(160)).max(24),
    exactOwnerAction: z.string().min(1).max(400),
    impact: z.string().min(1).max(400),
    unaffectedScope: z.string().min(1).max(400),
    retryCondition: z.string().min(1).max(400),
    sourcePolicyRef: z.string().min(1).max(160),
    status: z.enum(["active", "corrected", "resolved"]),
    correctionHistory: z.array(z.object({
      at: z.string().datetime(),
      status: z.enum(["corrected", "resolved"]),
      evidenceRef: z.string().min(1).max(160)
    })).max(20)
  })).max(100).optional()
});

export type OwnerAttention = z.infer<typeof OwnerAttentionSchema>;

export const OWNER_ATTENTION_PATH = "owner-attention.json";
