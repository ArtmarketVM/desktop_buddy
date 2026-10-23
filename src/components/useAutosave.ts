import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "pending" | "saving" | "saved" | "error";

/** Serialize writes and keep newer edits authoritative while an older save is in flight. */
export function useAutosave<T>(
  initial: T,
  persist: (value: T) => Promise<unknown>,
  refresh: () => Promise<unknown>,
  validate: (value: T) => string | null = () => null,
) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const state = useRef({
    desired: initial,
    committed: initial,
    running: false,
    mounted: true,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });
  const latest = useRef({ persist, refresh, validate });
  latest.current = { persist, refresh, validate };
  const key = JSON.stringify(initial);
  useEffect(() => {
    const current = state.current;
    if (
      current.running ||
      JSON.stringify(current.desired) !== JSON.stringify(current.committed)
    )
      return;
    const next = JSON.parse(key) as T;
    current.desired = next;
    current.committed = next;
    setValue(next);
  }, [key]);
  const flush = useCallback(async () => {
    const current = state.current;
    clearTimeout(current.timer);
    if (current.running) return;
    if (JSON.stringify(current.desired) === JSON.stringify(current.committed)) {
      if (current.mounted) {
        setStatus("saved");
        setError("");
      }
      return;
    }
    current.running = true;
    if (current.mounted) {
      setStatus("saving");
      setError("");
    }
    try {
      while (
        JSON.stringify(current.desired) !== JSON.stringify(current.committed)
      ) {
        const next = current.desired;
        const invalid = latest.current.validate(next);
        if (invalid) throw new Error(invalid);
        await latest.current.persist(next);
        current.committed = next;
      }
      if (current.mounted) setStatus("saved");
      // Persistence already succeeded. A stale read must never roll back the saved edit.
      void latest.current.refresh().catch(() => undefined);
    } catch (cause) {
      if (current.mounted) {
        setStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save changes. Try again.",
        );
      }
    } finally {
      current.running = false;
    }
  }, []);
  const update = useCallback(
    (next: T, delay = 0) => {
      state.current.desired = next;
      setValue(next);
      setError("");
      setStatus("pending");
      clearTimeout(state.current.timer);
      if (delay) state.current.timer = setTimeout(() => void flush(), delay);
      else void flush();
    },
    [flush],
  );
  useEffect(() => {
    const current = state.current;
    current.mounted = true;
    return () => {
      clearTimeout(current.timer);
      current.mounted = false;
      void flush();
    };
  }, [flush]);
  return {
    value,
    update,
    flush,
    status,
    error,
    pending: status === "pending" || status === "saving" || status === "error",
  };
}
