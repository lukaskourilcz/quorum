import {
  assignHook,
  assignmentSeed,
  eligibleSetHash,
  readLibrary,
  renderHookText,
  type Hook,
  type Language,
  type Library,
  type QuizContext,
  type Surface,
  type Vertical
} from "@boardlessai/carousel-studio";
import { HookAssignmentSchema, type HookAssignment } from "../contracts/hook-assignment.js";
import { historyFor, readHookChannels, type ChannelPostRecord, type HookChannels } from "./hook-channels.js";

export interface HookBrainInput {
  readonly stateRoot: string;
  readonly surface: Surface;
  /** venture-channel, e.g. `devshark-instagram`. Cooldown and variety are scoped to this. */
  readonly channel: string;
  readonly date: string;
  readonly itemId: string;
  readonly vertical: Vertical;
  readonly languages: readonly Language[];
  /** The quiz surface's subject. Absent for surfaces whose libraries are not written yet. */
  readonly quiz?: QuizContext;
}

export interface HookBrainResult {
  readonly assignment: HookAssignment;
  /** Null on the `no-hook` fallback, which is a logged outcome and never an error. */
  readonly hook: Hook | null;
  /** The library the decision was taken against, so a caller can resolve another eligible member. */
  readonly library: Library;
  readonly channels: HookChannels;
}

/**
 * The one entry point every pack builder uses to ask what fronts slide 1.
 *
 * It reads the surface's library and the channel's history, runs the studio's assignment, and
 * returns the decision as a `hook-assignment/1` record. It writes nothing: the caller commits the
 * assignment together with the package and the channel record, because a channel entry without a
 * package would cool a hook that never posted.
 *
 * The `no-hook` path is ordinary. DNESKAi and MMA Files take it on every pack today — their
 * libraries are not written — and a missing hook never blocks a pack.
 */
export async function assignPackHook(input: HookBrainInput): Promise<HookBrainResult> {
  const library = await readLibrary(input.surface);
  const channels = await readHookChannels(input.stateRoot);
  const identity = { channel: input.channel, date: input.date, itemId: input.itemId };

  const result = assignHook({
    library,
    ...(input.quiz ? { context: input.quiz } : {}),
    identity,
    vertical: input.vertical,
    history: historyFor(channels, input.channel)
  });

  const base = {
    schemaVersion: "hook-assignment/1" as const,
    surface: input.surface,
    vertical: input.vertical,
    channel: input.channel,
    date: input.date,
    itemId: input.itemId,
    languages: [...input.languages],
    overriddenFrom: null,
    overrideMeetingRef: null
  };

  if (result.outcome === "no-hook") {
    return {
      assignment: HookAssignmentSchema.parse({
        ...base,
        // A fallback still records the seed and the set it evaluated, so "nothing was eligible"
        // can be reproduced rather than taken on trust.
        seed: assignmentSeed(identity),
        eligibleSetHash: result.eligible.hash,
        eligibleIds: [...result.eligible.ids],
        availableIds: [],
        cooldownSnapshot: [],
        hookId: null,
        noHookReason: result.reason
      }),
      hook: null,
      library,
      channels
    };
  }

  const { assignment } = result;
  return {
    assignment: HookAssignmentSchema.parse({
      ...base,
      seed: assignment.seed,
      eligibleSetHash: assignment.eligible.hash,
      eligibleIds: [...assignment.eligible.ids],
      availableIds: [...assignment.available],
      cooldownSnapshot: assignment.cooldownSnapshot.map((entry) => ({ ...entry })),
      hookId: assignment.hook.id,
      noHookReason: null
    }),
    hook: assignment.hook,
    library,
    channels
  };
}

/** Why an override or an assignment was refused, in words a meeting record can carry. */
export class HookOverrideError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "HookOverrideError";
  }
}

