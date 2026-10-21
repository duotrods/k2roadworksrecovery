import { describe, it, expect } from "vitest";
import { layoutPieLabels } from "../pieLabelLayout";

const sideYs = (layout, right) =>
  Object.values(layout.labels)
    .filter((l) => l.right === right)
    .map((l) => l.y)
    .sort((a, b) => a - b);

describe("layoutPieLabels", () => {
  it("labels every slice and keeps the pie inside the box", () => {
    const l = layoutPieLabels([75, 25], 600, 380);
    expect(Object.keys(l.labels)).toHaveLength(2);
    expect(l.cx).toBe(300);
    expect(l.radius * 2).toBeLessThanOrEqual(380);
  });

  it("never overlaps labels on the same side, even for tiny slices", () => {
    const l = layoutPieLabels([100, 1, 1, 1, 1, 1, 90], 500, 380);
    [true, false].forEach((right) => {
      const ys = sideYs(l, right);
      ys.forEach((y, i) => {
        if (i) expect(y - ys[i - 1]).toBeGreaterThanOrEqual(l.lineH - 0.01);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(380);
      });
    });
  });

  it("drops the smallest labels when a side has more slices than rows", () => {
    const values = Array.from({ length: 40 }, (_, i) => 40 - i);
    const l = layoutPieLabels(values, 500, 200);
    expect(Object.keys(l.labels).length).toBeLessThan(values.length);
  });
});
