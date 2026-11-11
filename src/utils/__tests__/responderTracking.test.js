import { describe, it, expect } from "vitest";
import {
  distanceMeters,
  shouldSendLocation,
  isStale,
  fromResponderRow,
} from "../responderTracking";

const HERE = { lat: 51.5, lng: -0.12 };

describe("distanceMeters", () => {
  it("is 0 for identical points", () => {
    expect(distanceMeters(HERE, HERE)).toBe(0);
  });

  it("is ~111 m per 0.001 degree of latitude", () => {
    const d = distanceMeters(HERE, { lat: 51.501, lng: -0.12 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe("shouldSendLocation", () => {
  const prev = { ...HERE, sentAt: 1000000 };

  it("always sends the first fix", () => {
    expect(shouldSendLocation(null, HERE, 1000000)).toBe(true);
  });

  it("never sends faster than the minimum interval, even after a big move", () => {
    const far = { lat: 51.6, lng: -0.12 };
    expect(shouldSendLocation(prev, far, prev.sentAt + 5000)).toBe(false);
  });

  it("skips a tiny move once the minimum interval has passed", () => {
    const tiny = { lat: 51.50005, lng: -0.12 }; // ~5 m
    expect(shouldSendLocation(prev, tiny, prev.sentAt + 12000)).toBe(false);
  });

  it("sends a real move once the minimum interval has passed", () => {
    const moved = { lat: 51.501, lng: -0.12 }; // ~111 m
    expect(shouldSendLocation(prev, moved, prev.sentAt + 12000)).toBe(true);
  });

  it("sends a heartbeat after the maximum interval even without movement", () => {
    expect(shouldSendLocation(prev, HERE, prev.sentAt + 31000)).toBe(true);
  });
});

describe("isStale", () => {
  const NOW = new Date("2026-11-09T12:00:00Z").getTime();

  it("is fresh within 60 seconds", () => {
    expect(isStale(new Date(NOW - 59000).toISOString(), NOW)).toBe(false);
  });

  it("is stale after 60 seconds", () => {
    expect(isStale(new Date(NOW - 61000).toISOString(), NOW)).toBe(true);
  });

  it("treats a missing or invalid timestamp as stale", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("nope", NOW)).toBe(true);
  });
});

describe("fromResponderRow", () => {
  it("maps snake_case columns to camelCase", () => {
    expect(
      fromResponderRow({
        id: "r1",
        incident_id: "i1",
        user_id: "u1",
        operator_name: "Sam",
        lat: 1,
        lng: 2,
        heading: 90,
        speed: 12,
        accuracy: 8,
        recorded_at: "2026-11-09T12:00:00Z",
      }),
    ).toEqual({
      id: "r1",
      incidentId: "i1",
      userId: "u1",
      operatorName: "Sam",
      lat: 1,
      lng: 2,
      heading: 90,
      speed: 12,
      accuracy: 8,
      recordedAt: "2026-11-09T12:00:00Z",
    });
  });
});