/**
 * Prove an assignment is still the one the gates licensed.
 *
 * The eligible set is the licence: every hook in it was checked against this item's own metadata,
 * so anything inside it is honest and anything outside it is a claim nothing verified. Rehashing
 * the recorded ids and comparing is what makes that binding rather than advisory — an override, a
 * hand edit or a bug that widened `eligibleIds` to smuggle a hook in changes the hash, and the
 * package stops validating.
 *
 * Called when the package is assembled, so a bad assignment can never reach a file.
 */
export function assertHookAssignmentValid(assignment: HookAssignment): void {
  const recomputed = eligibleSetHash(assignment.eligibleIds);
  if (recomputed !== assignment.eligibleSetHash) {
    throw new HookOverrideError(
      `The eligible set does not hash to its recorded snapshot (${recomputed.slice(0, 12)} vs `
      + `${assignment.eligibleSetHash.slice(0, 12)}): the set was edited after it was evaluated`
    );
  }
  if (assignment.hookId !== null && !assignment.eligibleIds.includes(assignment.hookId)) {
    throw new HookOverrideError(
      `Hook ${assignment.hookId} is not in the eligible set recorded for ${assignment.itemId}`
    );
  }
}

/**
 * Swap the proposed hook for another member of the recorded eligible set.
 *
 * This is the whole of what an agent may do to slide 1, and it is the only thing an existing
 * marketing meeting needs: assignment is deterministic $0 code, and agent judgment is an optional
 * preference between hooks the gates have already licensed. There is no path from a meeting to a
 * hook outside the set, to a rewritten line, or to a new library entry — those go through the
 * authoring bar and the lint.
 *
 * The swap does not re-evaluate cooldown or variety. Both were applied when `availableIds` was
 * computed, and a meeting choosing from that list is choosing from what the rotation already
 * allowed.
 */
export function applyHookOverride(input: {
  readonly assignment: HookAssignment;
  readonly hookId: string;
  readonly meetingRef: string;
}): HookAssignment {
  const { assignment, hookId, meetingRef } = input;

  if (assignment.hookId === null) {
    throw new HookOverrideError(
      `${assignment.itemId} has no assignment to override: it fell back to no-hook (${assignment.noHookReason})`
    );
  }
  if (hookId === assignment.hookId) {
    throw new HookOverrideError(`${hookId} is already the assigned hook`);
  }
  if (!assignment.availableIds.includes(hookId)) {
    const why = assignment.eligibleIds.includes(hookId)
      ? "it is eligible but was filtered out by the channel cooldown or the archetype-variety rule"
      : "it is not in the eligible set: its gates do not hold for this item";
    throw new HookOverrideError(`${hookId} cannot be assigned to ${assignment.itemId} — ${why}`);
  }

  const overridden = HookAssignmentSchema.parse({
    ...assignment,
    hookId,
    overriddenFrom: assignment.hookId,
    overrideMeetingRef: meetingRef
  });
  assertHookAssignmentValid(overridden);
  return overridden;
}

/** The channel record for this assignment, written beside the package. */
export function channelRecordFor(assignment: HookAssignment, hook: Hook | null): ChannelPostRecord {
  return {
    date: assignment.date,
    hookId: assignment.hookId ?? "none",
    archetype: hook?.research.archetype ?? "none",
    itemId: assignment.itemId,
    eligibleCount: assignment.eligibleIds.length,
    fallback: assignment.noHookReason
  };
}

/**
 * The hook line for one language, or null when the pack takes its default headline.
 *
 * `{topic}` is filled from the item's own topic. A token that survives to a slide throws in the
 * studio rather than rendering, so an unfilled one is a build failure and never a published brace.
 */
export function hookLineFor(input: {
  readonly hook: Hook | null;
  readonly vertical: Vertical;
  readonly language: Language;
  readonly topic: string;
}): string | null {
  if (!input.hook) return null;
  return renderHookText({
    hook: input.hook,
    vertical: input.vertical,
    language: input.language,
    topic: input.topic
  });
}
