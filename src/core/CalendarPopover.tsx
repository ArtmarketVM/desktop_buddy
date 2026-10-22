import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/** Portalled calendar that fits the visible viewport, independently of its goal row. */
export function CalendarPopover({
  id,
  label,
  triggerRef,
  surfaceRef,
  onClose,
  children,
  width = 284,
}: {
  id: string;
  label: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [position, setPosition] = useState<CSSProperties>({
    visibility: "hidden",
    width,
  });
  const focused = useRef(false);
  useLayoutEffect(() => {
    const panel = surfaceRef.current,
      trigger = triggerRef.current;
    if (!panel || !trigger) return;
    const measure = () => {
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0,
        y = viewport?.offsetTop ?? 0;
      const viewWidth = viewport?.width ?? document.documentElement.clientWidth;
      const viewHeight = viewport?.height ?? window.innerHeight;
      const margin = 12,
        gap = 6;
      const panelWidth = Math.max(0, Math.min(width, viewWidth - margin * 2));
      const maxHeight = Math.max(0, viewHeight - margin * 2);
      const anchor = trigger.getBoundingClientRect();
      const height = Math.min(panel.scrollHeight + 2, maxHeight);
      const below = y + viewHeight - margin - anchor.bottom - gap;
      const above = anchor.top - gap - y - margin;
      const preferredTop =
        below >= height
          ? anchor.bottom + gap
          : above >= height
            ? anchor.top - gap - height
            : anchor.bottom + gap;
      const left = Math.max(
        x + margin,
        Math.min(
          anchor.right - panelWidth,
          x + viewWidth - margin - panelWidth,
        ),
      );
      const top = Math.max(
        y + margin,
        Math.min(preferredTop, y + viewHeight - margin - height),
      );
      setPosition((old) =>
        old.left === left &&
        old.top === top &&
        old.width === panelWidth &&
        old.maxHeight === maxHeight
          ? old
          : { left, top, width: panelWidth, maxHeight, visibility: "visible" },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(panel);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [surfaceRef, triggerRef, width]);
  useLayoutEffect(() => {
    if (position.visibility !== "visible" || focused.current) return;
    focused.current = true;
    const panel = surfaceRef.current;
    (
      panel?.querySelector<HTMLElement>(
        ".deadline-day.selected, .deadline-day.today",
      ) ?? panel?.querySelector<HTMLElement>("button")
    )?.focus({ preventScroll: true });
  }, [position.visibility, surfaceRef]);
  function close() {
    onClose();
    triggerRef.current?.focus({ preventScroll: true });
  }
  return createPortal(
    <div
      id={id}
      ref={surfaceRef}
      className="period-popover deadline-popover viewport-calendar"
      style={position}
      role="dialog"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key === "Tab") {
          const items = Array.from(
            surfaceRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
            ) ?? [],
          );
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus({ preventScroll: true });
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus({ preventScroll: true });
          }
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
