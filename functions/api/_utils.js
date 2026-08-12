// Shared helpers for Cloudflare Pages Functions.
// A leading underscore means this file is NOT exposed as a route — it exists
// only to be imported by the real endpoints in this folder.

// Build a JSON HTTP response. Cloudflare has no `res` object like Node/Vercel,
// so we construct and return a web-standard Response ourselves.
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// Pull the bearer token out of the Authorization header ("Bearer <token>").
// On Cloudflare headers are read with request.headers.get(name).
export const getBearerToken = (request) => {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
};
