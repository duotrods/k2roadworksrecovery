// Pure helpers for incident report derived values.
// Kept free of Firebase imports so they can be unit-tested in isolation and
// reused wherever incident data is processed.

// Total number of recovery vehicles requested on an incident.
export const countVehicles = (formData) => {
  const r = formData?.recoveryRequested;
  if (!r || typeof r !== "object") return 0;
  return (r.light || 0) + (r.heavy || 0) + (r.ipv || 0) + (r.hetos || 0);
};

// A "pure" incident excludes free recoveries, drive-offs, incursions and
// property damage. Stored on each report so it can be filtered at query time.
export const isPureIncident = (formData) =>
  formData.incidentType !== "Free Recovery" &&
  formData.incidentType !== "Drive Off" &&
  formData.incursion !== "YES" &&
  !formData.propertyDamage;

// Clearance rate: Light/Heavy recoveries split by whether time to recover
// (timeOnsiteToCleared, stored as e.g. "40 mins") was within an hour.
// 60 mins counts as "Under 1 hour", matching the 46-60 / 60+ buckets.
export const CLEARANCE_LABELS = { under: "Under 1 hour", over: "Over 1 hour" };

export const clearanceBucket = (incident) => {
  const m = parseInt(String(incident?.timeOnsiteToCleared ?? "").match(/(\d+)/)?.[1]);
  if (isNaN(m)) return null;
  return m <= 60 ? CLEARANCE_LABELS.under : CLEARANCE_LABELS.over;
};

// [{ name, Number, pct }] for incidents whose vehicleAllocated is in
// vehicleTypes. Empty buckets are dropped, like transformDataForChart.
export const clearanceRateData = (incidents, vehicleTypes) => {
  const counts = { [CLEARANCE_LABELS.under]: 0, [CLEARANCE_LABELS.over]: 0 };
  (incidents || []).forEach((i) => {
    if (!vehicleTypes.includes(i.vehicleAllocated)) return;
    const bucket = clearanceBucket(i);
    if (bucket) counts[bucket] += 1;
  });
  const total = counts[CLEARANCE_LABELS.under] + counts[CLEARANCE_LABELS.over];
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({
      name,
      Number: count,
      pct: Math.round((count / total) * 100),
    }));
};
