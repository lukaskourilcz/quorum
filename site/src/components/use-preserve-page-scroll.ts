"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type SyntheticEvent
} from "react";

const scrollStableControls = "button, input[type='range']";

export function usePreservePageScroll() {
  const pendingScrollY = useRef<number | null>(null);
  const clearFrame = useRef<number | null>(null);

  const capture = useCallback((event: SyntheticEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(scrollStableControls)) {
      return;
    }

    pendingScrollY.current = window.scrollY;
    if (clearFrame.current !== null) {
      window.cancelAnimationFrame(clearFrame.current);
    }
    clearFrame.current = window.requestAnimationFrame(() => {
      clearFrame.current = window.requestAnimationFrame(() => {
        pendingScrollY.current = null;
        clearFrame.current = null;
      });
    });
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollY.current === null) return;
    const scrollY = pendingScrollY.current;
    pendingScrollY.current = null;
    if (clearFrame.current !== null) {
      window.cancelAnimationFrame(clearFrame.current);
      clearFrame.current = null;
    }
    window.scrollTo(window.scrollX, scrollY);
  });

  useEffect(
    () => () => {
      if (clearFrame.current !== null) {
        window.cancelAnimationFrame(clearFrame.current);
      }
    },
    []
  );

  return capture;
}
