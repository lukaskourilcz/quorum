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

export interface WheelGestureState {
  /** No event before this instant may act. */
  lockUntil: number;
  /** When the previous event arrived, so a quiet gap can end the gesture. */
  lastWheelAt: number;
  /** The fastest event of the gesture in progress, which later ones are measured against. */
  peakDelta: number;
}

export function createWheelGestureState(): WheelGestureState {
  return { lockUntil: 0, lastWheelAt: 0, peakDelta: 0 };
}

/**
 * Whether this event should move the walk.
 *
 * Mutates `state`: every event updates the gesture bookkeeping whether or not it acts. A caller
 * that gets `true` must call `armWheelGesture` with the lock its action deserves.
 */
export function shouldWheelAct(state: WheelGestureState, now: number, deltaY: number): boolean {
  const magnitude = Math.abs(deltaY);
  if (now - state.lastWheelAt > GESTURE_GAP_MS) state.peakDelta = 0;
  state.lastWheelAt = now;
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

/** Record that the caller acted, and for how long the wheel is now ignored. */
export function armWheelGesture(state: WheelGestureState, now: number, lockMs: number): void {
  state.lockUntil = now + lockMs;
}
