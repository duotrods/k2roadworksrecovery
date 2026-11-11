import { useEffect, useState } from "react";
import { staffService } from "../services/staffService";
import { shouldSendLocation } from "../utils/responderTracking";

// Shares the operator's position with admins while `active` (en route to a
// job). Writes are throttled (see shouldSendLocation), the screen is kept
// awake so the foreground-only PWA keeps reporting, and the live row is
// cleared the moment tracking stops or the component unmounts.
//
// Returns { status } where status is "idle" | "tracking" | "denied" |
// "unavailable" — the form shows a banner for the last three.
export function useJobTracking({ incidentId, userId, operatorName, active }) {
  // Remembers which job the browser refused permission for, so the denied
  // state resets itself when a different job starts tracking.
  const [deniedFor, setDeniedFor] = useState(null);
  const supported =
    typeof navigator !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (!active || !incidentId || !userId || !supported) return undefined;

    let lastSent = null;
    let wakeLock = null;
    let stopped = false;
    // Serialises writes so a late upsert can never resurrect a row after the
    // cleanup delete has run.
    let pending = Promise.resolve();

    const acquireWakeLock = async () => {
      try {
        wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Wake Lock is a best-effort extra (unsupported / battery saver).
      }
    };

    const onPosition = ({ coords }) => {
      if (stopped) return;
      const fix = {
        lat: coords.latitude,
        lng: coords.longitude,
        heading: coords.heading,
        speed: coords.speed,
        accuracy: coords.accuracy,
      };
      const now = Date.now();
      if (!shouldSendLocation(lastSent, fix, now)) return;
      lastSent = { lat: fix.lat, lng: fix.lng, sentAt: now };
      pending = pending
        .then(() =>
          staffService.upsertResponderLocation(incidentId, userId, operatorName, fix),
        )
        .catch((err) => console.error("Failed to share location:", err));
    };

    const onError = (err) => {
      if (err.code === err.PERMISSION_DENIED) setDeniedFor(incidentId);
      else console.warn("Location unavailable:", err.message);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquireWakeLock();
    };

    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });
    acquireWakeLock();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLock?.release?.().catch(() => {});
      pending
        .then(() => staffService.clearResponderLocation(incidentId))
        .catch((err) => console.error("Failed to clear location:", err));
    };
  }, [active, incidentId, userId, operatorName, supported]);

  let status = "tracking";
  if (!active) status = "idle";
  else if (!supported) status = "unavailable";
  else if (deniedFor === incidentId) status = "denied";
  return { status };
}
