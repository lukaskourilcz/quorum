/**
 * Deciding which wheel events move the walk, and which are the same gesture still arriving.
 *
 * A page that moves one room per gesture has to answer a question the wheel event does not:
 * where does one gesture end and the next begin. A mouse wheel makes that easy — one notch, one
 * event. A trackpad does not. A single flick delivers events for well over a second after the
 * fingers have left, and every one of them looks exactly like a deliberate scroll.
 *
 * The original rule was a plain deadline: ignore the wheel for 640 ms after a jump. That is
 * shorter than a flick's momentum, so the back half of one flick arrived after the deadline and
 * jumped again, and again — one gesture walked through several rooms. That was the bug.
 *
 * Inertia is told apart from intent by its shape rather than by its timing. Momentum decays from
 * the speed the fingers left at; someone still dragging keeps the delta near its peak. So a
 * decayed event holds the lock open and a sustained one lets it expire, which keeps a deliberate
 * two-finger drag walking room by room instead of freezing it until the reader lifts off.
 *
 * It lives here, apart from the component, because it is the one piece of that page which is pure
 * logic over a clock — and therefore the one piece that can be tested without a browser. It has
 * to be: the failure only appears at trackpad event rates, which no headless harness reproduces.
 */

/** How long after a jump the wheel is ignored, before any momentum extension. */
export const LOCK_MS = 640;

/** The same, for a step taken inside a section taller than the viewport. */
export const INNER_LOCK_MS = 260;

/** A quiet gap this long ends a gesture; anything arriving sooner belongs to the same one. */
export const GESTURE_GAP_MS = 140;

/**
 * Below this share of the gesture's fastest event, the wheel is coasting rather than pushed.
 *
 * Momentum decays from the speed the fingers left at; a sustained drag holds near its peak.
 * Three quarters separates them with room to spare in both directions.
 */
export const MOMENTUM_DECAY = 0.75;

/**
 * How much larger than the previous event a delta must be to count as a new push.
 *
 * Momentum only ever decays. Anything moving faster than the event before it has energy the
 * previous gesture could not have given it, so the fingers are back on the pad.
 */
export const MOMENTUM_RISE = 1.15;

export interface WheelGestureState {
  /** No event before this instant may act. */
  lockUntil: number;
  /** When the previous event arrived, so a quiet gap can end the gesture. */
  lastWheelAt: number;
  /** The fastest event of the gesture in progress, which later ones are measured against. */
  peakDelta: number;
  /** The previous event's magnitude, so a rising one can be told from a decaying one. */
  lastDelta: number;
  /**
   * Where the lock would end without the extensions momentum keeps adding to it.
   *
   * Coasting events push `lockUntil` forward a gesture-gap at a time, which is what stops a long
   * tail from acting. That extension has to be droppable: a reader who pushes again mid-tail is
   * otherwise held out for as long as the tail keeps arriving, and the push is lost.
   */
  actionLockUntil: number;
}

export function createWheelGestureState(): WheelGestureState {
  return { lockUntil: 0, lastWheelAt: 0, peakDelta: 0, lastDelta: 0, actionLockUntil: 0 };
}

/**
 * Whether this event should move the walk.
 *
 * Mutates `state`: every event updates the gesture bookkeeping whether or not it acts. A caller
 * that gets `true` must call `armWheelGesture` with the lock its action deserves.
 */
export function shouldWheelAct(state: WheelGestureState, now: number, deltaY: number): boolean {
  const magnitude = Math.abs(deltaY);
  if (now - state.lastWheelAt > GESTURE_GAP_MS) {
    state.peakDelta = 0;
    state.lastDelta = 0;
  }
  /*
   * A rising delta ends the gesture that was coasting, even though the events never stopped.
   *
   * Without this the peak of a hard flick outlived it: a reader who pushed again while the tail
   * was still arriving pushed more gently than they had flicked, the event measured below three
   * quarters of the old peak, and it was discarded as momentum. The page ignored the first scroll
   * and moved on the second — which is exactly what it felt like.
   */
  if (state.lastDelta > 0 && magnitude > state.lastDelta * MOMENTUM_RISE) {
    state.peakDelta = 0;
    // Drop what the tail added, keep what the last action set. If the action's own lock has run
    // out, this push is free to move the page; if it has not, the one-room-per-gesture rule holds.
    state.lockUntil = state.actionLockUntil;
  }
  state.lastWheelAt = now;
  state.lastDelta = magnitude;
  state.peakDelta = Math.max(state.peakDelta, magnitude);

  if (now < state.lockUntil) {
    // Still coasting: hold the lock open so the tail of this gesture cannot start another jump
    // the moment the original deadline runs out.
    if (magnitude < state.peakDelta * MOMENTUM_DECAY) {
      state.lockUntil = Math.max(state.lockUntil, now + GESTURE_GAP_MS);
    }
    return false;
  }

  // The lock has expired. A decayed event here is still the tail of a gesture that already
  // moved the page — the flick simply outlasted its deadline — so it re-arms the lock rather
  // than acting on it. Without this the very failure above returns for any flick longer than
  // `LOCK_MS`, which on a trackpad is most of them.
  if (state.peakDelta > 0 && magnitude < state.peakDelta * MOMENTUM_DECAY) {
    state.lockUntil = now + GESTURE_GAP_MS;
    return false;
  }

  return true;
}

/**
 * The nearest ancestor that can still scroll the way this wheel is pushing.
 *
 * The walkthrough claims the wheel for the whole page: it calls `preventDefault` and turns the
 * gesture into a jump between sections. That is right over a section's background and wrong over
 * anything inside it that scrolls — the roster, the calendar's rows, a room's message list. The
 * browser would have chained the scroll to the inner element first and only reached the page when
 * the element hit its end; preventing the default removed that step, so those lists could not be
 * scrolled at all and every attempt jumped the reader somewhere they had not asked to go.
 *
 * This restores the step. An element counts when it actually overflows, when its computed
 * `overflow-y` scrolls, and when there is travel left in the direction pushed — the last of those
 * is what hands the wheel back to the page at the end of a list instead of trapping the reader in
 * it. The one-pixel tolerance is for fractional scroll positions, which are ordinary at non-integer
 * device pixel ratios.
 */
export function scrollableAncestor(target: EventTarget | null, deltaY: number, root: Element | null): Element | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== root) {
    const style = getComputedStyle(node);
    const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrolls && node.scrollHeight > node.clientHeight + 1) {
      const room = deltaY > 0
        ? node.scrollHeight - node.clientHeight - node.scrollTop
        : node.scrollTop;
      if (room > 1) return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Record that the caller acted, and for how long the wheel is now ignored. */
export function armWheelGesture(state: WheelGestureState, now: number, lockMs: number): void {
  state.lockUntil = now + lockMs;
  state.actionLockUntil = state.lockUntil;
}
