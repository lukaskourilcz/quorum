import { describe, expect, it } from "vitest";
import {
  GESTURE_GAP_MS,
  LOCK_MS,
  armWheelGesture,
  createWheelGestureState,
  shouldWheelAct
} from "./wheel-gesture";

/**
 * Replay a stream of wheel events over a deterministic clock and count how many act.
 *
 * The whole point of this module is behaviour at trackpad event rates, which no browser harness
 * reproduces: the pane that was used to check it clamps timers to a second when the tab is
 * hidden, so a simulated 13 ms flick arrived as seventeen events a second apart — seventeen
 * separate gestures, correctly handled, and no evidence about the thing being tested. An
 * injected clock is the only honest way to assert this.
 */
function replay(events: ReadonlyArray<{ at: number; delta: number }>): number {
  const state = createWheelGestureState();
  let acted = 0;
  for (const event of events) {
    if (shouldWheelAct(state, event.at, event.delta)) {
      acted += 1;
      armWheelGesture(state, event.at, LOCK_MS);
    }
  }
  return acted;
}

/** A macOS flick: dense events whose delta decays from the speed the fingers left at. */
function flick(startAt: number, durationMs: number, peak = 120, stepMs = 13) {
  const count = Math.round(durationMs / stepMs);
  return Array.from({ length: count }, (_, index) => ({
    at: startAt + index * stepMs,
    delta: peak * Math.exp((-3.2 * index) / count)
  }));
}

/** A two-finger drag: dense events at a roughly constant speed, because it is still being pushed. */
function drag(startAt: number, durationMs: number, delta = 40, stepMs = 13) {
  const count = Math.round(durationMs / stepMs);
  return Array.from({ length: count }, (_, index) => ({
    at: startAt + index * stepMs,
    delta
  }));
}

describe("shouldWheelAct", () => {
  it("moves one room for one flick, however long its momentum lasts", () => {
    // 1.4 s is ordinary; 2.5 s is a hard flick. Both were walking the reader through every
    // room on the page, because the lock was a 640 ms deadline and momentum outlives it.
    expect(replay(flick(1_000, 1_400))).toBe(1);
    expect(replay(flick(1_000, 2_500))).toBe(1);
    expect(replay(flick(1_000, 4_000))).toBe(1);
  });

  it("moves one room per flick when flicks are repeated", () => {
    expect(replay([...flick(1_000, 1_200), ...flick(3_000, 1_200), ...flick(5_000, 1_200)])).toBe(3);
  });

  it("keeps walking while a deliberate drag is still being pushed", () => {
    // A sustained drag holds near its peak, so it must not be mistaken for momentum and frozen.
    // Roughly one room per lock: 3 s of dragging is four or five rooms, not one and not thirty.
    const acted = replay(drag(1_000, 3_000));
    expect(acted).toBeGreaterThanOrEqual(3);
    expect(acted).toBeLessThanOrEqual(6);
  });

  it("gives a mouse wheel one room per notch", () => {
    // Discrete events, well spaced, each one the whole of its gesture.
    const notches = [0, 700, 1_400, 2_100].map((at) => ({ at: 1_000 + at, delta: 100 }));
    expect(replay(notches)).toBe(4);
  });

  it("treats a quiet gap as the start of a new gesture", () => {
    const state = createWheelGestureState();
    expect(shouldWheelAct(state, 1_000, 120)).toBe(true);
    armWheelGesture(state, 1_000, LOCK_MS);
    // Well after the lock, and after a silence longer than the gesture gap: a fresh gesture,
    // even though it is slower than the one before it.
    expect(shouldWheelAct(state, 1_000 + LOCK_MS + GESTURE_GAP_MS + 50, 10)).toBe(true);
  });

  it("does not let the tail of a flick act once the lock has expired", () => {
    const state = createWheelGestureState();
    expect(shouldWheelAct(state, 1_000, 120)).toBe(true);
    armWheelGesture(state, 1_000, LOCK_MS);
    // Momentum still arriving at 13 ms intervals when the 640 ms deadline passes. This is the
    // exact instant the original bug fired.
    let acted = 0;
    for (let at = 1_013; at < 1_000 + 2_000; at += 13) {
      if (shouldWheelAct(state, at, 120 * Math.exp((-3.2 * (at - 1_000)) / 2_000))) acted += 1;
    }
    expect(acted).toBe(0);
  });

  it("never acts twice inside one lock", () => {
    const state = createWheelGestureState();
    expect(shouldWheelAct(state, 1_000, 120)).toBe(true);
    armWheelGesture(state, 1_000, LOCK_MS);
    for (let at = 1_010; at < 1_000 + LOCK_MS; at += 10) {
      expect(shouldWheelAct(state, at, 120)).toBe(false);
    }
  });
});
