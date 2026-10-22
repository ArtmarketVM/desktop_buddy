import { useCallback, useEffect, useId, useRef, useState } from "react";

const openedEvent = "buddy:popover-opened";

/** One transient popover at a time, including portalled surfaces. */
export function useDismissiblePopover({
  restoreFocusOnEscape = true,
  dismissOnViewportChange = true,
}: { restoreFocusOnEscape?: boolean; dismissOnViewportChange?: boolean } = {}) {
  const id = useId();
  const [open, updateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setOpen = useCallback(
    (next: boolean) => {
      if (next)
        window.dispatchEvent(new CustomEvent(openedEvent, { detail: id }));
      updateOpen(next);
    },
    [id],
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !surfaceRef.current?.contains(target)
      )
        updateOpen(false);
    };
    const another = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) updateOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      updateOpen(false);
      if (restoreFocusOnEscape) triggerRef.current?.focus();
    };
    const blur = () => updateOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener(openedEvent, another);
    window.addEventListener("blur", blur);
    if (dismissOnViewportChange) {
      window.addEventListener("resize", blur);
      window.addEventListener("scroll", blur);
    }
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener(openedEvent, another);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
      window.removeEventListener("scroll", blur);
    };
  }, [open, id, restoreFocusOnEscape, dismissOnViewportChange]);
  return { id, open, setOpen, rootRef, surfaceRef, triggerRef };
}
