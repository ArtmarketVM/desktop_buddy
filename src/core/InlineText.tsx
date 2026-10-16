import { useEffect, useRef, type KeyboardEvent } from "react";

/** Notion-style inline editing: the text is editable in place with a plain caret. Enter or blur
 *  saves, Escape restores, and emptying the text deletes the item. */
export function InlineText({
  value,
  display,
  label,
  className,
  disabled,
  onSave,
  onDelete,
}: {
  value: string;
  display?: string;
  label: string;
  className?: string;
  disabled?: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const editing = useRef(false);
  useEffect(() => {
    // React never rewrites the text while the user is typing in it.
    if (node.current && !editing.current)
      node.current.textContent = display ?? value;
  }, [value, display]);
  function commit(save: boolean) {
    const el = node.current;
    editing.current = false;
    if (!el) return;
    if (!save) {
      el.textContent = display ?? value;
      return;
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return onDelete();
    if (text !== (display ?? value).trim() && text !== value.trim())
      onSave(text);
    else el.textContent = display ?? value;
  }
  function key(event: KeyboardEvent<HTMLSpanElement>) {
    // Backspace or Delete on already-empty text removes the item at once, like a Notion block.
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !(node.current?.textContent ?? "").trim()
    ) {
      event.preventDefault();
      editing.current = false;
      onDelete();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      node.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      commit(false);
      node.current?.blur();
    }
  }
  return (
    <span
      ref={node}
      className={`inline-text ${className ?? ""}`}
      role="textbox"
      aria-label={label}
      aria-readonly={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      spellCheck={false}
      // Plain text only; the browser keeps the caret where the user clicked.
      contentEditable={disabled ? false : "plaintext-only"}
      suppressContentEditableWarning
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => commit(true)}
      onKeyDown={key}
    >
      {display ?? value}
    </span>
  );
}
