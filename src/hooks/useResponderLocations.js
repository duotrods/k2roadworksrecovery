import { useState, useEffect } from "react";
import { staffService } from "../services/staffService";

/**
 * Realtime list of operators currently sharing their location (admin only —
 * RLS returns nothing to anyone else). Rows appear on Start Job and are
 * removed when the operator taps "Click when on Scene".
 */
export function useResponderLocations() {
  const [responders, setResponders] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = staffService.subscribeResponderLocations(
      (rows) => setResponders(rows),
      (err) => {
        console.error("Error in responder locations subscription:", err);
        setError(err);
      },
    );
    return () => unsubscribe?.();
  }, []);

  return { responders, error };
}
