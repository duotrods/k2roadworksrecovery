/* eslint-disable no-unused-vars */
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  startAfter,
  getCountFromServer,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { supabase } from "../config/supabase";
import { AppError } from "../utils/errorHandling";
import { isVideoFile } from "../utils/fileType";
import { fromIncidentRow } from "../utils/incidentRowMapper";

class ClientDataService {
  // Real-time listener for live incidents (uses onSnapshot - only charges when data changes)
  subscribeLiveIncidents(schemeId, callback, onError) {
    const incidentsRef = collection(db, "incidentReports");

    // Query for live incidents only
    const q = query(
      incidentsRef,
      where("schemeIds", "array-contains", schemeId),
      where("status", "==", "live"),
      orderBy("createdAt", "desc"),
      limit(50), // Limit to 50 most recent live incidents
    );

    // Track fallback unsubscribe so it can be cleaned up together with the primary
    let fallbackUnsub = null;

    const primaryUnsub = onSnapshot(
      q,
      (snapshot) => {
        const incidents = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(incidents);
      },
      (error) => {
        // If index error, fall back to simpler query
        if (
          error.code === "failed-precondition" ||
          error.message?.includes("index")
        ) {
          console.warn(
            "Index not available for live incidents, using fallback query",
          );
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
            limit(100),
          );
          fallbackUnsub = onSnapshot(
            simpleQuery,
            (snapshot) => {
              const incidents = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((doc) => doc.status === "live")
                .sort(
                  (a, b) =>
                    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
                )
                .slice(0, 50);
              callback(incidents);
            },
            onError,
          );
          return;
        }
        if (onError) onError(error);
      },
    );

