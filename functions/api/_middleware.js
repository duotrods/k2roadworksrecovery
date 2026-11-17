// CORS for the native (Capacitor) Android app. The web app is same-origin and
// never needs this, but the app's WebView runs at https://localhost and calls
// these endpoints cross-origin. Only that origin is allowed; auth is still the
// per-request bearer token, so this widens nothing for browsers.

const ALLOWED_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);

const corsHeaders = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
  vary: "Origin",
});

export async function onRequest({ request, next }) {
  const origin = request.headers.get("origin");
  const allowed = origin && ALLOWED_ORIGINS.has(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: allowed ? corsHeaders(origin) : {} });
  }

  const response = await next();
  if (!allowed) return response;

  const withCors = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders(origin))) withCors.headers.set(k, v);
  return withCors;
}
