import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eligibleSetHash } from "@boardlessai/carousel-studio";
import { describe, expect, it } from "vitest";
import { HookAssignmentSchema, type HookAssignment } from "../src/contracts/hook-assignment.js";
import {
  applyHookOverride,
  assertHookAssignmentValid,
  assignPackHook,
  channelRecordFor,
  HookOverrideError
} from "../src/studio/hook-brain.js";
import {
  cooldownOccupancy,
  historyFor,
  readHookChannels,
  recentPosts,
  recordPost,
  writeHookChannels
} from "../src/studio/hook-channels.js";

const CATEGORY_LISTS = {
  core: ["internet", "git", "security", "databases", "testing"],
  commonUse: ["javascript", "typescript", "git", "css", "html", "react", "nodejs"],
  interview: ["dsa", "algorithms", "system-design", "databases", "javascript", "typescript"]
};

const QUIZ = {
  subject: {
    difficulty: 3,
    hasCode: false,
    category: "javascript",
    optionCount: 4,
    canonicalEnglishQuestion: "What does this return?"
  },
  categoryLists: CATEGORY_LISTS
};

async function root(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "hook-brain-"));
}

function assignment(overrides: Partial<HookAssignment> = {}): HookAssignment {
  const eligibleIds = ["payoff-explainer", "half-known", "footnote", "seniors-know"];
  return HookAssignmentSchema.parse({
    schemaVersion: "hook-assignment/1",
    surface: "quiz",
    vertical: "dev",
    channel: "devshark-carousel",
    date: "2026-08-08",
    itemId: "q-1",
    seed: "a".repeat(64),
    languages: ["en", "cs"],
    eligibleSetHash: eligibleSetHash(eligibleIds),
    eligibleIds,
    availableIds: ["payoff-explainer", "half-known"],
    cooldownSnapshot: [],
    hookId: "payoff-explainer",
    overriddenFrom: null,
    overrideMeetingRef: null,
    noHookReason: null,
    ...overrides
  });
}

describe("hook assignment through the brain", () => {
  it("assigns a quiz pack and records the set that licensed it", async () => {
    const result = await assignPackHook({
      stateRoot: await root(),
      surface: "quiz",
      channel: "devshark-carousel",
      date: "2026-08-08",
      itemId: "q-1",
      vertical: "dev",
      languages: ["en", "cs"],
      quiz: QUIZ
    });

    expect(result.assignment.hookId).not.toBeNull();
    expect(result.assignment.noHookReason).toBeNull();
    expect(result.assignment.eligibleIds).toContain(result.assignment.hookId);
    expect(result.assignment.eligibleSetHash).toBe(eligibleSetHash(result.assignment.eligibleIds));
    expect(() => assertHookAssignmentValid(result.assignment)).not.toThrow();
  });

  it("is reproducible from the same pack identity", async () => {
    const input = {
      stateRoot: await root(),
      surface: "quiz" as const,
      channel: "devshark-carousel",
      date: "2026-08-08",
      itemId: "q-1",
      vertical: "dev" as const,
      languages: ["en", "cs"] as const,
      quiz: QUIZ
    };
    const [first, second] = await Promise.all([assignPackHook(input), assignPackHook(input)]);
    expect(first.assignment).toEqual(second.assignment);

    const other = await assignPackHook({ ...input, itemId: "q-2" });
    expect(other.assignment.seed).not.toBe(first.assignment.seed);
  });

  it("falls back to no-hook for news and mma, and says which kind of empty it was", async () => {
    for (const surface of ["news", "mma"] as const) {
      const result = await assignPackHook({
        stateRoot: await root(),
        surface,
        channel: `${surface}-carousel`,
        date: "2026-08-08",
        itemId: "item-1",
        vertical: "dev",
        languages: ["cs"]
      });
      expect(result.assignment.hookId).toBeNull();
      expect(result.assignment.noHookReason).toBe("empty-library");
      expect(result.assignment.eligibleIds).toEqual([]);
      // A fallback is a logged outcome, not an absence: it still carries a reproducible seed.
      expect(result.assignment.seed).toMatch(/^[a-f0-9]{64}$/u);
      expect(channelRecordFor(result.assignment, null).fallback).toBe("empty-library");
    }
  });
});

