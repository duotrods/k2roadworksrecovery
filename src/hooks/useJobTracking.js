import { useEffect, useState } from "react";
import { staffService } from "../services/staffService";
import { shouldSendLocation } from "../utils/responderTracking";
import { isLocationSupported, startLocationFeed } from "../utils/locationFeed";

// Shares the operator's position with admins while `active` (en route to a
// job). Writes are throttled (see shouldSendLocation) and the live row is
// cleared the moment tracking stops or the component unmounts. The GPS source
// (native background watcher vs browser watchPosition) lives in locationFeed.
//
// Returns { status } where status is "idle" | "tracking" | "denied" |
// "unavailable" — the form shows a banner for the last three.
export function useJobTracking({ incidentId, userId, operatorName, active }) {
  // Remembers which job the browser refused permission for, so the denied
  // state resets itself when a different job starts tracking.
  const [deniedFor, setDeniedFor] = useState(null);
  const supported = isLocationSupported();

  useEffect(() => {
    if (!active || !incidentId || !userId || !supported) return undefined;

    let lastSent = null;
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

    const stopFeed = startLocationFeed({
      onFix,
      onDenied: () => setDeniedFor(incidentId),
      backgroundTitle: "Sharing your location",
      backgroundMessage: "Control can see you're on the way to the job.",
    });

    return () => {
      stopped = true;
      stopFeed();
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
