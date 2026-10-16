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
