import { createClient } from "@supabase/supabase-js";
import { json } from "./_utils.js";
import { toExternalPins, safeEqual } from "../../src/utils/responderPublic.js";

// Server-to-server endpoint for the Lense app (Firebase). Returns operators
// currently en route to LIVE M3 incidents. Auth is a shared secret in the
// x-api-key header (env.LENSE_API_KEY) — Lense must call this from its own
// backend (Cloud Function), never from the browser, so the key stays secret.
// Scheme scope is fixed server-side (see EXTERNAL_SCHEME_ALLOWLIST).
export async function onRequestGet({ request, env }) {
  if (!env.LENSE_API_KEY) {
    return json({ error: "Endpoint not configured" }, 503);
  }
  if (!safeEqual(request.headers.get("x-api-key") || "", env.LENSE_API_KEY)) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Service role bypasses RLS — fine here because the response is filtered
  // and field-limited by toExternalPins.
  const supabaseAdmin = createClient(
    env.VITE_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data, error } = await supabaseAdmin
    .from("incident_responder_locations")
    .select(
      "id, incident_id, lat, lng, recorded_at, incident_reports!inner(reference_id, scheme_id, scheme_ids, status)",
    )
    .eq("incident_reports.status", "live");

  if (error) {
    console.error("responder-locations query failed:", error);
    return json({ error: "Failed to load locations" }, 500);
  }

  return new Response(JSON.stringify({ responders: toExternalPins(data) }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
