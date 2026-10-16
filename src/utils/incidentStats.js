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

// Month-by-month recovery report (the client's own Excel reporting layout).
// "Recoveries" are Light + Heavy recovery jobs; clearance rate is the share of
// those cleared within an hour. Rates are fractions (0-1), or null when a
// month has no measurable jobs of that kind (shown as "N/A").
const LIGHT = "Light Recovery";
const HEAVY = "Heavy Recovery";

const incidentMillis = (createdAt) => {
  if (!createdAt) return NaN;
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return new Date(createdAt).getTime();
};

const rateOf = (list) => {
  const measured = list.filter((i) => clearanceBucket(i));
  if (!measured.length) return null;
  return measured.filter((i) => clearanceBucket(i) === CLEARANCE_LABELS.under).length / measured.length;
};

export const monthlyRecoverySummary = (incidents, startDate, endDate) => {
  const byMonth = new Map();
  (incidents || []).forEach((i) => {
    if (i.vehicleAllocated !== LIGHT && i.vehicleAllocated !== HEAVY) return;
    const d = new Date(incidentMillis(i.createdAt));
    if (isNaN(d)) return;
    const key = d.getFullYear() * 12 + d.getMonth();
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(i);
  });

  // One row per calendar month across the range, including empty months.
  const first = byMonth.size ? Math.min(...byMonth.keys()) : null;
  const rangeStart = startDate.getFullYear() * 12 + startDate.getMonth();
  const rangeEnd = endDate.getFullYear() * 12 + endDate.getMonth();
  const from = first === null ? rangeStart : Math.min(rangeStart, first);
  const to = Math.max(rangeEnd, ...byMonth.keys());

  const months = [];
  for (let key = from; key <= to; key++) {
    const list = byMonth.get(key) || [];
    months.push({
      month: new Date(Math.floor(key / 12), key % 12, 1),
      recoveries: list.length,
      clearance: rateOf(list),
      lights: rateOf(list.filter((i) => i.vehicleAllocated === LIGHT)),
      heavies: rateOf(list.filter((i) => i.vehicleAllocated === HEAVY)),
    });
  }

  const all = [...byMonth.values()].flat();
  return {
    months,
    totalRecoveries: all.length,
    overallClearance: rateOf(all),
  };
};
