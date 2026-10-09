import { useState } from "react";
import { api, desktop } from "../api/tauri";
import type { UserSettings } from "../types";
import { identityError, roleApplications } from "../data/profile";
import { AvatarPicker, IdentityFields } from "./ProfileFields";
import { EmailUpdates } from "./ContactSettings";

export function ProfileSettings({
  settings,
  onChanged,
}: {
  settings: UserSettings;
  onChanged: () => Promise<void>;
}) {
  const [profile, setProfile] = useState(settings.profile);
  const [autostart, setAutostart] = useState(settings.autostart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save() {
    const issue = identityError(profile);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.saveUserProfile(profile, autostart);
      await onChanged();
      setMessage("Profile and companion settings saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !desktop;
  return (
    <details open className="card profile-settings">
      <summary>Profile, companion and startup</summary>
      <label className="toggle-row">
        <span>
          Show companion
          <small>
            Hide the character completely, including the floating companion
            window.
          </small>
        </span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={profile.avatar.visible}
          onChange={(e) =>
            setProfile({
              ...profile,
              avatar: { ...profile.avatar, visible: e.target.checked },
            })
          }
        />
      </label>
      <AvatarPicker
        profile={profile}
        onChange={setProfile}
        disabled={disabled}
      />
      <IdentityFields
        profile={profile}
        onChange={setProfile}
        disabled={disabled}
      />
      <h3>Suggested work tools</h3>
      <p className="helper">
        {roleApplications(profile.role)
          .filter((app) => app.category === "work")
          .map((app) => app.name)
          .join(" · ")}
        {profile.role === "other" &&
          "No automatic app defaults for a custom role. Classify detected apps in Settings → Your apps."}
      </p>
      <p className="helper">
        Role defaults apply to new goals and update preset rules for the current
        goal. Your manual app classifications are kept. Adjust apps for the
        current goal in Settings → App categories. These suggestions do not mean
        an app is installed.
      </p>
      <label className="toggle-row">
        <span>
          Start Buddy when I sign in
          <small>
            Enabled by default for installed desktop builds. Development
            launches do not register for login startup.
          </small>
        </span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={autostart}
          onChange={(e) => setAutostart(e.target.checked)}
        />
      </label>
      <button disabled={disabled} onClick={() => void save()}>
        Save profile settings
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <EmailUpdates />
    </details>
  );
}
