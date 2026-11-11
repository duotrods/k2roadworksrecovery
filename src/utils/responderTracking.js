// Pure helpers for live operator tracking. Kept free of Supabase/React
// imports so they can be unit-tested in isolation.

export const MIN_SEND_INTERVAL_MS = 10000; // never write more often than this
export const MAX_SEND_INTERVAL_MS = 30000; // heartbeat even when stationary
export const MIN_MOVE_METERS = 25; // ignore GPS jitter below this
export const STALE_AFTER_MS = 60000; // admin greys a pin after this long

const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in metres between two { lat, lng } points.
export const distanceMeters = (a, b) => {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Decides whether a new GPS fix is worth writing. `prev` is the last fix we
// sent ({ lat, lng, sentAt }) or null; `next` is { lat, lng }.
export const shouldSendLocation = (prev, next, nowMs) => {
  if (!prev) return true;
  const elapsed = nowMs - prev.sentAt;
  if (elapsed < MIN_SEND_INTERVAL_MS) return false;
  if (elapsed >= MAX_SEND_INTERVAL_MS) return true;
  return distanceMeters(prev, next) >= MIN_MOVE_METERS;
};

// True when a fix is too old to trust as "current" (or unreadable).
export const isStale = (recordedAt, nowMs = Date.now()) => {
  const t = new Date(recordedAt).getTime();
  if (Number.isNaN(t)) return true;
  return nowMs - t > STALE_AFTER_MS;
};

export const fromResponderRow = (row) => ({
  id: row.id,
  incidentId: row.incident_id,
  userId: row.user_id,
  operatorName: row.operator_name,
  lat: row.lat,
  lng: row.lng,
  heading: row.heading,
  speed: row.speed,
  accuracy: row.accuracy,
  recordedAt: row.recorded_at,
});
