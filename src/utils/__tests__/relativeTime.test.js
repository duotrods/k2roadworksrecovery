import { describe, it, expect } from "vitest";
import { formatRelativeTime, liveJobStepLabel } from "../relativeTime";

const NOW = new Date("2026-08-10T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("formatRelativeTime", () => {
  it("returns '' for missing or invalid input", () => {
    expect(formatRelativeTime(null, NOW)).toBe("");
    expect(formatRelativeTime(undefined, NOW)).toBe("");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });

  it("says 'just now' under a minute (and for future times)", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(59 * SEC), NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW.getTime() + MIN), NOW)).toBe("just now");
  });

  it("counts minutes below an hour", () => {
    expect(formatRelativeTime(ago(MIN), NOW)).toBe("1 min ago");
    expect(formatRelativeTime(ago(42 * MIN), NOW)).toBe("42 min ago");
    expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe("59 min ago");
  });

  it("counts hours below a day", () => {
    expect(formatRelativeTime(ago(HR), NOW)).toBe("1h ago");
    expect(formatRelativeTime(ago(23 * HR), NOW)).toBe("23h ago");
  });

  it("counts days below a week", () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe("1d ago");
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe("6d ago");
  });

  it("falls back to a British date at a week or older", () => {
    expect(formatRelativeTime(ago(7 * DAY), NOW)).toBe(ago(7 * DAY).toLocaleDateString("en-GB"));
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatRelativeTime(ago(2 * HR).toISOString(), NOW)).toBe("2h ago");
  });
});

describe("liveJobStepLabel", () => {
  it("labels each valid step", () => {
    expect(liveJobStepLabel(1)).toBe("Step 1 of 4 · Start Job");
    expect(liveJobStepLabel(2)).toBe("Step 2 of 4 · On Scene");
    expect(liveJobStepLabel(3)).toBe("Step 3 of 4 · Drop-Off");
    expect(liveJobStepLabel(4)).toBe("Step 4 of 4 · Customer");
  });

  it("falls back to step 2 for missing or out-of-range values", () => {
    expect(liveJobStepLabel(undefined)).toBe("Step 2 of 4 · On Scene");
    expect(liveJobStepLabel(0)).toBe("Step 2 of 4 · On Scene");
    expect(liveJobStepLabel(9)).toBe("Step 2 of 4 · On Scene");
  });
});
