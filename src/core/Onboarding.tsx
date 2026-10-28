import { MacPermissions } from "../components/MacPermissions";
import { useEffect, useRef, useState } from "react";
import { desktop } from "../api/tauri";
import { isMac } from "../api/platform";
import { invoke } from "@tauri-apps/api/core";
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
  const [tracking, setTracking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openingPermissions, setOpeningPermissions] = useState(false);
  const [error, setError] = useState("");
  const batch = useRef(crypto.randomUUID());
  const trackingSetupOpened = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    onDirty(
      JSON.stringify(profile) !== JSON.stringify(initial.profile) || !tracking,
    );
    return () => onDirty(false);
  }, [profile, tracking, initial.profile, onDirty]);
  async function openTrackingSetup() {
    await invoke<boolean>("request_accessibility_permission");
    if (isMac)
      await invoke<boolean>("screenshot_permission", { request: true });
    trackingSetupOpened.current = true;
  }
  async function chooseTracking(enabled: boolean) {
    setTracking(enabled);
    setError("");
    if (!enabled || !desktop) return;
    setOpeningPermissions(true);
    try {
      await openTrackingSetup();
    } catch (e) {
      setError(String(e));
    } finally {
      setOpeningPermissions(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      // The default choice still opens the native permission flow on Continue.
      // Selecting With tracking manually may already have opened it once.
      if (tracking && !trackingSetupOpened.current) {
        await openTrackingSetup();
      }
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
    <section
      className={`core-onboarding core-workspace${step === 2 ? " onboarding-choice" : ""}`}
    >
      <p className="eyebrow">WELCOME · {step + 1} OF 3</p>
      <h1 ref={heading} tabIndex={-1}>
        {
          [
            "What should sumi call you?",
            "Choose your sumi",
            "How would you like to start?",
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
        <fieldset disabled={busy || openingPermissions}>
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
              <p className="onboarding-intro">You can change this later.</p>
              <div
                className="onboarding-options"
                role="radiogroup"
                aria-label="Tracking choices"
              >
                <label className="onboarding-option" data-selected={tracking}>
                  <input
                    type="radio"
                    name="setup-tracking"
                    value="with"
                    checked={tracking}
                    aria-labelledby="setup-with-tracking"
                    aria-describedby="setup-with-tracking-note"
                    onChange={() => void chooseTracking(true)}
                  />
                  <span>
                    <span id="setup-with-tracking">With tracking</span>
                    <small id="setup-with-tracking-note">
                      Notice work, time spent, and finished steps.
                    </small>
                  </span>
                </label>
                <label className="onboarding-option" data-selected={!tracking}>
                  <input
                    type="radio"
                    name="setup-tracking"
                    value="without"
                    checked={!tracking}
                    aria-labelledby="setup-without-tracking"
                    aria-describedby="setup-without-tracking-note"
                    onChange={() => void chooseTracking(false)}
                  />
                  <span>
                    <span id="setup-without-tracking">Without tracking</span>
                    <small id="setup-without-tracking-note">
                      Check off steps yourself.
                    </small>
                  </span>
                </label>
              </div>
              {tracking && (
                <div
                  className="onboarding-tracking-setup"
                  aria-label="Tracking setup"
                >
                  {openingPermissions && (
                    <p className="helper" role="status">
                      Opening tracking setup…
                    </p>
                  )}
                  {isMac && <MacPermissions variant="onboarding" />}
                  <p className="helper">
                    AI can use text and screenshots, correct dictation, and
                    complete verified steps.
                  </p>
                </div>
              )}
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
              disabled={busy || openingPermissions}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            disabled={
              busy ||
              openingPermissions ||
              !profile.name.trim() ||
              (step === 2 && !desktop)
            }
          >
            {busy ? "Opening…" : "Continue"}
          </button>
        </div>
      </form>
    </section>
  );
}
