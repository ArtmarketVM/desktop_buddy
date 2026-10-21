import { expect, it } from "vitest";
import { describePrivacy } from "./Settings";
it("privacy copy describes optional screen disclosure honestly and separates paused tracking from chat", () => {
  const off = describePrivacy("{}", true, "Interview follow-up", false);
  expect(off).toContain("Screenshots are off");
  expect(off).toContain("permitted relevant memories");
  expect(off).not.toContain("never sends what is on your screen");
  expect(describePrivacy("{}", true, null, true)).toContain(
    "Optional active-window images may also be sent",
  );
  expect(describePrivacy("{}", false, null)).toContain(
    "explicitly requested chat and research",
  );
});
