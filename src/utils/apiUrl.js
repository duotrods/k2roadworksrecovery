// Pages Functions live at /api/* on the web origin. A native (Capacitor) app is
// served from https://localhost, so relative "/api/..." URLs would hit the
// device instead of the server — there VITE_API_BASE_URL supplies the real
// origin (e.g. https://app.example.com). On the web it stays empty, so the
// relative URLs (and the dev proxy) keep working unchanged.

export const buildApiUrl = (base, path) =>
  `${(base || "").replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

export const apiUrl = (path) => buildApiUrl(import.meta.env.VITE_API_BASE_URL, path);
