import { describe, it, expect } from "vitest";
import { toExternalPins, safeEqual, incidentInAllowedScheme } from "../responderPublic";

const row = (over = {}, inc = {}) => ({
  id: "r1",
  incident_id: "i1",
  lat: 51.1,
  lng: -1.3,
  recorded_at: "2026-11-11T10:00:00Z",
  operator_name: "Secret Name",
  user_id: "u1",
  incident_reports: {
    reference_id: "INC-001",
    scheme_ids: ["M3"],
    scheme_id: "M3",
    status: "live",
    vehicle_allocated: "RIPV",
    ...inc,
  },
  ...over,
});

describe("toExternalPins", () => {
  it("returns live M3 pins without operator identity", () => {
    const [pin] = toExternalPins([row()]);
    expect(pin).toEqual({
      incidentId: "i1",
      referenceId: "INC-001",
      scheme: "M3",
      vehicleAllocated: "RIPV",
      lat: 51.1,
      lng: -1.3,
      recordedAt: "2026-11-11T10:00:00Z",
    });
    expect(JSON.stringify(pin)).not.toContain("Secret");
  });

  it("excludes other schemes and non-live incidents", () => {
    const rows = [
      row({}, { scheme_ids: ["A417"], scheme_id: "A417" }),
      row({}, { status: "completed" }),
    ];
    expect(toExternalPins(rows)).toEqual([]);
  });

  it("falls back to legacy scheme_id", () => {
    expect(toExternalPins([row({}, { scheme_ids: [], scheme_id: "M3" })])).toHaveLength(1);
  });

  it("handles empty/null input", () => {
    expect(toExternalPins(null)).toEqual([]);
    expect(incidentInAllowedScheme(null)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
  });
});
