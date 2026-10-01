import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultUserSettings, type UserProfile } from "../types";
import {
  identityError,
  roleApplications,
  roles,
  avatarState,
} from "../data/profile";
import { Onboarding } from "./Onboarding";
import { Avatar } from "./Avatar";
import { ProductFeedback } from "./ProductFeedback";
import { defaultBuddyPreferences } from "../types";

const profile: UserProfile = {
  ...defaultUserSettings.profile,
  name: "Sam",
  email: "sam@example.com",
  role: "designer",
  privacy_accepted: true,
};
describe("onboarding and profiles", () => {
  it("keeps a shared expandable role config with Figma in Design", () => {
    expect(roles).toHaveLength(8);
    expect(
      roleApplications("designer").find((a) => a.process === "figma.exe")
        ?.group,
    ).toBe("Design");
    expect(
      roleApplications("software_engineer").some(
        (a) => a.process === "code.exe",
      ),
    ).toBe(true);
    expect(roleApplications("unknown")).toEqual([]);
  });
  it("requires email, role, name and privacy acknowledgement", () => {
    expect(identityError(profile)).toBeNull();
    for (const email of ["", "a@b", "a@@b.com", "a@.com", "a b@c.com"])
      expect(identityError({ ...profile, email })).not.toBeNull();
    expect(identityError({ ...profile, privacy_accepted: false })).toContain(
      "privacy",
    );
    expect(identityError({ ...profile, role: "unknown" })).toContain("role");
  });
  it("orders avatar, identity, goal and then tracking choice without app editing", () => {
    const render = (step: number) =>
      renderToStaticMarkup(
        <Onboarding
          initial={{
            ...defaultUserSettings,
            profile,
            onboarding: { ...defaultUserSettings.onboarding, step },
          }}
          onChanged={async () => {}}
        />,
      );
    expect(render(0)).toContain("Choose your companion");
    expect(render(0)).not.toContain('id="profile-email"');
    expect(render(1)).toContain('id="profile-email"');
    expect(render(1)).toContain("Privacy notice — draft");
    expect(render(1)).not.toContain("Process name");
    expect(render(2)).toContain('id="first-goal"');
    expect(render(2)).not.toContain("Enable activity tracking");
    expect(render(3)).toContain("Continue without tracking");
    expect(render(3)).toContain(
      "do not need a separate system permission dialog",
    );
  });
  it("maps native events to avatar states and hides every character when requested", () => {
    const view = {
      preferences: defaultBuddyPreferences,
      suggestion: null,
      decision: null,
      snoozed_until: null,
      quiet_reason: null,
    };
    expect(avatarState({ ...view, activity_state: "drifting" })).toBe(
      "sleeping",
    );
    expect(avatarState({ ...view, activity_state: "paused" })).toBe("paused");
    expect(avatarState({ ...view, activity_event: "goal_completed" })).toBe(
      "completed",
    );
    for (const character of ["cat", "dog", "seal", "bird"] as const)
      expect(
        renderToStaticMarkup(
          <Avatar appearance={{ ...profile.avatar, character }} state="fun" />,
        ),
      ).toContain(`${character} companion, fun`);
    expect(
      renderToStaticMarkup(
        <Avatar appearance={{ ...profile.avatar, visible: false }} />,
      ),
    ).toBe("");
  });
  it("offers stars and optional text with an explicit local-storage disclosure", () => {
    const html = renderToStaticMarkup(<ProductFeedback goalId={7} />);
    expect(html).toContain("5 stars");
    expect(html).toContain("Anything to add? (optional)");
    expect(html).toContain("No feedback is uploaded");
  });
});
