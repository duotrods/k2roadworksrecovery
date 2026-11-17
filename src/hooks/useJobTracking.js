import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { staffService } from "../services/staffService";
import { shouldSendLocation } from "../utils/responderTracking";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

// Shares the operator's position with admins while `active` (en route to a
// job). Writes are throttled (see shouldSendLocation) and the live row is
// cleared the moment tracking stops or the component unmounts.
//
// Two sources feed the same throttled upsert:
//  - Native Android app (Capacitor): a background watcher backed by a
//    foreground service, so updates keep flowing with the screen locked or
//    another app in front.
//  - Browser/PWA: watchPosition + a screen wake lock. Foreground-only.
//
// Returns { status } where status is "idle" | "tracking" | "denied" |
// "unavailable" — the form shows a banner for the last three.
export function useJobTracking({ incidentId, userId, operatorName, active }) {
  // Remembers which job the browser refused permission for, so the denied
  // state resets itself when a different job starts tracking.
  const [deniedFor, setDeniedFor] = useState(null);
  const native = Capacitor.isNativePlatform();
  const supported =
    native || (typeof navigator !== "undefined" && "geolocation" in navigator);

  useEffect(() => {
    if (!active || !incidentId || !userId || !supported) return undefined;

    let lastSent = null;
    let stopFeed = () => {};
    let stopped = false;
    // Serialises writes so a late upsert can never resurrect a row after the
    // cleanup delete has run.
    let pending = Promise.resolve();

    const onFix = (fix) => {
      if (stopped) return;
      const now = Date.now();
      if (!shouldSendLocation(lastSent, fix, now)) return;
      const sentMark = { lat: fix.lat, lng: fix.lng, sentAt: now };
      lastSent = sentMark;
      pending = pending
        .then(() =>
          staffService.upsertResponderLocation(incidentId, userId, operatorName, fix),
        )
        .catch((err) => {
          console.error("Failed to share location:", err);
          // Only the latest position matters to admins, so no queue: just let
          // the next fix retry straight away instead of waiting out the throttle.
          if (lastSent === sentMark) lastSent = null;
        });
    };

    const onDenied = () => setDeniedFor(incidentId);

    if (native) {
      let watcherId = null;
      (async () => {
        // Android 13+ needs the notification permission for the foreground
        // service notification; a refusal isn't fatal for foreground use.
        try {
          await LocalNotifications.requestPermissions();
        } catch {
          // best-effort
        }
        if (stopped) return;
        try {
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: "Sharing your location",
              backgroundMessage: "Control can see you're on the way to the job.",
              requestPermissions: true,
              stale: false,
              distanceFilter: 10,
            },
            (location, error) => {
              if (error) {
                if (error.code === "NOT_AUTHORIZED") onDenied();
                else console.warn("Location unavailable:", error.message);
                return;
              }
              if (!location) return;
              onFix({
                lat: location.latitude,
                lng: location.longitude,
                heading: location.bearing,
                speed: location.speed,
                accuracy: location.accuracy,
              });
            },
          );
          if (stopped) BackgroundGeolocation.removeWatcher({ id });
          else watcherId = id;
        } catch (err) {
          console.error("Failed to start background tracking:", err);
        }
      })();
      stopFeed = () => {
        if (watcherId !== null) BackgroundGeolocation.removeWatcher({ id: watcherId });
      };
    } else {
      let wakeLock = null;
      const acquireWakeLock = async () => {
        try {
          wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
        } catch {
          // Wake Lock is a best-effort extra (unsupported / battery saver).
        }
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") acquireWakeLock();
      };
      const watchId = navigator.geolocation.watchPosition(
        ({ coords }) =>
          onFix({
            lat: coords.latitude,
            lng: coords.longitude,
            heading: coords.heading,
            speed: coords.speed,
            accuracy: coords.accuracy,
          }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) onDenied();
          else console.warn("Location unavailable:", err.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
      acquireWakeLock();
      document.addEventListener("visibilitychange", onVisibility);
      stopFeed = () => {
        navigator.geolocation.clearWatch(watchId);
        document.removeEventListener("visibilitychange", onVisibility);
        wakeLock?.release?.().catch(() => {});
      };
    }

    return () => {
      stopped = true;
      stopFeed();
      pending
        .then(() => staffService.clearResponderLocation(incidentId))
        .catch((err) => console.error("Failed to clear location:", err));
    };
  }, [active, incidentId, userId, operatorName, supported, native]);

  let status = "tracking";
  if (!active) status = "idle";
  else if (!supported) status = "unavailable";
  else if (deniedFor === incidentId) status = "denied";
  return { status };
}
