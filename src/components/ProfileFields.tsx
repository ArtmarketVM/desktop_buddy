import type { UserProfile, Character } from "../types";
import { roles } from "../data/profile";
import { Avatar } from "./Avatar";

export function AvatarPicker({
  profile,
  onChange,
  disabled = false,
}: {
  profile: UserProfile;
  onChange: (profile: UserProfile) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Choose your companion</legend>
      <div className="avatar-options">
        {(["cat", "dog", "seal", "bird"] as Character[]).map((character) => (
          <button
            type="button"
            className="avatar-option"
            aria-pressed={profile.avatar.character === character}
            key={character}
            onClick={() =>
              onChange({ ...profile, avatar: { ...profile.avatar, character } })
            }
          >
            <Avatar
              appearance={{ ...profile.avatar, visible: true, character }}
              state="fun"
            />
            <span>{character[0].toUpperCase() + character.slice(1)}</span>
          </button>
        ))}
      </div>
      <label htmlFor="avatar-color">Companion color</label>
      <input
        id="avatar-color"
        type="color"
        value={profile.avatar.color}
        onChange={(e) =>
          onChange({
            ...profile,
            avatar: { ...profile.avatar, color: e.target.value },
          })
        }
      />
    </fieldset>
  );
}
export function PrivacyNotice() {
  return (
    <details id="profile-privacy-notice" className="inline-details">
      <summary>Privacy notice — draft</summary>
      <p>
        This is a product placeholder. Replace it with the final reviewed
        Privacy Policy before a public release.
      </p>
      <p>
        Your name, email, role and choices are stored in the local app database.
        There is no remote registration service connected. Activity tracking and
        AI sharing have separate controls. Your email is not added to AI
        requests.
      </p>
    </details>
  );
}
export function IdentityFields({
  profile,
  onChange,
  disabled = false,
}: {
  profile: UserProfile;
  onChange: (profile: UserProfile) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Your profile</legend>
      <label htmlFor="profile-role">Role</label>
      <select
        id="profile-role"
        required
        value={profile.role}
        onChange={(e) => onChange({ ...profile, role: e.target.value })}
      >
        <option value="">Choose a role</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <label htmlFor="profile-name">Name</label>
      <input
        id="profile-name"
        autoComplete="name"
        required
        maxLength={120}
        value={profile.name}
        onChange={(e) => onChange({ ...profile, name: e.target.value })}
      />
      <label htmlFor="profile-email">Email</label>
      <input
        id="profile-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={profile.email}
        onChange={(e) => onChange({ ...profile, email: e.target.value })}
      />
      <PrivacyNotice />
      <label className="privacy-ack">
        <input
          type="checkbox"
          required
          checked={profile.privacy_accepted}
          onChange={(e) =>
            onChange({ ...profile, privacy_accepted: e.target.checked })
          }
        />
        I have read the draft privacy notice and agree to save my name and email
        locally.
      </label>
    </fieldset>
  );
}
