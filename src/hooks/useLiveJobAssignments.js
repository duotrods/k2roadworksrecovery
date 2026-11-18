import { useState, useEffect } from "react";
import { staffService } from "../services/staffService";

/**
 * Realtime list of live job sheets (owner + vehicle type) across all schemes.
 * A job drops out of this list the moment it is completed or stood down, which
 * is what turns an on-duty staff pin back to green on the admin map.
 */
export function useLiveJobAssignments() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const unsubscribe = staffService.subscribeLiveJobAssignments(
      (rows) => setJobs(rows),
      (err) => console.error("Error in live job assignments subscription:", err),
    );
    return () => unsubscribe?.();
  }, []);

  return { jobs };
}
