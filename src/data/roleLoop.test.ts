import { describe, expect, it } from "vitest";
import { loopIndex, loopScrollShift } from "./roleLoop";

describe("continuous role loop", () => {
  it("navigates repeatedly through both ends of all nine roles", () => {
    expect(loopIndex(-1, 9)).toBe(8);
    expect(loopIndex(9, 9)).toBe(0);
    for (let index = -90; index <= 90; index++) {
      expect(loopIndex(index + 9, 9)).toBe(loopIndex(index, 9));
      expect(loopIndex(index, 9)).toBeGreaterThanOrEqual(0);
      expect(loopIndex(index, 9)).toBeLessThan(9);
    }
  });
  it("rebases wheel and touch scrolling to an identical safe copy", () => {
    const width = 1998;
    for (const left of [width, width * 1.49, width * 3.5, width * 4]) {
      const shift = loopScrollShift(left, width);
      expect((left + shift) % width).toBeCloseTo(left % width);
      expect(left + shift).toBeGreaterThanOrEqual(width * 1.5);
      expect(left + shift).toBeLessThan(width * 3.5);
    }
    expect(loopScrollShift(width * 2, width)).toBe(0);
    expect(loopScrollShift(0, 0)).toBe(0);
  });
});
