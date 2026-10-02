import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { textGoals, wav, readAttachment } from "./media";
import { DaySummary } from "./Progress";
import { CoreOnboarding } from "./Onboarding";
import { defaultUserSettings } from "../types";

describe("core daily flow boundaries", () => {
  it("preserves each explicitly entered goal and rejects silent truncation", () => {
    expect(
      textGoals("- Ship release\n2. Read notes\n\n• Take a walk").map(
        (goal) => goal.title,
      ),
    ).toEqual(["Ship release", "Read notes", "Take a walk"]);
    expect(() => textGoals("x".repeat(501))).toThrow();
    expect(() => textGoals(Array(21).fill("Goal").join("\n"))).toThrow();
  });
  it("encodes bounded mono PCM with correct signed sample clipping", () => {
    const bytes = wav(new Float32Array([-2, 0, 2]), 16000);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint32(24, true)).toBe(16000);
    expect([44, 46, 48].map((offset) => view.getInt16(offset, true))).toEqual([
      -32768, 0, 32767,
    ]);
  });
  it("rejects oversized and unsupported attachments before reading them", async () => {
    const arrayBuffer = vi.fn();
    await expect(
      readAttachment({
        size: 15_000_001,
        type: "application/pdf",
        name: "large.pdf",
        arrayBuffer,
      } as unknown as File),
    ).rejects.toThrow("15 MB");
    await expect(
      readAttachment({
        size: 1,
        type: "image/svg+xml",
        name: "vector.svg",
        arrayBuffer,
      } as unknown as File),
    ).rejects.toThrow("Choose a PDF");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("shows completed intentions and goal time in a positive daily summary", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummary, {
        day: {
          day: "2026-10-02",
          completed: ["Ship release"],
          goals: [
            { goal_id: 1, title: "Ship release", area: "Work", seconds: 1800 },
          ],
        },
        unfinished: 1,
      }),
    );
    expect(html).toContain("Ship release");
    expect(html).toContain("Work · 30m");
    expect(html).toContain("tomorrow");
    expect(html).not.toContain("process_name");
  });
  it("starts onboarding with a name and no required role or email", () => {
    const html = renderToStaticMarkup(
      createElement(CoreOnboarding, {
        initial: defaultUserSettings,
        onChanged: async () => {},
        onDirty: () => {},
      }),
    );
    expect(html).toContain("Your name");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("professional role");
  });
});
