import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultUserSettings, type UserProfile } from "../types";
import { Avatar } from "./Avatar";

const profile: UserProfile = {
  ...defaultUserSettings.profile,
  name: "Sam",
  email: "sam@example.com",
  role: "designer",
  privacy_accepted: true,
};
describe("onboarding and profiles", () => {
  it("draws every character and hides it when requested", () => {
    for (const character of ["cat", "dog", "seal", "bird"] as const)
      expect(
        renderToStaticMarkup(
          <Avatar appearance={{ ...profile.avatar, character }} state="fun" />,
        ),
      ).toContain("sumi companion, fun");
    expect(
      renderToStaticMarkup(
        <Avatar appearance={{ ...profile.avatar, visible: false }} />,
      ),
    ).toBe("");
  });
});
