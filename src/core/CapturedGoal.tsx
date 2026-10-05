import { useState } from "react";
export function CapturedGoal({
  draft,
  disabled,
  resolve,
}: {
  draft: { id: string; text: string };
  disabled: boolean;
  resolve: (id: string, title: string | null) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(draft.text);
  return (
    <form
      className="captured-goal"
      onSubmit={(event) => {
        event.preventDefault();
        void resolve(draft.id, title);
      }}
    >
      <label>
        Review selected text
        <textarea
          autoFocus
          value={title}
          maxLength={4000}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {title.length > 500 && (
        <p className="helper">
          Shorten this to 500 characters before adding it as a goal.
        </p>
      )}
      <div className="goal-actions">
        <button disabled={disabled || !title.trim() || title.length > 500}>
          Add as goal
        </button>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => void resolve(draft.id, null)}
        >
          Discard draft
        </button>
      </div>
    </form>
  );
}
