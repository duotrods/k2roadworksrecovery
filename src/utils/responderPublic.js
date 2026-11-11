// Pure shaping/filtering for the external (Lense) responder-locations API.
// No Supabase imports so it can be unit-tested; used by
// functions/api/responder-locations.js.

// Lense access is deliberately limited to the M3 scheme for now. Hard-coded on
// the server — never taken from the request — so a caller can't widen it.
export const EXTERNAL_SCHEME_ALLOWLIST = ["M3"];

// Does this incident row belong to an allowed scheme? Checks the scheme_ids
// array and falls back to the legacy single scheme_id.
export const incidentInAllowedScheme = (
  incident,
  allowed = EXTERNAL_SCHEME_ALLOWLIST,
) => {
  if (!incident) return false;
  const ids = Array.isArray(incident.scheme_ids) ? incident.scheme_ids : [];
  return ids.some((s) => allowed.includes(s)) || allowed.includes(incident.scheme_id);
};

// Rows are { id, incident_id, lat, lng, recorded_at, incident_reports: {...} }.
// Returns only live, allowed-scheme incidents, and only the fields Lense
// needs — no operator identity.
export const toExternalPins = (rows, allowed = EXTERNAL_SCHEME_ALLOWLIST) =>
  (rows || [])
    .filter((r) => r.incident_reports?.status === "live")
    .filter((r) => incidentInAllowedScheme(r.incident_reports, allowed))
    .map((r) => ({
      incidentId: r.incident_id,
      referenceId: r.incident_reports.reference_id || null,
      scheme: allowed.find(
        (s) =>
          (r.incident_reports.scheme_ids || []).includes(s) ||
          r.incident_reports.scheme_id === s,
      ),
      vehicleAllocated: r.incident_reports.vehicle_allocated || "",
      lat: r.lat,
      lng: r.lng,
      recordedAt: r.recorded_at,
    }));

// Constant-time string compare for the shared API key.
export const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
