import windowsConfig from "./rolePresets.json";
import macConfig from "./rolePresets.macos.json";
import { isMac } from "../api/platform";
const config = isMac ? macConfig : windowsConfig;
import type { AvatarState, BuddyView, UserProfile } from "../types";
export const roles = config.roles;
export const applications = config.applications;
export function roleApplications(id: string) {
  const role = roles.find((r) => r.id === id);
  return applications.filter((app) => role?.applications.includes(app.process));
}
export function identityError(profile: UserProfile): string | null {
  const parts = profile.email.trim().split("@");
  if (!profile.name.trim() || profile.name.trim().length > 120)
    return "Enter your name (up to 120 characters).";
  if (
    profile.email.trim().length > 254 ||
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1].includes(".") ||
    parts[1].startsWith(".") ||
    parts[1].endsWith(".") ||
    /\s/.test(profile.email)
  )
    return "Enter a valid email address.";
  if (!roles.some((r) => r.id === profile.role))
    return "Choose your professional role.";
  if (profile.role === "other" && !profile.custom_role?.trim())
    return "Tell us your role.";
  if (
    (profile.custom_role ?? "").length > 120 ||
    /[\x00-\x1f\x7f]/.test(profile.custom_role ?? "")
  )
    return "Use at most 120 characters for your role.";
  if (
    (profile.applications ?? []).length > 20 ||
    (profile.applications ?? []).some(
      (app) => !app.trim() || app.length > 80 || /[\x00-\x1f\x7f]/.test(app),
    )
  )
    return "List up to 20 apps, each with at most 80 characters.";
  if (!profile.privacy_accepted)
    return "Read and acknowledge the draft privacy notice before saving your profile.";
  return null;
}
export function avatarState(view: BuddyView): AvatarState {
  if (view.activity_event === "goal_completed") return "completed";
  if (view.activity_state === "drifting") return "sleeping";
  if (view.activity_state === "paused") return "paused";
  if (view.suggestion) return "fun";
  return "working";
}
