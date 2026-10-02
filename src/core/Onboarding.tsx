import { useEffect, useState } from "react";
import { desktop } from "../api/tauri";
import type { UserSettings } from "../types";
import { Composer } from "./Composer";
import { coreApi } from "./api";
import type { GoalDraft } from "./types";

export function CoreOnboarding({
  initial,
  onChanged,
  onDirty,
}: {
  initial: UserSettings;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.name);
  const [intent, setIntent] = useState("A little more focus");
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [batch] = useState(() => crypto.randomUUID());
  const [composerDirty, setComposerDirty] = useState(false);
  useEffect(() => {
    onDirty(!!name.trim() || drafts.length > 0 || composerDirty);
    return () => onDirty(false);
  }, [name, drafts, composerDirty, onDirty]);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await coreApi.setup(name, drafts, tracking, batch);
      onDirty(false);
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="core-onboarding core-workspace">
      <p className="eyebrow">A SMALL START · {step + 1} OF 4</p>
      <h1>
        {
          [
            "What should Buddy call you?",
            "What would you like a little help with?",
            "Make room for your first goals",
            "Your pace, your choice",
          ][step]
        }
      </h1>
      {step === 0 && (
        <>
          <p>Just your name is enough to get started.</p>
          <label>
            Your name
            <input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                onDirty(true);
              }}
            />
          </label>
        </>
      )}
      {step === 1 && (
        <>
          <p>
            Choose what feels useful today. You can always change your mind.
          </p>
          <div className="intent-options">
            {[
              "A little more focus",
              "Keeping several projects moving",
              "A calmer daily plan",
            ].map((option) => (
              <button
                className={`outline-button ${intent === option ? "selected" : ""}`}
                aria-pressed={intent === option}
                key={option}
                onClick={() => setIntent(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p>
            {intent}. Type a goal, record a thought, or bring in some notes.
          </p>
          <Composer
            disabled={busy}
            onDirty={setComposerDirty}
            onSave={async (items) => {
              if (drafts.length + items.length > 20)
                throw new Error(
                  "Keep up to 20 first goals. Remove a goal before adding more.",
                );
              setDrafts((previous) => [...previous, ...items]);
              onDirty(true);
            }}
          />
          {drafts.length > 0 && (
            <div className="setup-goals">
              <h2>Your first goals</h2>
              {drafts.map((draft, index) => (
                <p key={index}>
                  {draft.title}
                  <button
                    className="text-button"
                    aria-label={`Remove ${draft.title}`}
                    onClick={() =>
                      setDrafts(drafts.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {step === 3 && (
        <>
          <p>Your goals and focus timer work without screen tracking.</p>
          <label className="toggle-row">
            <span>
              Allow activity tracking
              <small>
                Optional: observe the active app and window title for the
                selected goal. You can pause this in Settings.
              </small>
            </span>
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => setTracking(e.target.checked)}
            />
          </label>
          <p className="helper">
            Tracking stays off unless you choose it. Buddy keeps goals on this
            PC. AI requests share only the content you explicitly confirm.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-actions">
        {step > 0 && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            disabled={
              busy ||
              (step === 0 && !name.trim()) ||
              (step === 2 && composerDirty)
            }
            onClick={() => setStep(step + 1)}
          >
            {step === 2 && !drafts.length ? "Add goals later" : "Continue"}
          </button>
        ) : (
          <button disabled={busy || !desktop} onClick={() => void finish()}>
            {busy ? "Opening…" : "Open my workspace"}
          </button>
        )}
      </div>
    </section>
  );
}
