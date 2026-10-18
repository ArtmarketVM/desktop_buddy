import { useEffect, useState } from "react";

export interface ToastRequest {
  message: string;
  undoLabel?: string;
  undo?: () => Promise<unknown>;
}
/** Shows a short message at the bottom of the workspace: `window.dispatchEvent(new CustomEvent("buddy:toast", { detail }))`. */
export function toast(detail: ToastRequest) {
  window.dispatchEvent(new CustomEvent("buddy:toast", { detail }));
}
export function Toasts() {
  const [items, setItems] = useState<(ToastRequest & { id: number })[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastRequest>).detail;
      const id = Date.now() + Math.random();
      setItems((previous) => [...previous.slice(-2), { ...detail, id }]);
      window.setTimeout(
        () => setItems((previous) => previous.filter((item) => item.id !== id)),
        8000,
      );
    };
    window.addEventListener("buddy:toast", onToast);
    return () => window.removeEventListener("buddy:toast", onToast);
  }, []);
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
      {items.map((item) => (
        <div className="toast" key={item.id}>
          <span>{item.message}</span>
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
