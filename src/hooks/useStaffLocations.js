import { useState, useEffect } from "react";
import { staffService } from "../services/staffService";

/**
 * Realtime list of on-duty staff sharing their location (admin only — RLS
 * returns nothing to anyone else). Rows appear when staff go on duty and are
 * removed when they go off duty.
 */
export function useStaffLocations() {
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = staffService.subscribeStaffLocations(
      (rows) => setStaff(rows),
      (err) => {
        console.error("Error in staff locations subscription:", err);
        setError(err);
      },
    );
    return () => unsubscribe?.();
  }, []);

  return { staff, error };
}
