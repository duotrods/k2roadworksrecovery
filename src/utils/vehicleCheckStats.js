// Fixed 8-item check list — matches the paper "Recovery Vehicle Daily Check
// Sheet" template exactly. Not user-addable/removable. Single source of
// truth: imported by the form page and by the defect-count aggregation below.
export const VEHICLE_CHECK_ITEMS = [
  { item: "oilLevel", label: "Oil Level" },
  { item: "water", label: "Water" },
  { item: "engine", label: "Engine" },
  { item: "cleanlinessInterior", label: "Cleanliness - Interior" },
  { item: "cleanlinessExterior", label: "Cleanliness - Exterior" },
  { item: "wiperWashers", label: "Wiper/Washers" },
  { item: "tyres", label: "Tyres" },
  { item: "lights", label: "Lights" },
];

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * Counts how many "defect" statuses were recorded per check item, across all
 * days and all given reports. Reports whose rows only have legacy `initials`
 * (no `status`) contribute 0 for that row — there's no defect signal to
 * extract from free-text initials.
 */
export function countDefectsByItem(reports) {
  const counts = Object.fromEntries(VEHICLE_CHECK_ITEMS.map(({ item }) => [item, 0]));

  for (const report of reports || []) {
    const checks = Array.isArray(report?.checks) ? report.checks : [];
    for (const row of checks) {
      if (!row || !(row.item in counts) || !row.status) continue;
      for (const day of DAYS_OF_WEEK) {
        if (row.status[day] === "defect") counts[row.item] += 1;
      }
    }
  }

  return VEHICLE_CHECK_ITEMS.map(({ item, label }) => ({
    item,
    label,
    count: counts[item],
  }));
}
