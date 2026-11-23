import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

// Where a fix comes from, stored with on-duty rows so admins can judge how
// much to trust it: the native app keeps reporting with the screen locked,
// the browser only while the page is open.
export const locationSource = () => (Capacitor.isNativePlatform() ? "app" : "web");

export const isLocationSupported = () =>
  Capacitor.isNativePlatform() ||
  (typeof navigator !== "undefined" && "geolocation" in navigator);

// Starts a stream of GPS fixes and returns a `stop()` function. Shared by job
// tracking and on-duty tracking so both use the same source:
//  - Native Android app (Capacitor): a background watcher backed by a
//    foreground service, so updates keep flowing with the screen locked or
//    another app in front.
//  - Browser/PWA: watchPosition + a screen wake lock. Foreground-only.
//
// `onFix({ lat, lng, heading, speed, accuracy })` fires for every fix;
// `onDenied()` fires when the user has refused location permission.
//
// `distanceFilter` (native only, metres): the watcher stays silent until the
// phone has moved this far. Keep it at 0 when a stationary device must still
// send heartbeats (on-duty tracking), otherwise admins see it go stale.
export function startLocationFeed({
  onFix,
  onDenied,
  backgroundTitle,
  backgroundMessage,
  distanceFilter = 10,
}) {
  if (Capacitor.isNativePlatform()) {
    let watcherId = null;
    let stopped = false;
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
            backgroundTitle,
            backgroundMessage,
            requestPermissions: true,
            stale: false,
            distanceFilter,
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
    return () => {
      stopped = true;
      if (watcherId !== null) BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
  }

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
  return () => {
    navigator.geolocation.clearWatch(watchId);
    document.removeEventListener("visibilitychange", onVisibility);
    wakeLock?.release?.().catch(() => {});
  };
}

export const openLocationSettings = () => BackgroundGeolocation.openSettings();
