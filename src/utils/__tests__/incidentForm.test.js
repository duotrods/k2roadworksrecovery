import { describe, it, expect } from "vitest";
import {
  formatDateToBritish,
  minutesBetween,
  calculateTimeDifferences,
} from "../incidentForm";

describe("formatDateToBritish", () => {
  it("formats as DD/MM/YYYY with zero padding", () => {
    expect(formatDateToBritish(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formatDateToBritish(new Date(2026, 11, 25))).toBe("25/12/2026");
  });
});

describe("minutesBetween", () => {
  it("returns the minute difference within the same day", () => {
    expect(minutesBetween("10:00", "10:30")).toBe(30);
    expect(minutesBetween("09:15", "11:00")).toBe(105);
  });

  it("wraps past midnight", () => {
    expect(minutesBetween("23:30", "00:15")).toBe(45);
  });

  it("returns null when a time is missing", () => {
    expect(minutesBetween("", "10:00")).toBeNull();
    expect(minutesBetween("10:00", null)).toBeNull();
  });
});

describe("calculateTimeDifferences", () => {
  it("derives both duration fields", () => {
    const result = calculateTimeDifferences({
      time: "10:00",
      timeOfArrival: "10:20",
      timeCompleted: "11:00",
    });
    expect(result.timeSpottedToOn).toBe("20 mins");
    expect(result.timeOnsiteToCleared).toBe("40 mins");
  });

  it("leaves duration fields unset when inputs are incomplete", () => {
    const result = calculateTimeDifferences({ time: "10:00" });
    expect(result.timeSpottedToOn).toBeUndefined();
    expect(result.timeOnsiteToCleared).toBeUndefined();
  });

  it("preserves the original data", () => {
    const result = calculateTimeDifferences({ scheme: "M3", time: "10:00", timeOfArrival: "10:05" });
    expect(result.scheme).toBe("M3");
    expect(result.timeSpottedToOn).toBe("5 mins");
  });
});
