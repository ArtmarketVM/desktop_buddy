import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import type { AvatarPreferences, AvatarState } from "../types";

export interface ToastRequest {
  message: string;
  key?: string;
  proactive?: boolean;
  durationMs?: number;
  actions?: Array<{
    label: string;
    primary?: boolean;
    run: () => Promise<unknown>;
  }>;
  mascot?: { appearance: AvatarPreferences; state: AvatarState };
  undoLabel?: string;
  undo?: () => Promise<unknown>;
}
/** Shows a short message at the bottom of the workspace: `window.dispatchEvent(new CustomEvent("buddy:toast", { detail }))`. */
export function toast(detail: ToastRequest) {
  window.dispatchEvent(new CustomEvent("buddy:toast", { detail }));
}
export function Toasts({ quietMode = false }: { quietMode?: boolean }) {
  const [items, setItems] = useState<(ToastRequest & { id: number })[]>([]);
  useEffect(() => {
    if (quietMode)
      setItems((previous) => previous.filter((item) => !item.proactive));
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastRequest>).detail;
      if (quietMode && detail.proactive) return;
      const id = Date.now() + Math.random();
      setItems((previous) => [
        ...previous
          .filter((item) => !detail.key || item.key !== detail.key)
          .slice(-2),
        { ...detail, id },
      ]);
      window.setTimeout(
        () => setItems((previous) => previous.filter((item) => item.id !== id)),
        detail.durationMs ?? 8000,
      );
    };
    window.addEventListener("buddy:toast", onToast);
    return () => window.removeEventListener("buddy:toast", onToast);
  }, [quietMode]);
  // Cmd+Z (Ctrl+Z elsewhere) undoes the newest undoable toast while it is still showing,
  // unless the user is typing in a field, where the field's own undo applies.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey)
        return;
      if (event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          /^(input|textarea|select)$/i.test(target.tagName))
      )
        return;
      const latest = [...items].reverse().find((item) => item.undo);
      if (!latest) return;
      event.preventDefault();
      setItems((previous) => previous.filter((t) => t.id !== latest.id));
      void latest.undo?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items]);
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items
        .filter((item) => !quietMode || !item.proactive)
        .map((item) => (
          <div className="toast" key={item.id}>
            {item.mascot && (
              <Avatar
                appearance={item.mascot.appearance}
                state={item.mascot.state}
              />
            )}
            <span>{item.message}</span>
            {item.actions?.map((action) => (
              <button
                type="button"
                key={action.label}
                className={action.primary ? "toast-primary" : "text-button"}
                onClick={() => {
                  setItems((previous) =>
                    previous.filter((t) => t.id !== item.id),
                  );
                  void action.run().catch(() =>
                    toast({
                      message:
                        "Couldn't confirm that choice. Check your current focus before trying again.",
                    }),
                  );
                }}
              >
                {action.label}
              </button>
            ))}
            {item.undo && (
              <button
                type="button"
                onClick={() => {
                  setItems((previous) =>
                    previous.filter((t) => t.id !== item.id),
                  );
                  void item.undo?.();
                }}
              >
                {item.undoLabel ?? "Undo"}
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
