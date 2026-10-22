import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const EMPTY = "__:__";
const POSITIONS = [0, 1, 3, 4];
const ERROR = "Enter hours from 00 to 23 and minutes from 00 to 59.";
const pad = (n: number) => String(n).padStart(2, "0");

/** Accept compact digits and existing clipboard formats; always display HH:MM. */
export function parseClockTime(text: string): [number, number] | null {
  const compact = text.trim();
  if (/^\d{3,4}$/.test(compact)) {
    const digits = compact.padStart(4, "0");
    return parseClockTime(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  }
  const match = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const suffix = match[3]?.toLowerCase();
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (suffix.startsWith("p") ? 12 : 0);
  }
  return hours <= 23 && minutes <= 59 ? [hours, minutes] : null;
}
function mask(text: string): string {
  const parsed = parseClockTime(text);
  if (parsed) return `${pad(parsed[0])}:${pad(parsed[1])}`;
  const digits = text.replace(/\D/g, "").slice(0, 4).padEnd(4, "_");
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
function complete(text: string): string | null {
  const hours = text.slice(0, 2).replace(/_/g, "");
  const minutes = text.slice(3).replace(/_/g, "");
  if (!hours) return null;
  const parsed = parseClockTime(
    `${hours}:${(minutes || "0").padStart(2, "0")}`,
  );
  // Three compact digits such as 930 can also be entered without a leading zero.
  const digits = text.replace(/\D/g, "");
  const time =
    parsed ||
    (digits.length === 3 && Number(hours) > 23 ? parseClockTime(digits) : null);
  return time ? `${pad(time[0])}:${pad(time[1])}` : null;
}

/** The separator is fixed: editing, deleting and pasting only replace digit slots. */
export function TimeInput({
  value,
  onCommit,
  allowEmpty = false,
  disabled,
  ...label
}: {
  value: string;
  onCommit: (value: string) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({
    text: mask(value),
    caret: null as number | null,
  });
  const [invalid, setInvalid] = useState(false);
  const submitted = useRef<string | null>(null);
  const cancelled = useRef(false);
  const history = useRef({ back: [] as string[], forward: [] as string[] });
  const errorId = useId();
  useEffect(() => {
    setDraft({ text: mask(value), caret: null });
    setInvalid(false);
    submitted.current = null;
    history.current = { back: [], forward: [] };
  }, [value]);
  useLayoutEffect(() => {
    if (draft.caret !== null)
      input.current?.setSelectionRange(draft.caret, draft.caret);
  }, [draft]);
  useEffect(() => {
    input.current?.setCustomValidity(invalid ? ERROR : "");
  }, [invalid]);
  function edit(text: string, caret: number | null) {
    cancelled.current = false;
    if (text !== draft.text) {
      history.current.back = [...history.current.back.slice(-19), draft.text];
      history.current.forward = [];
    }
    submitted.current = null;
    setInvalid(false);
    setDraft({ text, caret });
  }
  function commit() {
    const next = draft.text === EMPTY && allowEmpty ? "" : complete(draft.text);
    if (next === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft({ text: mask(next), caret: null });
    if (next !== value && submitted.current !== next) {
      submitted.current = next;
      onCommit(next);
    }
  }
  function replace(key: string, backwards = false) {
    const start = input.current?.selectionStart ?? 0;
    const end = input.current?.selectionEnd ?? start;
    const chars = draft.text.split("");
    for (const p of POSITIONS) if (p >= start && p < end) chars[p] = "_";
    const slot = key
      ? POSITIONS.find((p) => p >= start)
      : end > start
        ? start
        : backwards
          ? [...POSITIONS].reverse().find((p) => p < start)
          : POSITIONS.find((p) => p >= start);
    if (slot === undefined) return;
    if (POSITIONS.includes(slot)) chars[slot] = key || "_";
    const caret = key ? (POSITIONS.find((p) => p > slot) ?? 5) : slot;
    edit(chars.join(""), caret);
  }
  return (
    <span className="clock-input">
      <input
        {...label}
        ref={input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        className="clock-input-field"
        value={draft.text}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onFocus={(event) => {
          submitted.current = null;
          event.currentTarget.select();
        }}
        onChange={(event) => edit(mask(event.target.value), null)}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          commit();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.altKey) return;
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase();
            if (key === "z" || (event.ctrlKey && key === "y")) {
              event.preventDefault();
              const redo = event.shiftKey || key === "y";
              const from = redo
                ? history.current.forward
                : history.current.back;
              const to = redo ? history.current.back : history.current.forward;
              const text = from.pop();
              if (text !== undefined) {
                to.push(draft.text);
                submitted.current = null;
                setInvalid(false);
                setDraft({ text, caret: 5 });
              }
            }
            return;
          }
          if (/^\d$/.test(event.key)) {
            event.preventDefault();
            replace(event.key);
          } else if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault();
            replace("", event.key === "Backspace");
          } else if (event.key === ":" || event.key === ".") {
            event.preventDefault();
            input.current?.setSelectionRange(3, 3);
          } else if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            edit(mask(value), null);
            cancelled.current = true;
          } else if (event.key.length === 1) event.preventDefault();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text").trim();
          const start = input.current?.selectionStart ?? 0;
          const end = input.current?.selectionEnd ?? start;
          if (/^\d{1,2}$/.test(text) && start >= 3) {
            edit(`${draft.text.slice(0, 3)}${text.padStart(2, "0")}`, 5);
            return;
          }
          if (/^\d{1,2}$/.test(text) && end <= 2) {
            edit(`${text.padStart(2, "0")}${draft.text.slice(2)}`, 3);
            return;
          }
          if (!parseClockTime(text)) {
            setInvalid(true);
            return;
          }
          edit(mask(text), 5);
        }}
        onCut={(event) => {
          event.preventDefault();
          const start = input.current?.selectionStart ?? 0;
          const end = input.current?.selectionEnd ?? start;
          event.clipboardData.setData(
            "text/plain",
            draft.text.slice(start, end),
          );
          if (start !== end) replace("");
        }}
      />
      {invalid && (
        <small id={errorId} className="error clock-input-error" role="alert">
          {ERROR}
        </small>
      )}
    </span>
  );
}