describe("the agent override bound", () => {
  it("accepts a swap to another available hook and records the meeting", () => {
    const swapped = applyHookOverride({
      assignment: assignment(),
      hookId: "half-known",
      meetingRef: "state/meetings/2026-08-08-ms-daily.json"
    });

    expect(swapped.hookId).toBe("half-known");
    expect(swapped.overriddenFrom).toBe("payoff-explainer");
    expect(swapped.overrideMeetingRef).toBe("state/meetings/2026-08-08-ms-daily.json");
    expect(() => assertHookAssignmentValid(swapped)).not.toThrow();
  });

  it("refuses a hook outside the eligible set", () => {
    // streak-breaker is gated on difficulty 4 and this item is a 3. No meeting reaches it.
    expect(() => applyHookOverride({ assignment: assignment(), hookId: "streak-breaker", meetingRef: "m" }))
      .toThrowError(/not in the eligible set: its gates do not hold/u);
  });

  it("refuses an eligible hook the rotation filtered out, and says which rule did it", () => {
    expect(() => applyHookOverride({ assignment: assignment(), hookId: "footnote", meetingRef: "m" }))
      .toThrowError(/eligible but was filtered out by the channel cooldown or the archetype-variety rule/u);
  });

  it("refuses an override on a pack that took the fallback", () => {
    const fallback = assignment({
      eligibleIds: [], eligibleSetHash: eligibleSetHash([]), availableIds: [],
      hookId: null, noHookReason: "empty-library"
    });
    expect(() => applyHookOverride({ assignment: fallback, hookId: "half-known", meetingRef: "m" }))
      .toThrowError(/no assignment to override/u);
  });

  it("refuses a no-op override", () => {
    expect(() => applyHookOverride({ assignment: assignment(), hookId: "payoff-explainer", meetingRef: "m" }))
      .toThrowError(/already the assigned hook/u);
  });

  it("catches an eligible set edited after it was evaluated", () => {
    // The attack the hash exists for: widen eligibleIds so a forbidden hook looks licensed. The
    // recorded hash still describes the set the gates actually produced.
    const smuggled = { ...assignment(), eligibleIds: [...assignment().eligibleIds, "streak-breaker"], hookId: "streak-breaker" };
    expect(() => assertHookAssignmentValid(smuggled as HookAssignment))
      .toThrowError(HookOverrideError);
    expect(() => assertHookAssignmentValid(smuggled as HookAssignment))
      .toThrowError(/does not hash to its recorded snapshot/u);
  });

  it("rejects an out-of-set hook at the contract boundary too, not only in code", () => {
    // Belt and braces: a package hand-edited on disk never reaches assertHookAssignmentValid.
    const result = HookAssignmentSchema.safeParse({ ...assignment(), hookId: "streak-breaker" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("not in the recorded eligible set");
  });

  it("requires a meeting reference on any override", () => {
    const result = HookAssignmentSchema.safeParse({ ...assignment(), hookId: "half-known", overriddenFrom: "payoff-explainer" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("records the meeting that made it");
  });
});

describe("channel state", () => {
  it("round-trips and is idempotent on one pack identity", async () => {
    const stateRoot = await root();
    const post = { date: "2026-08-08", hookId: "half-known", archetype: "partial-knowledge", itemId: "q-1", eligibleCount: 12, fallback: null };

    let channels = recordPost(await readHookChannels(stateRoot), "devshark-carousel", post);
    // A rerun or a backstop sweep reaches this with the same identity. Two entries would both
    // double-count the cooldown and overstate the rotation.
    channels = recordPost(channels, "devshark-carousel", post);
    await writeHookChannels(stateRoot, channels);

    const reread = await readHookChannels(stateRoot);
    expect(historyFor(reread, "devshark-carousel")).toEqual([
      { date: "2026-08-08", hookId: "half-known", archetype: "partial-knowledge" }
    ]);
  });

  it("keeps no-hook days out of the history the cooldown and variety rules read", async () => {
    const stateRoot = await root();
    let channels = await readHookChannels(stateRoot);
    channels = recordPost(channels, "caught-up-carousel", { date: "2026-08-08", hookId: "none", archetype: "none", itemId: "a", eligibleCount: 0, fallback: "empty-library" });
    channels = recordPost(channels, "caught-up-carousel", { date: "2026-08-09", hookId: "half-known", archetype: "partial-knowledge", itemId: "b", eligibleCount: 12, fallback: null });

    // A fallback has no hook to cool and no archetype to vary against, so counting it would let
    // an empty day block whichever archetype it did not have.
    expect(historyFor(channels, "caught-up-carousel").map((post) => post.hookId)).toEqual(["half-known"]);
    // It stays in the record, because the KPI counts logged fallbacks.
    expect(recentPosts(channels, 20).filter((post) => post.fallback !== null)).toHaveLength(1);
  });

  it("counts only hooks still inside their cooldown as occupancy", async () => {
    let channels = await readHookChannels(await root());
    channels = recordPost(channels, "devshark-carousel", { date: "2026-08-01", hookId: "cool", archetype: "a", itemId: "1", eligibleCount: 9, fallback: null });
    channels = recordPost(channels, "devshark-carousel", { date: "2026-07-01", hookId: "warm", archetype: "b", itemId: "2", eligibleCount: 9, fallback: null });

    expect(cooldownOccupancy(channels, "devshark-carousel", "2026-08-08", () => 14)).toBe(1);
    expect(cooldownOccupancy(channels, "devshark-carousel", "2026-08-08", () => 60)).toBe(2);
    // A hook the library no longer has cannot be cooling.
    expect(cooldownOccupancy(channels, "devshark-carousel", "2026-08-08", () => null)).toBe(0);
  });

  it("orders the recent feed newest first across channels", async () => {
    let channels = await readHookChannels(await root());
    channels = recordPost(channels, "a-carousel", { date: "2026-08-01", hookId: "old", archetype: "x", itemId: "1", eligibleCount: 4, fallback: null });
    channels = recordPost(channels, "b-carousel", { date: "2026-08-09", hookId: "new", archetype: "y", itemId: "2", eligibleCount: 5, fallback: null });

    expect(recentPosts(channels, 20).map((post) => post.hookId)).toEqual(["new", "old"]);
    expect(recentPosts(channels, 1).map((post) => post.hookId)).toEqual(["new"]);
  });
});
