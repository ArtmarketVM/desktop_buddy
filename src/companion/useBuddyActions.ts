import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";

export const BUDDY_ACTION_IDLE_MS = 500;

/** Keep controls reachable while hovered, focused or used by an open chat. */
export function useBuddyActions(pinned: boolean) {
  const [visible, setVisible] = useState(true);
  const hovered = useRef(false);
  const focused = useRef(false);
  const nativeHovered = useRef(false);
  const nativeTracking = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = useCallback(() => {
    clear();
    setVisible(true);
  }, [clear]);
  const hideLater = useCallback(() => {
    clear();
    if (
      !pinned &&
      !(nativeTracking.current ? nativeHovered.current : hovered.current) &&
      !focused.current
    )
      timer.current = setTimeout(() => setVisible(false), BUDDY_ACTION_IDLE_MS);
  }, [clear, pinned]);
  useEffect(() => {
    if (pinned) show();
    else hideLater();
    return clear;
  }, [pinned, show, hideLater, clear]);
  const setNativeHovered = useCallback(
    (value: boolean) => {
      nativeTracking.current = true;
      if (nativeHovered.current === value) return;
      nativeHovered.current = value;
      if (value) show();
      else hideLater();
    },
    [show, hideLater],
  );
  return {
    visible,
    setNativeHovered,
    events: {
      onPointerEnter: () => {
        hovered.current = true;
        show();
      },
      onPointerLeave: () => {
        hovered.current = false;
        hideLater();
      },
      onFocusCapture: () => {
        focused.current = true;
        show();
      },
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focused.current = false;
        hideLater();
      },
    },
  };
}
