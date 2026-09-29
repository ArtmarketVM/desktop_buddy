import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
export function GoalInput({
  onStart,
  disabled,
}: {
  onStart: (text: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="goal-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim()) {
          if (await onStart(text.trim())) setText("");
        }
      }}
    >
      <label htmlFor="goal">What would you like to make progress on?</label>
      <div className="input-row">
        <input
          id="goal"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Finish the presentation draft"
        />
        <button disabled={disabled || !text.trim()} type="submit">
          Start focus <ArrowUpRight size={17} />
        </button>
      </div>
    </form>
  );
}
