import { MacPermissions } from "../components/MacPermissions";
import { useEffect, useRef, useState } from "react";
import { desktop } from "../api/tauri";
import type { UserSettings } from "../types";
import { AvatarPicker } from "../components/ProfileFields";
import { coreApi } from "./api";

export function CoreOnboarding({
  initial,
  onChanged,
  onDirty,
  onComplete,
}: {
  initial: UserSettings;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(initial.profile);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const batch = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    onDirty(
      JSON.stringify(profile) !== JSON.stringify(initial.profile) || tracking,
    );
    return () => onDirty(false);
  }, [profile, tracking, initial.profile, onDirty]);
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await coreApi.setup(
        profile.name,
        [],
        tracking,
        batch.current,
        profile.email,
        profile.avatar,
      );
      onDirty(false);
      await onChanged();
      onComplete?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="core-onboarding core-workspace">
      <p className="eyebrow">WELCOME · {step + 1} OF 3</p>
      <h1 ref={heading} tabIndex={-1}>
        {
          [
            "What should Buddy call you?",
            "Choose your Buddy",
            "Activity tracking is your choice",
          ][step]
        }
      </h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 2) setStep(step + 1);
          else void finish();
        }}
      >
        <fieldset disabled={busy}>
          {step === 0 && (
            <>
              <p>Just your preferred name is enough to get started.</p>
              <label>
                Your name
                <input
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </label>
              <label>
                Email (optional)
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({ ...profile, email: e.target.value })
                  }
                  aria-describedby="setup-email-note"
                />
              </label>
              <p id="setup-email-note" className="helper">
                Saved in your local profile for future email features. Email
                reports are not available yet. Adding an email does not
                subscribe you or send it to AI.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                A quiet companion for your day. You can change your choice in
                Settings.
              </p>
              <AvatarPicker
                profile={profile}
                onChange={setProfile}
                disabled={busy}
              />
            </>
          )}
          {step === 2 && (
            <>
              <p>
                Goals and chat work without activity tracking or a running
                timer.
              </p>
              <MacPermissions />
              <label className="toggle-row">
                <span>
                  Allow activity tracking
                  <small>
                    Observe foreground apps, window or browser titles and active
                    time. With a separate AI opt-in, Nebius can identify the
                    goal you are working on. Pause tracking in Settings at any
                    time.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={tracking}
                  onChange={(e) => setTracking(e.target.checked)}
                />
              </label>
              <p className="helper">
                Tracking stays off unless you choose it. Activity history is
                stored on this computer and is not encrypted. AI sharing has
                separate controls in Integrations / AI; optional AI check-ins
                can share goal and activity context with configured providers.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="settings-actions">
          {step > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            disabled={busy || !profile.name.trim() || (step === 2 && !desktop)}
          >
            {busy ? "Opening…" : step === 2 ? "Open my workspace" : "Continue"}
          </button>
        </div>
      </form>
    </section>
  );
}
