import { MacPermissions } from "../components/MacPermissions";
import { useEffect, useRef, useState } from "react";
import { desktop } from "../api/tauri";
import { isMac } from "../api/platform";
import { invoke } from "@tauri-apps/api/core";
import { ProviderKey } from "../components/Settings";
import type { UserSettings } from "../types";
import { AvatarPicker } from "../components/ProfileFields";
import { coreApi } from "./api";

export function CoreOnboarding({
  initial,
  onChanged,
  onDirty,
  onComplete,
  nebiusConfigured = false,
}: {
  initial: UserSettings;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onComplete?: () => void;
  nebiusConfigured?: boolean;
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
      if (tracking && isMac)
        await invoke<boolean>("request_accessibility_permission");
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
            "Let Buddy help you follow through",
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
              <label className="toggle-row">
                <span>
                  Track goals and suggest completed work
                  <small>
                    Record active apps, titles and work time locally. Let Nebius
                    check up to 3,000 characters of visible text with your goal
                    and steps for completed work. Password and edit controls are
                    skipped. You confirm every completion.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={tracking}
                  onChange={(e) => setTracking(e.target.checked)}
                />
              </label>
              {tracking && (
                <>
                  <MacPermissions />
                  <p className="helper">
                    {nebiusConfigured
                      ? "Nebius key is configured."
                      : "Connect Nebius to start automatic progress checks."}
                  </p>
                  <ProviderKey
                    provider="nebius"
                    label="Nebius API key"
                    onChanged={onChanged}
                  />
                </>
              )}
              <p className="helper">
                This switch enables local tracking and AI progress checks. macOS
                asks for Accessibility access. Connect your own Nebius key here
                or later in Settings; provider charges may apply. Activity
                history is stored on this computer. You can pause everything in
                Settings.
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
