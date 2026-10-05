import { useEffect, useRef, useState } from "react";
export function QuickGoal({
  disabled,
  save,
  onDirty,
}: {
  disabled: boolean;
  save: (title: string, batch: string) => Promise<boolean>;
  onDirty?: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const batch = useRef(crypto.randomUUID());
  useEffect(() => {
    onDirty?.(!!title.trim());
  }, [title, onDirty]);
  return (
    <form
      className="quick-goal"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim())
          void save(title, batch.current).then((ok) => {
            if (ok) {
              setTitle("");
              batch.current = crypto.randomUUID();
            }
          });
      }}
    >
      <input
        aria-label="New goal"
        placeholder="What do you want to get done?"
        maxLength={500}
        value={title}
        disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button disabled={disabled || !title.trim()}>Add goal</button>
    </form>
  );
}
