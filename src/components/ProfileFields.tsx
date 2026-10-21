import type { AvatarState, UserProfile } from "../types";
import { Avatar } from "./Avatar";

// Chips are filled with the colour itself; dark chips take white text.
const PRESETS = [
  { name: "Lime", value: "#E4FA8E", dark: false },
  { name: "Violet", value: "#6C5FFF", dark: true },
  { name: "Cloud", value: "#F3F3EF", dark: false },
];
const MOODS: [AvatarState, string][] = [
  ["working", "Working"],
  ["listening", "Listening"],
  ["thinking", "Thinking"],
  ["completed", "Done"],
  ["sleeping", "Resting"],
  ["stretching", "Stretching"],
];
const isCustom = (color: string) =>
  !PRESETS.some((preset) => preset.value === color);

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
    <fieldset disabled={disabled} className="sumi-picker">
      <legend>Your sumi</legend>
      <ul className="avatar-gallery" aria-label="How sumi looks">
        {MOODS.map(([state, label]) => (
          <li key={state}>
            <Avatar
              appearance={{ ...profile.avatar, visible: true }}
              state={state}
            />
            <small>{label}</small>
          </li>
        ))}
      </ul>
      <div className="color-options" role="group" aria-label="Companion color">
        {PRESETS.map((color) => (
          <button
            type="button"
            key={color.value}
            className={`color-chip ${color.dark ? "color-chip-dark" : ""}`}
            style={{ background: color.value }}
            aria-pressed={profile.avatar.color === color.value}
            onClick={() =>
              onChange({
                ...profile,
                avatar: { ...profile.avatar, color: color.value },
              })
            }
          >
            {color.name}
          </button>
        ))}
        <label
          className={`color-chip color-custom ${isCustom(profile.avatar.color) ? "selected" : ""}`}
          style={
            isCustom(profile.avatar.color)
              ? { background: profile.avatar.color }
              : undefined
          }
        >
          Custom
          <input
            type="color"
            aria-label="Custom companion color"
            value={profile.avatar.color}
            onChange={(e) =>
              onChange({
                ...profile,
                avatar: {
                  ...profile.avatar,
                  color: e.target.value.toUpperCase(),
                },
              })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
