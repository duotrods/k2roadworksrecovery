import { describe, it, expect } from "vitest";
import {
  distanceMeters,
  shouldSendLocation,
  isStale,
  fromResponderRow,
  buildStaffPins,
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

import { fromStaffLocationRow } from "../responderTracking";

describe("fromStaffLocationRow", () => {
  it("maps snake_case columns to camelCase", () => {
    expect(
      fromStaffLocationRow({
        id: "a",
        user_id: "u1",
        operator_name: "Sam",
        lat: 1,
        lng: 2,
        heading: null,
        speed: 3,
        accuracy: 4,
        recorded_at: "2026-01-01T00:00:00Z",
      }),
    ).toEqual({
      id: "a",
      userId: "u1",
      operatorName: "Sam",
      lat: 1,
      lng: 2,
      heading: null,
      speed: 3,
      accuracy: 4,
      recordedAt: "2026-01-01T00:00:00Z",
    });
  });
});

import { isOrphaned, STAFF_HIDE_AFTER_MS } from "../responderTracking";

describe("isOrphaned", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  it("keeps recent rows", () => {
    expect(isOrphaned(new Date(now - 60000).toISOString(), now)).toBe(false);
  });
  it("hides rows older than the cutoff", () => {
    expect(isOrphaned(new Date(now - STAFF_HIDE_AFTER_MS - 1).toISOString(), now)).toBe(true);
  });
  it("hides unreadable timestamps", () => {
    expect(isOrphaned("nope", now)).toBe(true);
  });
});

describe("buildStaffPins", () => {
  const NOW = Date.parse("2026-11-18T10:00:00Z");
  const staff = (userId, ageMs = 5000) => ({
    id: `s-${userId}`,
    userId,
    lat: 51,
    lng: 0,
    recordedAt: new Date(NOW - ageMs).toISOString(),
  });
  const job = (id, userId, createdAt = "2026-11-18T09:00:00Z") => ({
    id,
    userId,
    vehicleAllocated: "Heavy Recovery",
    createdAt,
  });

  it("leaves an on-duty member with no live job as job: null (green)", () => {
    const [pin] = buildStaffPins([staff("u1")], [], NOW);
    expect(pin.job).toBeNull();
  });

  it("attaches the member's live job (vehicle colour)", () => {
    const [pin] = buildStaffPins([staff("u1")], [job("j1", "u1")], NOW);
    expect(pin.job.id).toBe("j1");
    expect(pin.job.vehicleAllocated).toBe("Heavy Recovery");
  });

  it("goes back to no job once the job is no longer live", () => {
    expect(buildStaffPins([staff("u1")], [job("j1", "u1")], NOW)[0].job).not.toBeNull();
    expect(buildStaffPins([staff("u1")], [], NOW)[0].job).toBeNull();
  });

  it("ignores jobs owned by someone else", () => {
    const [pin] = buildStaffPins([staff("u1")], [job("j1", "u2")], NOW);
    expect(pin.job).toBeNull();
  });

  it("uses the newest job when someone has several live", () => {
    const [pin] = buildStaffPins(
      [staff("u1")],
      [job("old", "u1", "2026-11-18T08:00:00Z"), job("new", "u1", "2026-11-18T09:30:00Z")],
      NOW,
    );
    expect(pin.job.id).toBe("new");
  });

  it("drops orphaned on-duty rows", () => {
    expect(buildStaffPins([staff("u1", 60 * 60 * 1000)], [], NOW)).toHaveLength(0);
  });
});
