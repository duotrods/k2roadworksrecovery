import { describe, it, expect } from "vitest";
import {
  countVehicles,
  isPureIncident,
  clearanceBucket,
  clearanceRateData,
} from "../incidentStats";

describe("countVehicles", () => {
  it("returns 0 when recoveryRequested is missing", () => {
    expect(countVehicles({})).toBe(0);
    expect(countVehicles({ recoveryRequested: null })).toBe(0);
    expect(countVehicles(undefined)).toBe(0);
  });

  it("returns 0 when recoveryRequested is not an object", () => {
    expect(countVehicles({ recoveryRequested: "two" })).toBe(0);
  });

  it("sums all recovery vehicle types", () => {
    expect(
      countVehicles({ recoveryRequested: { light: 1, heavy: 2, ipv: 3, hetos: 4 } }),
    ).toBe(10);
  });

  it("treats missing vehicle fields as 0", () => {
    expect(countVehicles({ recoveryRequested: { light: 2 } })).toBe(2);
  });
});

describe("isPureIncident", () => {
  it("is true for an ordinary incident with no exclusions", () => {
    expect(
      isPureIncident({ incidentType: "Breakdown", incursion: "NO", propertyDamage: false }),
    ).toBe(true);
  });

  it("is false for Free Recovery and Drive Off", () => {
    expect(isPureIncident({ incidentType: "Free Recovery" })).toBe(false);
    expect(isPureIncident({ incidentType: "Drive Off" })).toBe(false);
  });

  it("is false when there is an incursion", () => {
    expect(isPureIncident({ incidentType: "Breakdown", incursion: "YES" })).toBe(false);
  });

  it("is false when there is property damage", () => {
    expect(
      isPureIncident({ incidentType: "Breakdown", propertyDamage: true }),
    ).toBe(false);
  });
});

describe("clearanceBucket", () => {
  it("treats 60 mins or less as under an hour", () => {
    expect(clearanceBucket({ timeOnsiteToCleared: "60 mins" })).toBe("Under 1 hour");
    expect(clearanceBucket({ timeOnsiteToCleared: "0 mins" })).toBe("Under 1 hour");
  });

  it("treats more than 60 mins as over an hour", () => {
    expect(clearanceBucket({ timeOnsiteToCleared: "61 mins" })).toBe("Over 1 hour");
  });

  it("returns null when there is no recover time", () => {
    expect(clearanceBucket({})).toBeNull();
    expect(clearanceBucket({ timeOnsiteToCleared: "" })).toBeNull();
    expect(clearanceBucket(undefined)).toBeNull();
  });
});

describe("clearanceRateData", () => {
  const incidents = [
    { vehicleAllocated: "Light Recovery", timeOnsiteToCleared: "20 mins" },
    { vehicleAllocated: "Light Recovery", timeOnsiteToCleared: "50 mins" },
    { vehicleAllocated: "Light Recovery", timeOnsiteToCleared: "90 mins" },
    { vehicleAllocated: "Light Recovery" },
    { vehicleAllocated: "Heavy Recovery", timeOnsiteToCleared: "120 mins" },
    { vehicleAllocated: "RIPV", timeOnsiteToCleared: "10 mins" },
  ];

  it("splits one vehicle type with rounded percentages", () => {
    expect(clearanceRateData(incidents, ["Light Recovery"])).toEqual([
      { name: "Under 1 hour", Number: 2, pct: 67 },
      { name: "Over 1 hour", Number: 1, pct: 33 },
    ]);
  });

  it("drops empty buckets", () => {
    expect(clearanceRateData(incidents, ["Heavy Recovery"])).toEqual([
      { name: "Over 1 hour", Number: 1, pct: 100 },
    ]);
  });

  it("combines several vehicle types", () => {
    expect(clearanceRateData(incidents, ["Light Recovery", "Heavy Recovery"])).toEqual([
      { name: "Under 1 hour", Number: 2, pct: 50 },
      { name: "Over 1 hour", Number: 2, pct: 50 },
    ]);
  });

  it("returns [] with no matching incidents", () => {
    expect(clearanceRateData([], ["Light Recovery"])).toEqual([]);
    expect(clearanceRateData(undefined, ["Light Recovery"])).toEqual([]);
  });
});
