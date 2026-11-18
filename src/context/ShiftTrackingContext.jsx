import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { staffService } from "../services/staffService";
import { shouldSendLocation } from "../utils/responderTracking";
import { isLocationSupported, startLocationFeed } from "../utils/locationFeed";
import { USER_ROLES } from "../utils/constants";
import { ShiftContext } from "./shift-context";

const storageKey = (uid) => `k2.onDuty.${uid}`;

const readStored = (uid) => {
  try {
    return localStorage.getItem(storageKey(uid)) === "1";
  } catch {
    return false;
  }
};

const writeStored = (uid, on) => {
  try {
    if (on) localStorage.setItem(storageKey(uid), "1");
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // storage unavailable — duty state just won't survive a reload
  }
};

// Lives above the routed pages (not inside a layout) so on-duty tracking keeps
// running while staff move between pages. While on duty it streams throttled
// GPS fixes into `staff_locations`; going off duty deletes the row.
export const ShiftTrackingProvider = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? null;
  const isStaff = userProfile?.role === USER_ROLES.STAFF;
  const operatorName = userProfile?.displayName || null;
  const supported = isLocationSupported();

  const [onDuty, setOnDutyState] = useState(false);
  const [denied, setDenied] = useState(false);

  // Resume an in-progress shift after a reload / app restart.
  useEffect(() => {
    setOnDutyState(isStaff && uid ? readStored(uid) : false);
    setDenied(false);
  }, [isStaff, uid]);

  const setOnDuty = useCallback(
    async (on) => {
      if (!uid) return;
      writeStored(uid, on);
      setOnDutyState(on);
      setDenied(false);
      if (!on) {
        // Clear explicitly (not only in the effect cleanup) so callers can
        // await it before signing out, while the session still permits it.
        try {
          await staffService.clearStaffLocation(uid);
        } catch (err) {
          console.error("Failed to clear staff location:", err);
        }
      }
    },
    [uid],
  );

  useEffect(() => {
    if (!onDuty || !uid || !isStaff || !supported) return undefined;

    let lastSent = null;
    let stopped = false;
    // Serialises writes so a late upsert can't resurrect a row after the
    // cleanup delete has run.
    let pending = Promise.resolve();

    const onFix = (fix) => {
      if (stopped) return;
      const now = Date.now();
      if (!shouldSendLocation(lastSent, fix, now)) return;
      const sentMark = { lat: fix.lat, lng: fix.lng, sentAt: now };
      lastSent = sentMark;
      pending = pending
        .then(() => staffService.upsertStaffLocation(uid, operatorName, fix))
        .catch((err) => {
          console.error("Failed to share staff location:", err);
          if (lastSent === sentMark) lastSent = null;
        });
    };

    const stopFeed = startLocationFeed({
      onFix,
      onDenied: () => setDenied(true),
      backgroundTitle: "On duty",
      backgroundMessage: "Control can see your location while you're on duty.",
    });

    return () => {
      stopped = true;
      stopFeed();
      pending
        .then(() => staffService.clearStaffLocation(uid))
        .catch((err) => console.error("Failed to clear staff location:", err));
    };
  }, [onDuty, uid, isStaff, operatorName, supported]);

  const status = useMemo(() => {
    if (!onDuty) return "idle";
    if (!supported) return "unavailable";
    if (denied) return "denied";
    return "tracking";
  }, [onDuty, supported, denied]);

  const value = useMemo(
    () => ({ onDuty, status, setOnDuty }),
    [onDuty, status, setOnDuty],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
};
