import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import type { UserSettings, OnboardingState } from "../types";
import { identityError } from "../data/profile";
import { AvatarPicker, IdentityFields } from "./ProfileFields";
import { Avatar } from "./Avatar";

export function Onboarding({
  initial,
  onChanged,
}: {
  initial: UserSettings;
  onChanged: () => Promise<void>;
}) {
  const [profile, setProfile] = useState(initial.profile);
  const [draft, setDraft] = useState(initial.onboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktop && initial.onboarding.step !== draft.step)
      setDraft(initial.onboarding);
  }, [initial.onboarding.step]);
  async function save(next: OnboardingState) {
    if (desktop) {
      const saved = await api.saveOnboarding(profile, next);
      setProfile(saved.profile);
      setDraft(saved.onboarding);
    } else setDraft(next);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    if (draft.step === 1) {
      const error = identityError(profile);
      if (error) {
        setError(error);
        return;
      }
    }
    await run(async () => {
      if (draft.step < 2) await save({ ...draft, step: draft.step + 1 });
      else {
        await api.onboardingGoal(draft.goal_text);
        setDraft({ ...draft, step: 3 });
      }
    });
  }
  return (
    <main className="onboarding-shell">
      <section className="card onboarding-card" aria-label="Welcome to Buddy">
        <div className="onboarding-brand">
          buddy<span>•</span>
        </div>
        {!desktop && (
          <p className="notice">
            Browser preview — choices here are not saved. Open the desktop app
            to create your goal.
          </p>
        )}
        {draft.step < 3 && (
          <ol className="onboarding-progress" aria-label="Setup progress">
            {["Companion", "Profile", "Goal"].map((name, index) => (
              <li
                key={name}
                aria-current={draft.step === index ? "step" : undefined}
              >
                {index + 1}. {name}
              </li>
            ))}
          </ol>
        )}
        <h1>
          {
            [
              "A little company for your work.",
              "Make Buddy yours.",
              "What would you like to achieve?",
              "Choose when tracking starts.",
            ][draft.step]
          }
        </h1>
        {draft.step === 0 && (
          <>
            <p>
              Choose a character and color. You can change or hide your
              companion in Settings.
            </p>
            <AvatarPicker
              profile={profile}
              onChange={setProfile}
              disabled={busy}
            />
          </>
        )}
        {draft.step === 1 && (
          <>
            <p>
              Your role supplies a starter set of app categories. You can adjust
              individual apps later in Settings.
            </p>
            <IdentityFields
              profile={profile}
              onChange={setProfile}
              disabled={busy}
            />
          </>
        )}
        {draft.step === 2 && (
          <>
            <label htmlFor="first-goal">Your main goal</label>
            <textarea
              id="first-goal"
              required
              maxLength={500}
              value={draft.goal_text}
              disabled={busy}
              placeholder="For example, prepare a clear product demo"
              onChange={(e) =>
                setDraft({ ...draft, goal_text: e.target.value })
              }
            />
            <button
              className="secondary"
              disabled={busy || !desktop}
              onClick={() => void run(() => save(draft))}
            >
              Save goal draft
            </button>
            <p className="helper">
              Your goal uses Buddy's existing goal planner. You can refine it
              with AI or add steps after setup. Creating it does not start
              monitoring.
            </p>
          </>
        )}
        {draft.step === 3 && (
          <>
            <Avatar appearance={profile.avatar} state="paused" />
            <p>
              Activity tracking observes the foreground application, window/tab
              title, available browser domain and time since the last keyboard
              or mouse input. It does not capture page content, screenshots or
              what you type.
            </p>
            <p>
              These Windows APIs do not need a separate system permission
              dialog. Enable monitoring below when you are ready, or continue
              with tracking paused. AI check-ins and proactive search stay off
              until separately enabled.
            </p>
            <div className="settings-actions">
              <button
                disabled={busy || !desktop}
                onClick={() => void run(() => api.finishOnboarding(true))}
              >
                Enable activity tracking
              </button>
              <button
                className="secondary"
                disabled={busy || !desktop}
                onClick={() => void run(() => api.finishOnboarding(false))}
              >
                Continue without tracking
              </button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {draft.step < 3 && (
          <div className="onboarding-actions">
            {draft.step > 0 && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(() => save({ ...draft, step: draft.step - 1 }))
                }
              >
                Back
              </button>
            )}
            <button
              disabled={
                busy ||
                (draft.step === 2 && (!desktop || !draft.goal_text.trim()))
              }
              onClick={() => void next()}
            >
              {busy ? "Saving…" : draft.step === 2 ? "Create goal" : "Continue"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
