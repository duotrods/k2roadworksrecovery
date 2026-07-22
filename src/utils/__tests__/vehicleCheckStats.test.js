import { describe, it, expect } from "vitest";
import { VEHICLE_CHECK_ITEMS, countDefectsByItem } from "../vehicleCheckStats";

describe("VEHICLE_CHECK_ITEMS", () => {
  it("has the 8 fixed check items with item keys and labels", () => {
    expect(VEHICLE_CHECK_ITEMS).toHaveLength(8);
    expect(VEHICLE_CHECK_ITEMS[0]).toEqual({ item: "oilLevel", label: "Oil Level" });
    expect(VEHICLE_CHECK_ITEMS.map((i) => i.item)).toEqual([
      "oilLevel",
      "water",
      "engine",
      "cleanlinessInterior",
      "cleanlinessExterior",
      "wiperWashers",
      "tyres",
      "lights",
    ]);
  });
});

describe("countDefectsByItem", () => {
  it("returns 0 for every item when there are no reports", () => {
    const result = countDefectsByItem([]);
    expect(result).toHaveLength(8);
    expect(result.every((r) => r.count === 0)).toBe(true);
    expect(result[0]).toEqual({ item: "oilLevel", label: "Oil Level", count: 0 });
  });

  it("counts defect statuses across all days for one report", () => {
    const reports = [
      {
        checks: [
          {
            item: "tyres",
            label: "Tyres",
            status: {
              monday: "defect",
              tuesday: "ok",
              wednesday: "defect",
              thursday: "",
              friday: "na",
              saturday: "",
              sunday: "",
            },
          },
        ],
      },
    ];
    const result = countDefectsByItem(reports);
    const tyres = result.find((r) => r.item === "tyres");
    expect(tyres.count).toBe(2);
  });

  it("sums defects for the same item across multiple reports", () => {
    const makeReport = (day) => ({
      checks: [{ item: "lights", label: "Lights", status: { [day]: "defect" } }],
    });
    const result = countDefectsByItem([makeReport("monday"), makeReport("friday")]);
    expect(result.find((r) => r.item === "lights").count).toBe(2);
  });

  it("ignores rows with legacy initials-only data (no status field)", () => {
    const reports = [
      {
        checks: [
          { item: "engine", label: "Engine", initials: { monday: "JS" } },
        ],
      },
    ];
    const result = countDefectsByItem(reports);
    expect(result.find((r) => r.item === "engine").count).toBe(0);
  });

  it("handles reports with missing or malformed checks gracefully", () => {
    expect(() => countDefectsByItem([{}, { checks: null }, null])).not.toThrow();
    const result = countDefectsByItem([{}, { checks: null }, null]);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});