    // Return a combined unsubscribe that cancels both primary and fallback
    return () => {
      primaryUnsub();
      if (fallbackUnsub) fallbackUnsub();
    };
  }

  // Real-time listener for all scheme incidents (live + completed)
  subscribeSchemeIncidents(schemeId, callback, onError) {
    const incidentsRef = collection(db, "incidentReports");

    const q = query(
      incidentsRef,
      where("schemeIds", "array-contains", schemeId),
      orderBy("createdAt", "desc"),
      limit(100), // Limit to 100 most recent incidents
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const incidents = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(incidents);
      },
      (error) => {
        if (
          error.code === "failed-precondition" ||
          error.message?.includes("index")
        ) {
          console.warn("Index not available, using fallback query");
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
            limit(100),
          );
          return onSnapshot(
            simpleQuery,
            (snapshot) => {
              const incidents = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .sort(
                  (a, b) =>
                    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
                );
              callback(incidents);
            },
            onError,
          );
        }
        if (onError) onError(error);
      },
    );
  }

  // Paginated query for completed incidents (only reads 10 docs per page - saves costs!)
  async getCompletedIncidentsPaginated(
    schemeId,
    pageSize = 10,
    lastDoc = null,
  ) {
    try {
      const incidentsRef = collection(db, "incidentReports");

      // Build query with cursor if we have a last document
      let q;
      if (lastDoc) {
        q = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(pageSize),
        );
      } else {
        q = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          limit(pageSize),
        );
      }

      const snapshot = await getDocs(q);
      const incidents = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Return data + last doc for next page cursor
      return {
        incidents,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      // Fallback for missing index
      if (
        error.code === "failed-precondition" ||
        error.message?.includes("index")
      ) {
        console.warn("Index not available for paginated query, using fallback");
        const simpleQuery = query(
          collection(db, "incidentReports"),
          where("schemeIds", "array-contains", schemeId),
          limit(100),
        );
        const snapshot = await getDocs(simpleQuery);
        const allCompleted = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((doc) => doc.status === "completed")
          .sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
          );

        // Manual pagination on filtered results
        const startIndex = lastDoc
          ? allCompleted.findIndex((d) => d.id === lastDoc.id) + 1
          : 0;
        const incidents = allCompleted.slice(startIndex, startIndex + pageSize);

        return {
          incidents,
          lastDoc:
            incidents.length > 0
              ? { id: incidents[incidents.length - 1].id }
              : null,
          hasMore: startIndex + pageSize < allCompleted.length,
        };
      }
      throw error;
    }
  }

  // Get total count of completed incidents (for pagination display)
  async getCompletedIncidentsCount(schemeId) {
    try {
      const incidentsRef = collection(db, "incidentReports");
      const q = query(
        incidentsRef,
        where("schemeIds", "array-contains", schemeId),
        where("status", "==", "completed"),
      );
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.warn("Could not get count:", error);
      return 0;
    }
  }

  // Get a single incident by ID (1 read instead of loading all reports!)
  async getIncidentById(incidentId) {
    try {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .eq("id", incidentId)
        .maybeSingle();
      if (error) throw error;
      return fromIncidentRow(data);
    } catch (error) {
      console.error("Error fetching incident by ID:", error);
      throw new AppError(
        "Failed to fetch incident",
        "client-data/fetch-error",
        error,
      );
    }
  }

  // Get live incidents for a specific scheme
  async getLiveIncidentsByScheme(schemeId) {
    try {
      const incidentsRef = collection(db, "incidentReports");

      try {
        // Try compound query (requires index on schemeIds + status + createdAt)
        const q = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          where("status", "==", "live"),
          orderBy("createdAt", "desc"),
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (indexError) {
        // If index doesn't exist, fall back to fetching by scheme and filtering in memory
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          console.warn(
            "Index not available for live incidents query, filtering in memory",
          );
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
          );
          const snapshot = await getDocs(simpleQuery);
          const docs = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((doc) => doc.status === "live")
            .sort((a, b) => {
              const timeA = a.createdAt?.seconds || 0;
              const timeB = b.createdAt?.seconds || 0;
              return timeB - timeA;
            });
          return docs;
        }
        throw indexError;
      }
    } catch (error) {
      console.error("Error fetching live incidents:", error);
      throw new AppError(
        "Failed to fetch live incidents",
        "client-data/fetch-error",
        error,
      );
    }
  }

  // Get incidents for a specific scheme
  async getSchemeIncidents(schemeId, limitCount = 100) {
    try {
      const incidentsRef = collection(db, "incidentReports");

      // Try new schema first (schemeIds array)
      try {
        const q = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          orderBy("createdAt", "desc"),
          limit(limitCount),
        );
        const querySnapshot = await getDocs(q);
        const results = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log(
          `Found ${results.length} incidents for scheme ${schemeId} using array-contains`,
        );
        return results;
      } catch (indexError) {
        // Check if it's an index error or permissions error
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          // If index doesn't exist, try without ordering
          console.warn(
            "Index not available for incidentReports, trying simplified query",
          );
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
            limit(limitCount),
          );
          const snapshot = await getDocs(simpleQuery);
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          console.log(
            `Found ${docs.length} incidents for scheme ${schemeId} (simplified query)`,
          );
          if (docs.length > 0) {
            console.log(
              "Sample incident schemeIds:",
              docs[0].schemeIds,
              "Sample incident data:",
              docs[0],
            );
          }
          // Sort in memory
          return docs.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
        }
        // If it's a permissions error or other error, rethrow
        throw indexError;
      }
    } catch (error) {
      console.error("Error fetching incidents:", error);
      throw new AppError(
        "Failed to fetch scheme incidents",
        "client-data/fetch-error",
        error,
      );
    }
  }

  // Get CCTV check reports for a specific scheme
  async getSchemeCCTVChecks(schemeId, limitCount = 100) {
    try {
      const cctvRef = collection(db, "cctvCheckForms");

      try {
        const q = query(
          cctvRef,
          where("schemeIds", "array-contains", schemeId),
          orderBy("createdAt", "desc"),
          limit(limitCount),
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (indexError) {
        // Check if it's an index error or permissions error
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          console.warn(
            "Index not available for cctvCheckForms, trying simplified query",
          );
          const simpleQuery = query(
            cctvRef,
            where("schemeIds", "array-contains", schemeId),
            limit(limitCount),
          );
          const snapshot = await getDocs(simpleQuery);
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          return docs.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
        }
        throw indexError;
      }
    } catch (error) {
      console.error("Error fetching CCTV checks:", error);
      throw new AppError(
        "Failed to fetch CCTV checks",
        "client-data/fetch-error",
        error,
      );
    }
  }

  // Get aggregated statistics for a scheme
  async getSchemeStats(schemeId, days = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // Get recent incidents
      const incidentsRef = collection(db, "incidentReports");
      const incidentsQuery = query(
        incidentsRef,
        where("schemeIds", "array-contains", schemeId),
        where("createdAt", ">=", Timestamp.fromDate(startDate)),
      );
      const incidentsSnapshot = await getDocs(incidentsQuery);
      const incidents = incidentsSnapshot.docs.map((doc) => doc.data());

      // Calculate statistics
      const stats = {
        totalIncidents: incidents.filter(
          (i) => i.incidentType !== "Free Recovery" && i.incursion !== "YES",
        ).length,
        incidentsByType: this.groupByField(incidents, "incidentType"),
        incidentsByLane: this.groupByFieldArray(incidents, "affectedLanes"), // Array field
        vehiclesDispatched: this.calculateVehiclesDispatched(incidents),
        spottedBy: this.groupByField(incidents, "reportedBy"), // Changed from spottedBy to reportedBy
        faultTypes: this.groupByField(incidents, "fault"), // Changed from faultType to fault
        vehicleTypes: this.groupVehicleTypes(incidents), // Extract from vehicles array
        vehicleTypesDispatched: this.groupVehiclesDispatched(incidents), // From recoveryRequested object
        trafficConditions: this.groupByField(incidents, "trafficConditions"),
        trackOfIncident: this.groupByField(incidents, "track"),
        emergencyServices: this.groupByFieldArray(
          incidents,
          "emergencyServices",
        ), // Array field
        timeToRecover: this.groupByCalculatedTime(
          incidents,
          "timeOnsiteToCleared",
        ), // Time from on site to cleared (pre-calculated)
        timeToSite: this.groupByCalculatedTime(incidents, "timeSpottedToOn"), // Time from spotted to on site (pre-calculated)
        incursions: incidents.filter((i) => i.incursion === "YES").length, // Check for 'YES' string
        assetDamage: incidents.filter(
          (i) =>
            i.propertyDamage === true ||
            i.propertyDamage === "yes" ||
            i.propertyDamage === "Yes",
        ).length,
        recentIncidents: incidents.slice(0, 10).map((incident) => ({
          type: incident.incidentType || "Unknown",
          location: incident.markerPost || incident.section || "Unknown",
          time: incident.createdAt,
          status: incident.status || "Resolved",
        })),
        ...this.calcAverageTimes(incidents),
      };

      return stats;
    } catch (error) {
      throw new AppError(
        "Failed to fetch scheme stats",
        "client-data/stats-error",
        error,
      );
    }
  }

  // Helper function to calculate time difference between two time fields and group by ranges
  // Takes two time fields (in HH:MM format) and calculates the difference in minutes
  groupByTimeDifference(data, startTimeField, endTimeField) {
    const ranges = {
      "Under 10": 0,
      "10-20": 0,
      "20-30": 0,
      "30-45": 0,
      "45-1 hour": 0,
      "Over 1 hour": 0,
    };

    data.forEach((item) => {
      const startTime = item[startTimeField];
      const endTime = item[endTimeField];

      // Both times must exist
      if (startTime && endTime && startTime !== "" && endTime !== "") {
        // Convert time strings (HH:MM) to minutes since midnight
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);

        if (startMinutes !== null && endMinutes !== null) {
          // Calculate difference
          let diffMinutes = endMinutes - startMinutes;

          // Handle case where end time is past midnight
          if (diffMinutes < 0) {
            diffMinutes += 24 * 60; // Add 24 hours
          }

          // Group by ranges
          if (diffMinutes > 0) {
            if (diffMinutes < 10) ranges["Under 10"]++;
            else if (diffMinutes < 20) ranges["10-20"]++;
            else if (diffMinutes < 30) ranges["20-30"]++;
            else if (diffMinutes < 45) ranges["30-45"]++;
            else if (diffMinutes < 60) ranges["45-1 hour"]++;
            else ranges["Over 1 hour"]++;
          }
        }
      }
    });

    return ranges;
  }

  // Helper function to convert time string (HH:MM) to minutes since midnight
  timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return null;

    const parts = timeStr.split(":");
    if (parts.length !== 2) return null;

    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);

    if (isNaN(hours) || isNaN(minutes)) return null;

    return hours * 60 + minutes;
  }

  // Helper function to group pre-calculated time fields (e.g., "25 mins", "65 mins")
  // This matches the logic used in admin ClientChartsPage.jsx
  groupByCalculatedTime(data, field) {
    // Determine which bucket ranges to use based on the field
    const isTimeToSite = field === "timeSpottedToOn";

    const ranges = isTimeToSite
      ? { "0-5": 0, "6-10": 0, "11-15": 0, "16-20": 0, "20+": 0 }
      : { "0-15": 0, "16-30": 0, "31-45": 0, "46-60": 0, "60+": 0 };

    data.forEach((item) => {
      const timeValue = item[field];

      // Parse the pre-calculated time string (e.g., "25 mins" -> 25)
      if (timeValue) {
        const match = timeValue.match(/(\d+)/);
        if (match) {
          const mins = parseInt(match[1]);

          if (isTimeToSite) {
            // Time to Site buckets
            if (mins <= 5) ranges["0-5"]++;
            else if (mins <= 10) ranges["6-10"]++;
            else if (mins <= 15) ranges["11-15"]++;
            else if (mins <= 20) ranges["16-20"]++;
            else ranges["20+"]++;
          } else {
            // Time to Recover buckets
            if (mins <= 15) ranges["0-15"]++;
            else if (mins <= 30) ranges["16-30"]++;
            else if (mins <= 45) ranges["31-45"]++;
            else if (mins <= 60) ranges["46-60"]++;
            else ranges["60+"]++;
          }
        }
      }
    });

    return ranges;
  }

  calcAverageTimes(incidents) {
    const parse = (val) => {
      if (val == null || val === "") return null;
      // already a number
      if (typeof val === "number") return isFinite(val) ? Math.round(val) : null;
      // string like "8 mins", "8", "08:30" — extract first integer
      const m = String(val).match(/(\d+)/);
      return m ? parseInt(m[1]) : null;
    };
    const avg = (values) =>
      values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

    const toSite = incidents.map((i) => parse(i.timeSpottedToOn)).filter((v) => v !== null);
    const toRecover = incidents.map((i) => parse(i.timeOnsiteToCleared)).filter((v) => v !== null);

    console.log("avgTimeToSite raw values:", toSite);
    console.log("avgTimeToRecover raw values:", toRecover);

    return { avgTimeToSite: avg(toSite), avgTimeToRecover: avg(toRecover) };
  }

  // Helper function to group time data by ranges (legacy - for backward compatibility)
  // Converts time strings (HH:MM format) to minutes and groups them
  groupByTimeRange(data, field) {
    const ranges = {
      "Under 10": 0,
      "10-20": 0,
      "20-30": 0,
      "30-45": 0,
      "45-1 hour": 0,
      "Over 1 hour": 0,
    };

    data.forEach((item) => {
      const timeValue = item[field];
      if (timeValue !== undefined && timeValue !== null && timeValue !== "") {
        let minutes = 0;

        // If it's a number, use it directly
        if (typeof timeValue === "number") {
          minutes = timeValue;
        }
        // If it's a time string like "HH:MM", convert to minutes
        else if (typeof timeValue === "string" && timeValue.includes(":")) {
          const [hours, mins] = timeValue.split(":").map(Number);
          minutes = hours * 60 + (mins || 0);
        }
        // If it's just a string number
        else if (typeof timeValue === "string") {
          minutes = parseInt(timeValue) || 0;
        }

        // Group by ranges
        if (minutes > 0) {
          if (minutes < 10) ranges["Under 10"]++;
          else if (minutes < 20) ranges["10-20"]++;
          else if (minutes < 30) ranges["20-30"]++;
          else if (minutes < 45) ranges["30-45"]++;
          else if (minutes < 60) ranges["45-1 hour"]++;
          else ranges["Over 1 hour"]++;
        }
      }
    });

    return ranges;
  }

  // Helper function to group data by field
  groupByField(data, field) {
    const grouped = {};
    data.forEach((item) => {
      const value = item[field] || "Unknown";
      grouped[value] = (grouped[value] || 0) + 1;
    });
    return grouped;
  }

  // Helper function to group data by array field (like affectedLanes, emergencyServices)
  groupByFieldArray(data, field) {
    const grouped = {};
    data.forEach((item) => {
      const values = item[field];
      if (Array.isArray(values) && values.length > 0) {
        values.forEach((value) => {
          grouped[value] = (grouped[value] || 0) + 1;
        });
      }
    });
    return grouped;
  }

  // Helper to extract vehicle types from vehicles array
  groupVehicleTypes(data) {
    const grouped = {};
    data.forEach((item) => {
      const vehicles = item.vehicles;
      if (Array.isArray(vehicles) && vehicles.length > 0) {
        vehicles.forEach((vehicle) => {
          if (vehicle.type) {
            grouped[vehicle.type] = (grouped[vehicle.type] || 0) + 1;
          }
        });
      }
    });
    return grouped;
  }

  // Helper to group vehicles dispatched from recoveryRequested object
  groupVehiclesDispatched(data) {
    const totals = {
      Light: 0,
      Heavy: 0,
      IPV: 0,
      HETOS: 0,
    };

    data.forEach((item) => {
      const recovery = item.recoveryRequested;
      if (recovery && typeof recovery === "object") {
        totals.Light += recovery.light || 0;
        totals.Heavy += recovery.heavy || 0;
        totals.IPV += recovery.ipv || 0;
        totals.HETOS += recovery.hetos || 0;
      }
    });

    return totals;
  }

  // Calculate total vehicles dispatched
  calculateVehiclesDispatched(data) {
    let total = 0;
    data.forEach((item) => {
      const recovery = item.recoveryRequested;
      if (recovery && typeof recovery === "object") {
        total +=
          (recovery.light || 0) +
          (recovery.heavy || 0) +
          (recovery.ipv || 0) +
          (recovery.hetos || 0);
      }
    });
    return total;
  }

  // Get CCTV uptime statistics
  async getCCTVUptime(schemeId) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const cctvRef = collection(db, "cctvCheckForms");
      const q = query(
        cctvRef,
        where("schemeIds", "array-contains", schemeId),
        where("createdAt", ">=", Timestamp.fromDate(thirtyDaysAgo)),
      );

      const querySnapshot = await getDocs(q);
      const checks = querySnapshot.docs.map((doc) => doc.data());

      if (checks.length === 0) {
        return { uptime: 0, totalChecks: 0 };
      }

      const workingChecks = checks.filter(
        (check) => check.status === "operational" || check.allWorking === true,
      );
      const uptime = ((workingChecks.length / checks.length) * 100).toFixed(1);

      return {
        uptime: parseFloat(uptime),
        totalChecks: checks.length,
        workingChecks: workingChecks.length,
      };
    } catch (error) {
      console.error("Failed to fetch CCTV uptime:", error);
      return { uptime: 0, totalChecks: 0 };
    }
  }

  // Get time-series data for charts
  async getTimeSeriesData(schemeId, days = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const incidentsRef = collection(db, "incidentReports");
      const q = query(
        incidentsRef,
        where("schemeIds", "array-contains", schemeId),
        where("createdAt", ">=", Timestamp.fromDate(startDate)),
        orderBy("createdAt", "asc"),
      );

      const querySnapshot = await getDocs(q);
      const incidents = querySnapshot.docs.map((doc) => doc.data());

      // Group by week
      const weeklyData = {};
      incidents.forEach((incident) => {
        const date = incident.createdAt.toDate();
        const weekKey = `Week ${this.getWeekNumber(date)}`;

        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
      });

      return Object.entries(weeklyData).map(([name, count]) => ({
        name,
        count,
      }));
    } catch (error) {
      console.error("Failed to fetch time series data:", error);
      return [];
    }
  }

  // Helper: Get week start date
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  // Helper: Get week number
  getWeekNumber(date) {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // Get aggregated statistics for a scheme by date range
  async getSchemeStatsByDateRange(schemeId, startDateStr, endDateStr) {
    try {
      // Convert date strings (YYYY-MM-DD) to Date objects
      const startDate = new Date(startDateStr);
      startDate.setHours(0, 0, 0, 0); // Start of day

      const endDate = new Date(endDateStr);
      endDate.setHours(23, 59, 59, 999); // End of day

      // Get recent incidents
      const incidentsRef = collection(db, "incidentReports");
      let incidents = [];

      try {
        // Try compound query with date range (requires index)
        const incidentsQuery = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          where("createdAt", ">=", Timestamp.fromDate(startDate)),
          where("createdAt", "<=", Timestamp.fromDate(endDate)),
        );
        const incidentsSnapshot = await getDocs(incidentsQuery);
        incidents = incidentsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log(
          `Found ${incidents.length} incidents for scheme ${schemeId} in date range`,
        );
      } catch (indexError) {
        // If index doesn't exist, fall back to fetching all and filtering in memory
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          console.warn(
            "Index not available for date range query, filtering in memory",
          );
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
          );
          const snapshot = await getDocs(simpleQuery);
          const allIncidents = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          // Filter by date range in memory
          incidents = allIncidents.filter((incident) => {
            if (!incident.createdAt) return false;
            const incidentDate = incident.createdAt.toDate();
            return incidentDate >= startDate && incidentDate <= endDate;
          });
          console.log(
            `Filtered ${incidents.length} incidents from ${allIncidents.length} total for scheme ${schemeId}`,
          );
        } else {
          throw indexError;
        }
      }

      // Calculate statistics (same as getSchemeStats)
      const stats = {
        totalIncidents: incidents.filter(
          (i) =>
            i.incidentType !== "Free Recovery" &&
            i.incidentType !== "Drive Off" &&
            i.incursion !== "YES",
        ).length,
        incidentsByType: this.groupByField(incidents, "incidentType"),
        incidentsByLane: this.groupByFieldArray(incidents, "affectedLanes"),
        vehiclesDispatched: this.calculateVehiclesDispatched(incidents),
        spottedBy: this.groupByField(incidents, "reportedBy"),
        faultTypes: this.groupByField(incidents, "fault"),
        vehicleTypes: this.groupVehicleTypes(incidents),
        vehicleTypesDispatched: this.groupVehiclesDispatched(incidents),
        trafficConditions: this.groupByField(incidents, "trafficConditions"),
        trackOfIncident: this.groupByField(incidents, "track"),
        emergencyServices: this.groupByFieldArray(
          incidents,
          "emergencyServices",
        ),
        timeToRecover: this.groupByCalculatedTime(
          incidents,
          "timeOnsiteToCleared",
        ),
        timeToSite: this.groupByCalculatedTime(incidents, "timeSpottedToOn"),
        incursions: incidents.filter((i) => i.incursion === "YES").length,
        assetDamage: incidents.filter(
          (i) =>
            i.propertyDamage === true ||
            i.propertyDamage === "yes" ||
            i.propertyDamage === "Yes",
        ).length,
        recentIncidents: incidents.slice(0, 10).map((incident) => ({
          type: incident.incidentType || "Unknown",
          location: incident.markerPost || incident.section || "Unknown",
          time: incident.createdAt,
          status: incident.status || "Resolved",
        })),
        ...this.calcAverageTimes(incidents),
      };

      return { ...stats, incidents };
    } catch (error) {
      throw new AppError(
        "Failed to fetch scheme stats by date range",
        "client-data/stats-error",
        error,
      );
    }
  }

  // Get time series data by date range
  async getTimeSeriesDataByDateRange(schemeId, startDateStr, endDateStr) {
    try {
      // Convert date strings (YYYY-MM-DD) to Date objects
      const startDate = new Date(startDateStr);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(endDateStr);
      endDate.setHours(23, 59, 59, 999);

      const incidentsRef = collection(db, "incidentReports");
      let incidents = [];

      try {
        // Try compound query with date range and ordering (requires index)
        const q = query(
          incidentsRef,
          where("schemeIds", "array-contains", schemeId),
          where("createdAt", ">=", Timestamp.fromDate(startDate)),
          where("createdAt", "<=", Timestamp.fromDate(endDate)),
          orderBy("createdAt", "asc"),
        );
        const querySnapshot = await getDocs(q);
        incidents = querySnapshot.docs.map((doc) => doc.data());
      } catch (indexError) {
        // If index doesn't exist, fall back to fetching all and filtering in memory
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          console.warn(
            "Index not available for time series query, filtering in memory",
          );
          const simpleQuery = query(
            incidentsRef,
            where("schemeIds", "array-contains", schemeId),
          );
          const snapshot = await getDocs(simpleQuery);
          const allIncidents = snapshot.docs.map((doc) => doc.data());

          // Filter by date range and sort in memory
          incidents = allIncidents
            .filter((incident) => {
              if (!incident.createdAt) return false;
              const incidentDate = incident.createdAt.toDate();
              return incidentDate >= startDate && incidentDate <= endDate;
            })
            .sort((a, b) => {
              const timeA = a.createdAt?.seconds || 0;
              const timeB = b.createdAt?.seconds || 0;
              return timeA - timeB;
            });
        } else {
          throw indexError;
        }
      }

      // Group by month (e.g., "January 2026")
      const monthlyData = {};
      const monthOrder = []; // Track order of months for sorting
      incidents.forEach((incident) => {
        const date = incident.createdAt.toDate();
        const monthKey = date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = 0;
          monthOrder.push({
            key: monthKey,
            date: new Date(date.getFullYear(), date.getMonth(), 1),
          });
        }
        monthlyData[monthKey]++;
      });

      // Sort by date and return
      monthOrder.sort((a, b) => a.date - b.date);
      return monthOrder.map(({ key }) => ({
        name: key,
        count: monthlyData[key],
      }));
    } catch (error) {
      console.error("Failed to fetch time series data by date range:", error);
      return [];
    }
  }

  // Get all reports for a specific scheme (combines all report types)
  async getAllReports(schemeId) {
    try {
      // Fetch each report type separately with error handling
      const incidents = await this.getSchemeIncidents(schemeId).catch((err) => {
        console.error("Failed to fetch incidents:", err);
        return [];
      });

      const assetDamage = await this.getSchemeAssetDamage(schemeId).catch(
        (err) => {
          console.error("Failed to fetch asset damage:", err);
          return [];
        },
      );

      const cctvChecks = await this.getSchemeCCTVChecks(schemeId).catch(
        (err) => {
          console.error("Failed to fetch CCTV checks:", err);
          return [];
        },
      );

      // Transform and combine all reports
      const allReports = [
        ...incidents.map((report) => ({
          ...report,
          reportType: "incident",
          type: report.incidentType,
          timestamp: report.createdAt,
        })),
        ...assetDamage.map((report) => ({
          ...report,
          reportType: "asset-damage",
          type: report.damageType,
          timestamp: report.createdAt,
        })),
        ...cctvChecks.map((report) => ({
          ...report,
          reportType: "cctv-check",
          title: "CCTV Check",
          timestamp: report.createdAt,
        })),
      ];

      // Sort by timestamp (newest first)
      return allReports.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
    } catch (error) {
      console.error("Error in getAllReports:", error);
      throw new AppError(
        "Failed to fetch all reports",
        "client-data/reports-error",
        error,
      );
    }
  }

  // Get all reports with server-side pagination (COST-OPTIMIZED!)
  // Fetches reports from all collections and merges them with cursor-based pagination
  async getAllReportsPaginated(schemeId, pageSize = 10, cursors = {}, dateRange = null) {
    try {
      // Fetch pageSize from each type so the merged result is truly chronological
      const perTypeLimit = pageSize;

      // Fetch with cursors
      const [incidents, assetDamage, cctvChecks] =
        await Promise.all([
          this.fetchPaginatedCollection(
            "incidentReports",
            schemeId,
            perTypeLimit,
            cursors.incidents,
            null,
            dateRange,
          ),
          this.fetchPaginatedCollection(
            "assetDamageReports",
            schemeId,
            perTypeLimit,
            cursors.assetDamage,
            null,
            dateRange,
          ),
          this.fetchPaginatedCollection(
            "cctvCheckForms",
            schemeId,
            perTypeLimit,
            cursors.cctvChecks,
            null,
            dateRange,
          ),
        ]);

      // Transform and combine all reports — tag each with source for cursor tracking
      const allReports = [
        ...incidents.docs.map((report) => ({
          ...report,
          reportType: "incident",
          _source: "incidents",
          type: report.incidentType,
          timestamp: report.createdAt,
        })),
        ...assetDamage.docs.map((report) => ({
          ...report,
          reportType: "asset-damage",
          _source: "assetDamage",
          type: report.damageType,
          timestamp: report.createdAt,
        })),
        ...cctvChecks.docs.map((report) => ({
          ...report,
          reportType: "cctv-check",
          _source: "cctvChecks",
          title: "CCTV Check",
          timestamp: report.createdAt,
        })),
      ];

      // Sort by timestamp and take only pageSize items
      const sortedReports = allReports
        .sort((a, b) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          return timeB - timeA;
        })
        .slice(0, pageSize);

      // Only advance cursors for collections that had docs included in the final slice.
      // This prevents skipping unseen docs from collections that were fetched but not displayed.
      const newCursors = { ...cursors };
      sortedReports.forEach((report) => {
        if (report._firestoreDoc) {
          newCursors[report._source] = report._firestoreDoc;
        }
      });

      // Clean internal tracking fields before returning
      const cleanReports = sortedReports.map(
        ({ _source, _firestoreDoc, ...rest }) => rest,
      );

      return {
        reports: cleanReports,
        cursors: newCursors,
        hasMore:
          incidents.hasMore ||
          assetDamage.hasMore ||
          cctvChecks.hasMore,
      };
    } catch (error) {
      console.error("Error in getAllReportsPaginated:", error);
      throw new AppError(
        "Failed to fetch paginated reports",
        "client-data/reports-error",
        error,
      );
    }
  }

  // Helper method to fetch paginated documents from a collection
  async fetchPaginatedCollection(
    collectionName,
    schemeId,
    limitCount,
    lastDoc,
    extraWhere = null,
    dateRange = null, // { startDate: Date, endDate: Date }
  ) {
    try {
      const collectionRef = collection(db, collectionName);
      let q;

      const baseConstraints = [
        where("schemeIds", "array-contains", schemeId),
        ...(extraWhere
          ? [where(extraWhere.field, extraWhere.op, extraWhere.value)]
          : []),
        ...(dateRange
          ? [
              where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate)),
              where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate)),
            ]
          : []),
        orderBy("createdAt", "desc"),
      ];

      if (lastDoc) {
        q = query(
          collectionRef,
          ...baseConstraints,
          startAfter(lastDoc),
          limit(limitCount),
        );
      } else {
        q = query(collectionRef, ...baseConstraints, limit(limitCount));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        _firestoreDoc: doc, // Keep raw snapshot for cursor tracking
      }));

      return {
        docs,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === limitCount,
      };
    } catch (error) {
      // If index error, fall back to a query without orderBy
      // startAfter still works without orderBy (uses doc ID order), so pagination is preserved.
      // Docs are sorted in memory per page. Order across pages won't be perfectly chronological
      // until the composite index is deployed, but navigation will work correctly.
      if (
        error.code === "failed-precondition" ||
        error.message?.includes("index")
      ) {
        console.warn(
          `Index not available for ${collectionName}, using fallback (deploy indexes to fix ordering)`,
        );
        const collRef = collection(db, collectionName);
        const fallbackQuery = lastDoc
          ? query(
              collRef,
              where("schemeIds", "array-contains", schemeId),
              startAfter(lastDoc),
              limit(limitCount),
            )
          : query(
              collRef,
              where("schemeIds", "array-contains", schemeId),
              limit(limitCount),
            );

        const snapshot = await getDocs(fallbackQuery);
        const docs = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data(), _firestoreDoc: doc }))
          .sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
          );

        return {
          docs,
          lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
          hasMore: snapshot.docs.length === limitCount,
        };
      }
      console.error(`Error fetching from ${collectionName}:`, error);
      return { docs: [], lastDoc: null, hasMore: false };
    }
  }

  // Get total count of all reports for a scheme (for pagination display)
  async getAllReportsCount(schemeId) {
    try {
      const [incidentCount, assetCount, cctvCount] = await Promise.all([
        this.getCollectionCount("incidentReports", schemeId),
        this.getCollectionCount("assetDamageReports", schemeId),
        this.getCollectionCount("cctvCheckForms", schemeId),
      ]);

      return incidentCount + assetCount + cctvCount;
    } catch (error) {
      console.warn("Could not get total reports count:", error);
      return 0;
    }
  }

  // CCTV-specific paginated fetch: runs TWO separate array-contains queries and merges them.
  // This avoids array-contains-any + orderBy (which needs a composite index that may not exist).
  // Query 1: forms explicitly tagged with schemeId (forms with faults for this scheme)
  // Query 2: forms tagged "all-schemes" (backward-compat clean-check forms from before the fix)
  async getCCTVReportsPaginated(schemeId, pageSize, cursors) {
    const cctvRef = collection(db, "cctvCheckForms");
    const specificCursor = cursors?.specific ?? null;
    const allSchemesCursor = cursors?.allSchemes ?? null;

    const buildQ = (value, cursor) =>
      cursor
        ? query(
            cctvRef,
            where("schemeIds", "array-contains", value),
            orderBy("createdAt", "desc"),
            startAfter(cursor),
            limit(pageSize),
          )
        : query(
            cctvRef,
            where("schemeIds", "array-contains", value),
            orderBy("createdAt", "desc"),
            limit(pageSize),
          );

    // Run each query independently so one failing doesn't block the other
    const fetchSafe = async (q) => {
      try {
        return await getDocs(q);
      } catch {
        return { docs: [] };
      }
    };

    const [snap1, snap2] = await Promise.all([
      fetchSafe(buildQ(schemeId, specificCursor)),
      fetchSafe(buildQ("all-schemes", allSchemesCursor)),
    ]);

    // Merge, deduplicate (same form could theoretically match both), sort newest first
    const seen = new Set();
    const merged = [...snap1.docs, ...snap2.docs]
      .filter((d) => !seen.has(d.id) && seen.add(d.id))
      .map((d) => ({
        id: d.id,
        ...d.data(),
        reportType: "cctv-check",
        title: "CCTV Check",
        timestamp: d.data().createdAt,
      }))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
      .slice(0, pageSize);

    return {
      reports: merged,
      lastDoc: {
        specific:
          snap1.docs?.length > 0
            ? snap1.docs[snap1.docs.length - 1]
            : specificCursor,
        allSchemes:
          snap2.docs?.length > 0
            ? snap2.docs[snap2.docs.length - 1]
            : allSchemesCursor,
      },
      hasMore:
        snap1.docs?.length === pageSize || snap2.docs?.length === pageSize,
    };
  }

  // Get reports for a single type with true server-side pagination
  // Used when a type filter is active (fetches 10 of that type, not 10 mixed)
  async getReportsByTypePaginated(
    schemeId,
    reportType,
    pageSize = 10,
    lastDoc = null,
    extraWhere = null, // { field, op, value } for server-side sub-filters
    dateRange = null, // { startDate: Date, endDate: Date }
  ) {
    // CCTV uses a dual-query approach to include both scheme-specific and "all-schemes" forms
    if (reportType === "cctv-check") {
      return await this.getCCTVReportsPaginated(schemeId, pageSize, lastDoc);
    }

    const collectionMap = {
      incident: "incidentReports",
      "asset-damage": "assetDamageReports",
    };
    const collectionName = collectionMap[reportType];
    if (!collectionName) return { reports: [], lastDoc: null, hasMore: false };

    try {
      const result = await this.fetchPaginatedCollection(
        collectionName,
        schemeId,
        pageSize,
        lastDoc,
        extraWhere,
        dateRange,
      );
      const reports = result.docs.map((report) => {
        if (reportType === "incident")
          return {
            ...report,
            reportType: "incident",
            type: report.incidentType,
            timestamp: report.createdAt,
          };
        if (reportType === "asset-damage")
          return {
            ...report,
            reportType: "asset-damage",
            type: report.damageType,
            timestamp: report.createdAt,
          };
        return { ...report, reportType, timestamp: report.createdAt };
      });
      return { reports, lastDoc: result.lastDoc, hasMore: result.hasMore };
    } catch (error) {
      console.error("Error fetching typed reports:", error);
      return { reports: [], lastDoc: null, hasMore: false };
    }
  }

  // Get count per report type for a scheme (for stat cards - 4 reads total)
  async getAllReportsCountByType(schemeId, dateRange = null) {
    try {
      const [
        incidentCount,
        assetCount,
        cctvCount,
        freeRecoveryCount,
        driveOffCount,
        incursionsCount,
        vehiclesDispatchedCount,
        incidentAssetDamageCount,
        pureIncidentCount,
      ] = await Promise.all([
        this.getCollectionCount("incidentReports", schemeId, dateRange),
        this.getCollectionCount("assetDamageReports", schemeId, dateRange),
        this.getCollectionCount("cctvCheckForms", schemeId, dateRange),
        this.getCollectionCountWithFilter(
          "incidentReports",
          schemeId,
          "incidentType",
          "Free Recovery",
          dateRange,
        ),
        this.getCollectionCountWithFilter(
          "incidentReports",
          schemeId,
          "incidentType",
          "Drive Off",
          dateRange,
        ),
        this.getCollectionCountWithFilter(
          "incidentReports",
          schemeId,
          "incursion",
          "YES",
          dateRange,
        ),
        this.getVehiclesDispatchedCount(schemeId),
        this.getCollectionCountWithFilter(
          "incidentReports",
          schemeId,
          "propertyDamage",
          true,
          dateRange,
        ),
        this.getPureIncidentCount(schemeId, dateRange),
      ]);

      return {
        incident: incidentCount, // raw total — used by filter dropdown
        pureIncident: pureIncidentCount, // exact pure count — used by Incidents card
        assetDamage: assetCount,
        cctvCheck: cctvCount,
        freeRecovery: freeRecoveryCount,
        driveOff: driveOffCount,
        incursions: incursionsCount,
        vehiclesDispatched: vehiclesDispatchedCount,
        incidentAssetDamage: incidentAssetDamageCount,
        total: incidentCount + assetCount + cctvCount,
      };
    } catch (error) {
      console.warn("Could not get reports count by type:", error);
      return {
        incident: 0,
        pureIncident: 0,
        assetDamage: 0,
        cctvCheck: 0,
        freeRecovery: 0,
        driveOff: 0,
        incursions: 0,
        vehiclesDispatched: 0,
        incidentAssetDamage: 0,
        total: 0,
      };
    }
  }

  // Count pure incidents using the isPureIncident field written at submit/edit time.
  // Simple equality query — 1 read, no complex filtering needed.
  async getPureIncidentCount(schemeId, dateRange = null) {
    try {
      const constraints = [
        where("schemeIds", "array-contains", schemeId),
        where("isPureIncident", "==", true),
        ...(dateRange
          ? [
              where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate)),
              where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate)),
            ]
          : []),
      ];
      const q = query(collection(db, "incidentReports"), ...constraints);
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      const indexLink = error.message?.match(/https:\/\/console\.firebase\.google\.com\S+/)?.[0];
      if (indexLink) {
        console.log("Create missing Firestore index for Incidents card:", indexLink);
      } else {
        console.warn("Pure incident count unavailable:", error.message);
      }
      return 0;
    }
  }

  async getVehiclesDispatchedCount(schemeId) {
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const statsRef = doc(db, "schemeStats", schemeId);
      const snapshot = await getDoc(statsRef);
      return snapshot.exists()
        ? snapshot.data().totalVehiclesDispatched || 0
        : 0;
    } catch (error) {
      console.warn("Could not get vehicles dispatched count:", error);
      return 0;
    }
  }

  async getCollectionCountWithFilter(collectionName, schemeId, field, value, dateRange = null) {
    try {
      const collectionRef = collection(db, collectionName);
      const constraints = [
        where("schemeIds", "array-contains", schemeId),
        where(field, "==", value),
        ...(dateRange
          ? [
              where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate)),
              where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate)),
            ]
          : []),
      ];
      const q = query(collectionRef, ...constraints);
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.warn(
        `Could not get filtered count for ${collectionName}:`,
        error,
      );
      return 0;
    }
  }

  // Helper to get count from a collection
  async getCollectionCount(collectionName, schemeId, dateRange = null) {
    try {
      const collectionRef = collection(db, collectionName);
      // For cctvCheckForms, also count "all-schemes" docs (backward compatibility)
      const schemeFilter =
        collectionName === "cctvCheckForms"
          ? where("schemeIds", "array-contains-any", [schemeId, "all-schemes"])
          : where("schemeIds", "array-contains", schemeId);
      const dateConstraints = dateRange
        ? [
            where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate)),
            where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate)),
          ]
        : [];
      const q = query(collectionRef, schemeFilter, ...dateConstraints);
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.warn(`Could not get count for ${collectionName}:`, error);
      return 0;
    }
  }

  // Get asset damage reports for a specific scheme
  async getSchemeAssetDamage(schemeId, limitCount = 100) {
    try {
      const damageRef = collection(db, "assetDamageReports");

      try {
        const q = query(
          damageRef,
          where("schemeIds", "array-contains", schemeId),
          orderBy("createdAt", "desc"),
          limit(limitCount),
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (indexError) {
        // Check if it's an index error or permissions error
        if (
          indexError.code === "failed-precondition" ||
          indexError.message?.includes("index")
        ) {
          console.warn(
            "Index not available for assetDamageReports, trying simplified query",
          );
          const simpleQuery = query(
            damageRef,
            where("schemeIds", "array-contains", schemeId),
            limit(limitCount),
          );
          const snapshot = await getDocs(simpleQuery);
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          return docs.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
        }
        throw indexError;
      }
    } catch (error) {
      console.error("Error fetching asset damage:", error);
      throw new AppError(
        "Failed to fetch asset damage reports",
        "client-data/fetch-error",
        error,
      );
    }
  }

  // Get CCTV recordings for a specific scheme — pulls from incidentReports with video/image files
  async getCCTVRecordings(schemeId) {
    try {
      const reportsRef = collection(db, "incidentReports");

      // Two queries cover both the new `schemeIds` array and the legacy
      // single-string `schemeId`. The `hasVideo == true` filter means Firestore
      // returns ONLY reports that actually have a video — reads scale with the
      // number of recordings, not with total incidents. Requires the composite
      // indexes in firestore.indexes.json and a one-time backfill of the
      // hasVideo flag on existing reports (admin → Backfill hasVideo).
      const [arrSnapshot, legacySnapshot] = await Promise.all([
        getDocs(
          query(
            reportsRef,
            where("schemeIds", "array-contains", schemeId),
            where("hasVideo", "==", true),
            orderBy("createdAt", "desc"),
          ),
        ),
        getDocs(
          query(
            reportsRef,
            where("schemeId", "==", schemeId),
            where("hasVideo", "==", true),
            orderBy("createdAt", "desc"),
          ),
        ),
      ]);

      const byId = new Map();
      [...arrSnapshot.docs, ...legacySnapshot.docs].forEach((d) => {
        if (!byId.has(d.id)) {
          byId.set(d.id, { id: d.id, ...d.data(), dateTime: d.data().createdAt });
        }
      });

      // Only return reports that have video files (detected by MIME *or* file
      // extension), strip out non-video files, then sort newest-first.
      return [...byId.values()]
        .map((doc) => ({
          ...doc,
          files: (doc.files || []).filter(isVideoFile),
        }))
        .filter((doc) => doc.files.length > 0)
        .sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
    } catch (error) {
      console.error("Error fetching CCTV recordings:", error);
      throw new AppError(
        "Failed to fetch CCTV recordings",
        "client-data/recordings-error",
        error,
      );
    }
  }

  // Search across all report collections by referenceId prefix.
  // Uses a Firestore range query (>= / <= \uf8ff) on the auto-indexed referenceId
  // field — no composite indexes needed. Scheme filtering is done client-side on
  // the small result set returned by the prefix match.
  async searchReportsByReferenceId(schemeId, searchTerm, filterType = null) {
    const raw = searchTerm.trim();
    if (!raw) return [];
    const termRef = raw.toUpperCase();
    const termName = raw;
    const termRefEnd = termRef + "\uf8ff";
    const termNameEnd = termName + "\uf8ff";

    const ALL_COLLECTIONS = [
      { name: "incidentReports", type: "incident", typeField: "incidentType" },
      {
        name: "assetDamageReports",
        type: "asset-damage",
        typeField: "damageType",
      },
      { name: "cctvCheckForms", type: "cctv-check", typeField: null },
    ];

    // Scope to the active filter type — avoids querying all collections when unnecessary
    const typeToCollection = {
      incident: "incidentReports",
      "asset-damage": "assetDamageReports",
      "cctv-check": "cctvCheckForms",
    };
    const COLLECTIONS = filterType && typeToCollection[filterType]
      ? ALL_COLLECTIONS.filter((c) => c.name === typeToCollection[filterType])
      : ALL_COLLECTIONS;

    // Run referenceId and submittedBy.name queries in parallel.
    // schemeIds filter is included so Firestore only scans this scheme's docs.
    // Requires composite indexes: schemeIds (array-contains) + referenceId / submittedBy.name
    const [refSnapshots, nameSnapshots] = await Promise.all([
      Promise.all(
        COLLECTIONS.map(({ name }) =>
          getDocs(
            query(
              collection(db, name),
              where("schemeIds", "array-contains", schemeId),
              where("referenceId", ">=", termRef),
              where("referenceId", "<=", termRefEnd),
              limit(10),
            ),
          ).catch(() =>
            getDocs(
              query(
                collection(db, name),
                where("referenceId", ">=", termRef),
                where("referenceId", "<=", termRefEnd),
                limit(10),
              ),
            ),
          ),
        ),
      ),
      Promise.all(
        COLLECTIONS.map(({ name }) =>
          getDocs(
            query(
              collection(db, name),
              where("schemeIds", "array-contains", schemeId),
              where("submittedBy.name", ">=", termName),
              where("submittedBy.name", "<=", termNameEnd),
              limit(10),
            ),
          ).catch(() =>
            getDocs(
              query(
                collection(db, name),
                where("submittedBy.name", ">=", termName),
                where("submittedBy.name", "<=", termNameEnd),
                limit(10),
              ),
            ),
          ),
        ),
      ),
    ]);

    const seen = new Set();
    const results = [];

    const addDocs = (snapshots) => {
      snapshots.forEach((snap, i) => {
        const { type, typeField } = COLLECTIONS[i];
        snap.docs.forEach((d) => {
          if (seen.has(d.id)) return;
          const data = d.data();
          // Filter by scheme client-side
          const inScheme =
            (Array.isArray(data.schemeIds) &&
              data.schemeIds.includes(schemeId)) ||
            data.schemeId === schemeId;
          if (!inScheme) return;
          seen.add(d.id);
          results.push({
            id: d.id,
            ...data,
            reportType: type,
            type: typeField ? data[typeField] : data.type,
            timestamp: data.createdAt,
          });
        });
      });
    };

    addDocs(refSnapshots);
    addDocs(nameSnapshots);

    // Sort newest first, cap to 10
    results.sort(
      (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    );
    return results.slice(0, 10);
  }

  async searchReportsPaginated(schemeId, searchTerm, pageSize = 10, lastDocs = {}, filterType = null) {
    const raw = searchTerm.trim();
    if (!raw) return { results: [], lastDocs: {}, hasMore: false };
    if (raw.length > 100) return { results: [], lastDocs: {}, hasMore: false };

    const termRef = raw.toUpperCase();
    const termName = raw;
    const termRefEnd = termRef + "";
    const termNameEnd = termName + "";

    const ALL_COLLECTIONS = [
      { name: "incidentReports",        key: "incident",        type: "incident",         typeField: "incidentType" },
      { name: "assetDamageReports",     key: "assetDamage",     type: "asset-damage",     typeField: "damageType"   },
      { name: "cctvCheckForms",         key: "cctvCheck",       type: "cctv-check",       typeField: null           },
    ];

    const typeToCollection = {
      incident: "incidentReports",
      "asset-damage": "assetDamageReports",
      "cctv-check": "cctvCheckForms",
    };
    const COLLECTIONS = filterType && typeToCollection[filterType]
      ? ALL_COLLECTIONS.filter((c) => c.name === typeToCollection[filterType])
      : ALL_COLLECTIONS;

    const fetchLimit = pageSize + 1;

    const buildQuery = (collName, field, start, end, cursor) => {
      const tryWithScheme = async () => {
        const constraints = [
          where("schemeIds", "array-contains", schemeId),
          where(field, ">=", start),
          where(field, "<=", end),
          orderBy(field, "asc"),
        ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(fetchLimit));
        return getDocs(query(collection(db, collName), ...constraints));
      };
      const tryWithoutScheme = async () => {
        const constraints = [
          where(field, ">=", start),
          where(field, "<=", end),
          orderBy(field, "asc"),
        ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(fetchLimit));
        return getDocs(query(collection(db, collName), ...constraints));
      };
      return tryWithScheme().catch(() => tryWithoutScheme());
    };

    const perCollectionResults = await Promise.all(
      COLLECTIONS.map(async ({ name, key, type, typeField }) => {
        const cursor = lastDocs[key] || null;
        const [refSnap, nameSnap] = await Promise.all([
          buildQuery(name, "referenceId",      termRef,  termRefEnd,  cursor),
          buildQuery(name, "submittedBy.name", termName, termNameEnd, cursor),
        ]);

        const seen = new Set();
        const docs = [];
        for (const snap of [refSnap, nameSnap]) {
          for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            const data = d.data();
            const inScheme =
              (Array.isArray(data.schemeIds) && data.schemeIds.includes(schemeId)) ||
              data.schemeId === schemeId;
            if (!inScheme) continue;
            seen.add(d.id);
            docs.push({
              id: d.id,
              ...data,
              reportType: type,
              type: typeField ? data[typeField] : data.type,
              timestamp: data.createdAt,
              _firestoreDoc: d,
              _key: key,
            });
          }
        }
        return docs;
      })
    );

    const allDocs = perCollectionResults.flat();
    allDocs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    const hasMore = allDocs.length > pageSize;
    const page = allDocs.slice(0, pageSize);

    const newLastDocs = { ...lastDocs };
    page.forEach((doc) => { newLastDocs[doc._key] = doc._firestoreDoc; });

    const results = page.map(({ _firestoreDoc, _key, ...rest }) => rest);
    return { results, lastDocs: newLastDocs, hasMore };
  }
}

export const clientDataService = new ClientDataService();
