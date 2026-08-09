import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GESTURE_GAP_MS,
  LOCK_MS,
  armWheelGesture,
  createWheelGestureState,
  scrollableAncestor,
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

  it("acts on a deliberate push that arrives while the last flick is still coasting", () => {
    // The reported bug: a hard flick leaves a high peak, the reader pushes again more gently than
    // they flicked, and the push measures below three quarters of that stale peak. It was read as
    // momentum and dropped, so the page ignored the first scroll and moved on the second.
    const state = createWheelGestureState();
    expect(shouldWheelAct(state, 1_000, 300)).toBe(true);
    armWheelGesture(state, 1_000, LOCK_MS);

    let at = 1_013;
    let acted = 0;
    // The tail of the flick, decaying, arriving without a gap long enough to end the gesture.
    for (let step = 0; step < 60; step += 1, at += 13) {
      if (shouldWheelAct(state, at, 300 * Math.exp((-3.2 * step) / 60))) acted += 1;
    }
    expect(acted, "the tail alone must move nothing").toBe(0);

    // Now a real push: gentler than the flick, but faster than the event before it.
    expect(shouldWheelAct(state, at, 90)).toBe(true);
  });

  it("still ignores a tail that never rises, however long it runs", () => {
    const state = createWheelGestureState();
    expect(shouldWheelAct(state, 1_000, 300)).toBe(true);
    armWheelGesture(state, 1_000, LOCK_MS);
    let acted = 0;
    for (let step = 0, at = 1_013; step < 200; step += 1, at += 13) {
      if (shouldWheelAct(state, at, 300 * Math.exp((-3.2 * step) / 200))) acted += 1;
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

/**
 * Handing the wheel to a list before claiming it for the page.
 *
 * The walkthrough calls `preventDefault` on every wheel event and turns the gesture into a jump.
 * Over the roster, the calendar's rows or a room's message list that is the wrong answer twice
 * over: the list cannot be scrolled at all, and the reader is moved to a section they did not ask
 * for. The browser would have scrolled the inner element first and only chained to the page at its
 * end, which is exactly the rule below.
 */
describe("scrollableAncestor", () => {
  /*
   * A DOM node reduced to the four properties the rule reads.
   *
   * The suite runs in node, where there is no `Element` and no `getComputedStyle`. Both are
   * stubbed rather than pulled in with a DOM implementation: the rule is arithmetic over four
   * numbers and a string, and a whole DOM would be a slower way to assert the same thing.
   */
  class FakeElement {
    scrollHeight = 0;
    clientHeight = 0;
    scrollTop = 0;
    parentElement: FakeElement | null = null;
  }

  const styles = new Map<object, string>();
  const originalStyle = globalThis.getComputedStyle;
  const originalElement = globalThis.Element;

  function element(options: {
    overflowY: string;
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
    parent?: FakeElement | null;
  }): FakeElement {
    const node = new FakeElement();
    node.scrollHeight = options.scrollHeight;
    node.clientHeight = options.clientHeight;
    node.scrollTop = options.scrollTop;
    node.parentElement = options.parent ?? null;
    styles.set(node, options.overflowY);
    return node;
  }

  beforeEach(() => {
    globalThis.Element = FakeElement as unknown as typeof Element;
    globalThis.getComputedStyle = ((node: object) =>
      ({ overflowY: styles.get(node) ?? "visible" })) as unknown as typeof getComputedStyle;
  });

  afterEach(() => {
    globalThis.getComputedStyle = originalStyle;
    globalThis.Element = originalElement;
    styles.clear();
  });

  const check = (node: FakeElement, deltaY: number, root: FakeElement | null = null) =>
    scrollableAncestor(node as unknown as Element, deltaY, root as unknown as Element | null);

  it("claims the wheel for a list with room left below", () => {
    const list = element({ overflowY: "auto", scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    expect(check(list, 120)).toBe(list);
  });

  it("hands it back at the end of the list, so the reader can leave the section", () => {
    const list = element({ overflowY: "auto", scrollHeight: 900, clientHeight: 300, scrollTop: 600 });
    expect(check(list, 120)).toBeNull();
    // And still takes it going the other way, because there is travel above.
    expect(check(list, -120)).toBe(list);
  });

  it("ignores an element that does not overflow, however it is styled", () => {
    const list = element({ overflowY: "auto", scrollHeight: 300, clientHeight: 300, scrollTop: 0 });
    expect(check(list, 120)).toBeNull();
  });

  it("ignores one that overflows but does not scroll", () => {
    const clipped = element({ overflowY: "hidden", scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    expect(check(clipped, 120)).toBeNull();
  });

  it("finds a scroller a few levels up from the pointer's target", () => {
    const list = element({ overflowY: "auto", scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    const row = element({ overflowY: "visible", scrollHeight: 40, clientHeight: 40, scrollTop: 0, parent: list });
    const label = element({ overflowY: "visible", scrollHeight: 20, clientHeight: 20, scrollTop: 0, parent: row });
    expect(check(label, 120)).toBe(list);
  });

  it("stops at the walkthrough's own root rather than reaching the document", () => {
    const root = element({ overflowY: "auto", scrollHeight: 9000, clientHeight: 800, scrollTop: 0 });
    const inner = element({ overflowY: "visible", scrollHeight: 40, clientHeight: 40, scrollTop: 0, parent: root });
    expect(check(inner, 120, root)).toBeNull();
  });
});
