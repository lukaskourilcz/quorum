import { z } from "zod";
import { openObject } from "./common.js";

export const HookSurfaceSchema = z.enum(["quiz", "news", "mma"]);
export const HookVerticalSchema = z.enum(["dev", "geo"]);
export const HookLanguageSchema = z.enum(["en", "cs"]);

/**
 * Why a pack carries no hook.
 *
 * A recorded fallback, not an absent field: "the library is not written yet" and "every hook was
 * cooling" are different facts, and the KPI counts a logged `no-hook` as a pass while an unlogged
 * missing assignment is a defect.
 */
export const NoHookReasonSchema = z.enum(["empty-library", "empty-eligible-set"]);

const HOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const HookCooldownEntrySchema = openObject({
  hookId: z.string().regex(HOOK_ID),
  lastPostedOn: z.iso.date(),
  daysSince: z.number().int().min(0),
  requiredDays: z.number().int().min(14)
});

/**
 * What the studio decided about slide 1, recorded in the pack.
 *
 * `eligibleIds` plus `eligibleSetHash` is the whole override bound: a meeting may swap `hookId` for
 * another member of the recorded set, and validation rehashes the set to prove the swap stayed
 * inside it. The hash is order-independent so a library reordering cannot invalidate a committed
 * pack's receipt.
 */
export const HookAssignmentSchema = openObject({
  schemaVersion: z.literal("hook-assignment/1"),
  surface: HookSurfaceSchema,
  vertical: HookVerticalSchema,
  /** The venture-channel the cooldown and variety rules were scoped to, e.g. `devshark-instagram`. */
  channel: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  date: z.iso.date(),
  itemId: z.string().min(1).max(160),
  /** The seed the pick was taken from, so a rebuild can be shown to reach the same hook. */
  seed: z.string().regex(/^[a-f0-9]{64}$/),
  languages: z.array(HookLanguageSchema).min(1).max(2),
  eligibleSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  eligibleIds: z.array(z.string().regex(HOOK_ID)),
  /** Eligible, then cooled and variety-filtered. The seeded pick ran over exactly this list. */
  availableIds: z.array(z.string().regex(HOOK_ID)),
  cooldownSnapshot: z.array(HookCooldownEntrySchema),
  hookId: z.string().regex(HOOK_ID).nullable(),
  /** Set when an agent swapped the proposed hook, with the meeting that did it. */
  overriddenFrom: z.string().regex(HOOK_ID).nullable().default(null),
  overrideMeetingRef: z.string().min(1).max(240).nullable().default(null),
  noHookReason: NoHookReasonSchema.nullable().default(null)
}).superRefine((assignment, context) => {
  const assigned = assignment.hookId !== null;

  if (assigned === (assignment.noHookReason !== null)) {
    context.addIssue({
      code: "custom",
      message: "An assignment carries exactly one of hookId and noHookReason",
      path: ["hookId"]
    });
  }

  // The gate, restated where the pack is read rather than only where it was written. A hook
  // outside its own recorded eligible set is the one failure this contract exists to make
  // impossible, whether it got there by an agent override or by a bug.
  if (assigned && !assignment.eligibleIds.includes(assignment.hookId!)) {
    context.addIssue({
      code: "custom",
      message: `Assigned hook ${assignment.hookId} is not in the recorded eligible set`,
      path: ["hookId"]
    });
  }

  if (assignment.overriddenFrom !== null && !assignment.eligibleIds.includes(assignment.overriddenFrom)) {
    context.addIssue({
      code: "custom",
      message: `Overridden-from hook ${assignment.overriddenFrom} is not in the recorded eligible set`,
      path: ["overriddenFrom"]
    });
  }

  if (assignment.overriddenFrom !== null && assignment.overriddenFrom === assignment.hookId) {
    context.addIssue({
      code: "custom",
      message: "An override must name a different hook than the one assigned",
      path: ["overriddenFrom"]
    });
  }

  // An override without its meeting is an unattributable change to published copy.
  if (assignment.overriddenFrom !== null && assignment.overrideMeetingRef === null) {
    context.addIssue({
      code: "custom",
      message: "An override records the meeting that made it",
      path: ["overrideMeetingRef"]
    });
  }

  for (const id of assignment.availableIds) {
    if (!assignment.eligibleIds.includes(id)) {
      context.addIssue({
        code: "custom",
        message: `Available hook ${id} is not in the recorded eligible set`,
        path: ["availableIds"]
      });
    }
  }
});

export type HookAssignment = z.infer<typeof HookAssignmentSchema>;
export type HookCooldownEntry = z.infer<typeof HookCooldownEntrySchema>;
export type NoHookReason = z.infer<typeof NoHookReasonSchema>;
