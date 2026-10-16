import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check } from "lucide-react";
import type { GoalDetails } from "./types";
import { useDismissiblePopover } from "../components/useDismissiblePopover";

export type Priority = GoalDetails["priority"];
export const PRIORITIES: { value: Priority; label: string; key: string }[] = [
  { value: "urgent", label: "Urgent", key: "1" },
  { value: "high", label: "High", key: "2" },
  { value: "medium", label: "Medium", key: "3" },
  { value: "low", label: "Low", key: "4" },
  { value: null, label: "No priority", key: "0" },
];
/** Sort rank: urgent first, no priority last. */
export function priorityRank(priority: Priority | undefined): number {
  return PRIORITIES.findIndex((item) => item.value === (priority ?? null));
}
export function PriorityIcon({ priority }: { priority: Priority | undefined }) {
  if (priority === "urgent")
    return (
      <AlertTriangle size={14} className="priority-urgent" aria-hidden="true" />
    );
  const filled =
    priority === "high"
      ? 3
      : priority === "medium"
        ? 2
        : priority === "low"
          ? 1
          : 0;
  return (
    <span className="priority-bars" aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <i key={bar} className={bar <= filled ? "on" : ""} />
      ))}
    </span>
  );
}
export function PriorityPicker({
  priority,
  disabled,
  label,
  onChange,
}: {
  priority: Priority | undefined;
  disabled: boolean;
  label: string;
  onChange: (priority: Priority) => void;
}) {
  const { open, setOpen, rootRef, surfaceRef, triggerRef, id } =
    useDismissiblePopover();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !surfaceRef.current || !triggerRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const panel = surfaceRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(
          anchor.right - panel.width,
          window.innerWidth - panel.width - 8,
        ),
      ),
      top: anchor.bottom + 6,
    });
    surfaceRef.current
      .querySelector<HTMLButtonElement>("button[aria-checked='true']")
      ?.focus();
  }, [open, surfaceRef, triggerRef]);
  const current = PRIORITIES[priorityRank(priority)];
  return (
    <div className="priority-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="text-button priority-trigger"
        aria-label={`Priority for ${label}: ${current.label}`}
        title={current.label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className={`priority-tag ${priority ?? "none"}`}>
          {priority ? current.label : "—"}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={surfaceRef}
            id={id}
            style={position}
            className="goal-menu priority-menu"
            role="listbox"
            aria-label={`Priority for ${label}`}
            onKeyDown={(event) => {
              const match = PRIORITIES.find((item) => item.key === event.key);
              if (match) {
                event.preventDefault();
                setOpen(false);
                onChange(match.value);
              }
            }}
          >
            {PRIORITIES.map((item) => (
              <button
                key={item.label}
                type="button"
                role="option"
                aria-checked={(priority ?? null) === item.value}
                aria-selected={(priority ?? null) === item.value}
                onClick={() => {
                  setOpen(false);
                  onChange(item.value);
                }}
              >
                <PriorityIcon priority={item.value} />
                <span>{item.label}</span>
                {(priority ?? null) === item.value ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <kbd>{item.key}</kbd>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
