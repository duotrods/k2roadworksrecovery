/* eslint-disable no-unused-vars */
import { supabase } from "../config/supabase";
import { AppError } from "../utils/errorHandling";
import { isVideoFile } from "../utils/fileType";
import { fromIncidentRow } from "../utils/incidentRowMapper";
import { subscribeRealtimeList } from "../utils/realtimeSubscription";

// Normalizes createdAt — defensive against any lingering Firestore
// Timestamp shape, though every read in this file is Supabase (ISO string)
// now.
const toMillis = (createdAt) => {
  if (!createdAt) return 0;
  if (typeof createdAt === "string") return new Date(createdAt).getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  return 0;
};

class ClientDataService {
  // Real-time listener for live incidents in a scheme. Postgres Realtime
  // (postgres_changes) — requires incident_reports to be added to the
  // supabase_realtime publication, see
  // supabase/migrations/0007_enable_realtime_incident_reports.sql.
  subscribeLiveIncidents(schemeId, callback, onError) {
    return subscribeRealtimeList({
      table: "incident_reports",
      initialFetch: () =>
        supabase
          .from("incident_reports")
          .select("id, reference_id, marker_post, time, created_at")
          .overlaps("scheme_ids", [schemeId])
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(50),
      matches: (row) =>
        row.status === "live" &&
        Array.isArray(row.scheme_ids) &&
        row.scheme_ids.includes(schemeId),
      limit: 50,
      callback: (rows) => callback(rows.map(fromIncidentRow)),
      onError,
    });
  }

  // Real-time listener for all scheme incidents (live + completed).
  subscribeSchemeIncidents(schemeId, callback, onError) {
    return subscribeRealtimeList({
      table: "incident_reports",
      initialFetch: () =>
        supabase
          .from("incident_reports")
          .select("*")
          .overlaps("scheme_ids", [schemeId])
          .order("created_at", { ascending: false })
          .limit(100),
      matches: (row) =>
        Array.isArray(row.scheme_ids) && row.scheme_ids.includes(schemeId),
      limit: 100,
      callback: (rows) => callback(rows.map(fromIncidentRow)),
      onError,
    });
  }

  // Paginated query for completed incidents — keyset pagination on created_at.
  async getCompletedIncidentsPaginated(
    schemeId,
    pageSize = 10,
    lastDoc = null,
  ) {
    try {
      let q = supabase
        .from("incident_reports")
        .select("id, reference_id, marker_post, time, created_at")
        .overlaps("scheme_ids", [schemeId])
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (lastDoc) q = q.lt("created_at", lastDoc);

      const { data, error } = await q;
      if (error) throw error;
      const incidents = (data || []).map(fromIncidentRow);

      return {
        incidents,
        lastDoc: incidents.length > 0 ? data[data.length - 1].created_at : null,
        hasMore: incidents.length === pageSize,
      };
    } catch (error) {
      console.error("Failed to get paginated completed incidents:", error);
      return { incidents: [], lastDoc: null, hasMore: false };
    }
  }

  // Get total count of completed incidents (for pagination display)
  async getCompletedIncidentsCount(schemeId) {
    try {
      const { count, error } = await supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .overlaps("scheme_ids", [schemeId])
        .eq("status", "completed");
      if (error) throw error;
      return count || 0;
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
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .overlaps("scheme_ids", [schemeId])
        .eq("status", "live")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(fromIncidentRow);
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
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
        .overlaps("scheme_ids", [schemeId])
        .order("created_at", { ascending: false })
        .limit(limitCount);
      if (error) throw error;
      return (data || []).map(fromIncidentRow);
    } catch (error) {
      console.error("Error fetching incidents:", error);
      throw new AppError(
        "Failed to fetch scheme incidents",
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
      const { data, error } = await supabase
        .from("incident_reports")
        .select("actual_fault, vehicle_allocated, job_source, vehicle_type, driver_on_scene, police_on_scene, nh_on_scene, ripv_on_scene, time_onsite_to_cleared, time_spotted_to_on, marker_post, created_at, status")
        .overlaps("scheme_ids", [schemeId])
        .gte("created_at", startDate.toISOString());
      if (error) throw error;
      const incidents = (data || []).map(fromIncidentRow);

      // Calculate statistics
      const stats = {
        totalIncidents: incidents.filter((i) => {
          const c = this.incidentClassification(i);
          return c !== "Free Recovery" && c !== "Drive Off" && c !== "Incursion";
        }).length,
        incidentsByType: this.groupByField(incidents, "actualFault"),
        vehiclesDispatched: incidents.filter((i) => i.vehicleAllocated).length,
        spottedBy: this.groupByField(incidents, "jobSource"),
        vehicleTypes: this.groupByField(incidents, "vehicleType"),
        vehicleTypesDispatched: this.groupByField(incidents, "vehicleAllocated"),
        emergencyServices: this.groupByBooleanFlags(incidents, {
          driverOnScene: "Driver on scene",
          policeOnScene: "Police on scene",
          nhOnScene: "NH on scene",
          ripvOnScene: "RIPV on scene",
        }),
        timeToRecover: this.groupByCalculatedTime(
          incidents,
          "timeOnsiteToCleared",
        ), // Time from on site to cleared (pre-calculated)
        timeToSite: this.groupByCalculatedTime(incidents, "timeSpottedToOn"), // Time from spotted to on site (pre-calculated)
        incursions: incidents.filter(
          (i) => this.incidentClassification(i) === "Incursion",
        ).length,
        assetDamage: incidents.filter(
          (i) => this.incidentClassification(i) === "Asset Damage",
        ).length,
        recentIncidents: incidents.slice(0, 10).map((incident) => ({
          type: this.incidentClassification(incident) || "Unknown",
          location: incident.markerPost || "Unknown",
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

  // The confirmed classification for an incident — set once the job's fully
  // inspected (Step 3's Fault). Blank for live/in-progress incidents that
  // haven't reached that step yet. Used wherever we need one authoritative
  // category (totals, Incursions, Asset Damage).
  incidentClassification(incident) {
    return incident.actualFault || "";
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

  // Helper function to group data by field. fallbackField lets a chart read
  // a secondary field when the primary one is blank.
  groupByField(data, field, fallbackField = null) {
    const grouped = {};
    data.forEach((item) => {
      const value = item[field] || (fallbackField && item[fallbackField]) || "Unknown";
      grouped[value] = (grouped[value] || 0) + 1;
    });
    return grouped;
  }

  // Helper to count how many incidents have each of a set of boolean flags
  // set true (e.g. driverOnScene/policeOnScene/nhOnScene/ripvOnScene) —
  // replaces the old Firestore-era emergencyServices array field, which
  // doesn't exist on the current form.
  groupByBooleanFlags(data, flagLabels) {
    const grouped = {};
    data.forEach((item) => {
      Object.entries(flagLabels).forEach(([field, label]) => {
        if (item[field]) grouped[label] = (grouped[label] || 0) + 1;
      });
    });
    return grouped;
  }

  // Get time-series data for charts
  async getTimeSeriesData(schemeId, days = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("incident_reports")
        .select("created_at")
        .overlaps("scheme_ids", [schemeId])
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      const incidents = (data || []).map(fromIncidentRow);

      // Group by week
      const weeklyData = {};
      incidents.forEach((incident) => {
        const date = new Date(incident.createdAt);
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
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, reference_id, actual_fault, vehicle_allocated, job_source, vehicle_type, driver_on_scene, police_on_scene, nh_on_scene, ripv_on_scene, time_onsite_to_cleared, time_spotted_to_on, marker_post, date, created_at, status, submitted_by_user_id, submitted_by_name")
        .overlaps("scheme_ids", [schemeId])
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());
      if (error) throw error;
      const incidents = (data || []).map(fromIncidentRow);

      // Calculate statistics (same as getSchemeStats)
      const stats = {
        totalIncidents: incidents.filter((i) => {
          const c = this.incidentClassification(i);
          return c !== "Free Recovery" && c !== "Drive Off" && c !== "Incursion";
        }).length,
        incidentsByType: this.groupByField(incidents, "actualFault"),
        vehiclesDispatched: incidents.filter((i) => i.vehicleAllocated).length,
        spottedBy: this.groupByField(incidents, "jobSource"),
        vehicleTypes: this.groupByField(incidents, "vehicleType"),
        vehicleTypesDispatched: this.groupByField(incidents, "vehicleAllocated"),
        emergencyServices: this.groupByBooleanFlags(incidents, {
          driverOnScene: "Driver on scene",
          policeOnScene: "Police on scene",
          nhOnScene: "NH on scene",
          ripvOnScene: "RIPV on scene",
        }),
        timeToRecover: this.groupByCalculatedTime(
          incidents,
          "timeOnsiteToCleared",
        ),
        timeToSite: this.groupByCalculatedTime(incidents, "timeSpottedToOn"),
        incursions: incidents.filter(
          (i) => this.incidentClassification(i) === "Incursion",
        ).length,
        assetDamage: incidents.filter(
          (i) => this.incidentClassification(i) === "Asset Damage",
        ).length,
        recentIncidents: incidents.slice(0, 10).map((incident) => ({
          type: this.incidentClassification(incident) || "Unknown",
          location: incident.markerPost || "Unknown",
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

      const { data, error } = await supabase
        .from("incident_reports")
        .select("created_at")
        .overlaps("scheme_ids", [schemeId])
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      const incidents = (data || []).map(fromIncidentRow);

      // Group by month (e.g., "January 2026")
      const monthlyData = {};
      const monthOrder = []; // Track order of months for sorting
      incidents.forEach((incident) => {
        const date = new Date(incident.createdAt);
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

      // Transform and combine all reports
      const allReports = [
        ...incidents.map((report) => ({
          ...report,
          reportType: "incident",
          type: this.incidentClassification(report) || "Unknown",
          timestamp: report.createdAt,
        })),
      ];

      // Sort by timestamp (newest first)
      return allReports.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
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
  // Fetches paginated incident reports and merges them with cursor-based pagination.
  // Only "incident" is a client-visible report type now (Cabin Safety/Vehicle
  // Check/Daily Allocations have no client access) — kept as a single-source
  // "merge" for interface parity with the multi-type shape ReportsPage.jsx expects.
  async getAllReportsPaginated(schemeId, pageSize = 10, cursors = {}, dateRange = null) {
    try {
      const incidents = await this.fetchPaginatedIncidents(
        schemeId,
        pageSize,
        cursors.incidents,
        null,
        dateRange,
      );

      const reports = incidents.docs.map((report) => ({
        ...report,
        reportType: "incident",
        type: this.incidentClassification(report) || "Unknown",
        timestamp: report.createdAt,
      }));

      const newCursors = { ...cursors };
      if (incidents.lastDoc) newCursors.incidents = incidents.lastDoc;

      return {
        reports,
        cursors: newCursors,
        hasMore: incidents.hasMore,
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

  // Keyset pagination (created_at cursor) for incident_reports, scoped to a scheme.
  // extraWhere: { field, op, value } for server-side sub-filters (field is
  // camelCase, converted to the snake_case column name).
  async fetchPaginatedIncidents(schemeId, limitCount, cursor, extraWhere = null, dateRange = null) {
    try {
      let q = supabase
        .from("incident_reports")
        .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
        .overlaps("scheme_ids", [schemeId])
        .order("created_at", { ascending: false })
        .limit(limitCount);

      if (extraWhere) {
        const column = extraWhere.field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
        q = extraWhere.op === "in"
          ? q.in(column, extraWhere.value)
          : q.eq(column, extraWhere.value);
      }
      if (dateRange) {
        q = q
          .gte("created_at", dateRange.startDate.toISOString())
          .lte("created_at", dateRange.endDate.toISOString());
      }
      if (cursor) q = q.lt("created_at", cursor);

      const { data, error } = await q;
      if (error) throw error;
      const docs = (data || []).map((row) => ({
        ...fromIncidentRow(row),
        _cursor: row.created_at,
      }));

      return {
        docs,
        lastDoc: docs.length > 0 ? docs[docs.length - 1]._cursor : null,
        hasMore: docs.length === limitCount,
      };
    } catch (error) {
      console.error("Error fetching paginated incidents:", error);
      return { docs: [], lastDoc: null, hasMore: false };
    }
  }

  // Get total count of all reports for a scheme (for pagination display)
  async getAllReportsCount(schemeId) {
    try {
      return await this.getCollectionCount("incidentReports", schemeId);
    } catch (error) {
      console.warn("Could not get total reports count:", error);
      return 0;
    }
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
    if (reportType !== "incident") {
      return { reports: [], lastDoc: null, hasMore: false };
    }

    try {
      const result = await this.fetchPaginatedIncidents(
        schemeId,
        pageSize,
        lastDoc,
        extraWhere,
        dateRange,
      );
      const reports = result.docs.map(({ _cursor, ...report }) => ({
        ...report,
        reportType: "incident",
        type: this.incidentClassification(report) || "Unknown",
        timestamp: report.createdAt,
      }));
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
        freeRecoveryCount,
        driveOffCount,
        incursionsCount,
        vehiclesDispatchedCount,
        incidentAssetDamageCount,
        pureIncidentCount,
      ] = await Promise.all([
        this.getCollectionCount("incidentReports", schemeId, dateRange),
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
        freeRecovery: freeRecoveryCount,
        driveOff: driveOffCount,
        incursions: incursionsCount,
        vehiclesDispatched: vehiclesDispatchedCount,
        incidentAssetDamage: incidentAssetDamageCount,
        total: incidentCount,
      };
    } catch (error) {
      console.warn("Could not get reports count by type:", error);
      return {
        incident: 0,
        pureIncident: 0,
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
  async getPureIncidentCount(schemeId, dateRange = null) {
    try {
      let q = supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .overlaps("scheme_ids", [schemeId])
        .eq("is_pure_incident", true);
      if (dateRange) {
        q = q
          .gte("created_at", dateRange.startDate.toISOString())
          .lte("created_at", dateRange.endDate.toISOString());
      }
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn("Pure incident count unavailable:", error.message);
      return 0;
    }
  }

  async getVehiclesDispatchedCount(schemeId) {
    try {
      const { data, error } = await supabase
        .from("scheme_stats")
        .select("total_vehicles_dispatched")
        .eq("scheme_id", schemeId)
        .maybeSingle();
      if (error) throw error;
      return data?.total_vehicles_dispatched || 0;
    } catch (error) {
      console.warn("Could not get vehicles dispatched count:", error);
      return 0;
    }
  }

  // field is camelCase (e.g. "isPureIncident"), converted to the snake_case
  // column name. Note: a few sub-filters wired up on the client Reports page
  // (incidentType/incursion/propertyDamage) predate the K2 rebrand and no
  // longer correspond to real columns on this table — those queries will
  // fail fast and fall back to 0 here, same visible behavior as before.
  async getCollectionCountWithFilter(collectionName, schemeId, field, value, dateRange = null) {
    try {
      const column = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      let q = supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .overlaps("scheme_ids", [schemeId])
        .eq(column, value);
      if (dateRange) {
        q = q
          .gte("created_at", dateRange.startDate.toISOString())
          .lte("created_at", dateRange.endDate.toISOString());
      }
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn(
        `Could not get filtered count for ${collectionName}:`,
        error,
      );
      return 0;
    }
  }

  // Helper to get count from incident_reports (the only client-visible
  // report type — collectionName is kept for call-site compatibility)
  async getCollectionCount(collectionName, schemeId, dateRange = null) {
    try {
      let q = supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .overlaps("scheme_ids", [schemeId]);
      if (dateRange) {
        q = q
          .gte("created_at", dateRange.startDate.toISOString())
          .lte("created_at", dateRange.endDate.toISOString());
      }
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn(`Could not get count for ${collectionName}:`, error);
      return 0;
    }
  }

  // Get CCTV recordings for a specific scheme — pulls from incident_reports with video/image files.
  // The has_video == true filter means Postgres returns ONLY reports that
  // actually have a video — reads scale with the number of recordings, not
  // with total incidents (requires the one-time hasVideo backfill on
  // existing reports, admin → Backfill hasVideo).
  async getCCTVRecordings(schemeId) {
    try {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, reference_id, scheme, submitted_by_user_id, submitted_by_name, files, created_at")
        .overlaps("scheme_ids", [schemeId])
        .eq("has_video", true)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Only return reports that have video files (detected by MIME *or* file
      // extension), strip out non-video files.
      return (data || [])
        .map(fromIncidentRow)
        .map((report) => ({
          ...report,
          dateTime: report.createdAt,
          files: (report.files || []).filter(isVideoFile),
        }))
        .filter((report) => report.files.length > 0);
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
    if (filterType && filterType !== "incident") return [];
    return this._searchIncidentsByReferenceId(schemeId, raw);
  }

  async _searchIncidentsByReferenceId(schemeId, raw) {
    try {
      const [byRef, byName] = await Promise.all([
        supabase
          .from("incident_reports")
          .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
          .overlaps("scheme_ids", [schemeId])
          .ilike("reference_id", `${raw}%`)
          .limit(10),
        supabase
          .from("incident_reports")
          .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
          .overlaps("scheme_ids", [schemeId])
          .ilike("submitted_by_name", `${raw}%`)
          .limit(10),
      ]);
      if (byRef.error) throw byRef.error;
      if (byName.error) throw byName.error;

      const seen = new Set();
      const results = [];
      for (const row of [...(byRef.data || []), ...(byName.data || [])]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const report = fromIncidentRow(row);
        results.push({
          ...report,
          reportType: "incident",
          type: this.incidentClassification(report) || "Unknown",
          timestamp: report.createdAt,
        });
      }

      results.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
      return results.slice(0, 10);
    } catch (error) {
      console.error("Search failed:", error);
      return [];
    }
  }

  // Paginated version of the above search — uses offset pagination (stored
  // on lastDocs.offset) rather than true keyset pagination, since results are
  // merged from two independent prefix queries (reference_id, submitted_by_name)
  // then re-sorted by timestamp; fine for the small result sets a search like
  // this returns.
  async searchReportsPaginated(schemeId, searchTerm, pageSize = 10, lastDocs = {}, filterType = null) {
    const raw = searchTerm.trim();
    if (!raw) return { results: [], lastDocs: {}, hasMore: false };
    if (raw.length > 100) return { results: [], lastDocs: {}, hasMore: false };
    if (filterType && filterType !== "incident") {
      return { results: [], lastDocs: {}, hasMore: false };
    }

    try {
      const offset = lastDocs.offset || 0;
      const [byRef, byName] = await Promise.all([
        supabase
          .from("incident_reports")
          .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
          .overlaps("scheme_ids", [schemeId])
          .ilike("reference_id", `${raw}%`)
          .limit(200),
        supabase
          .from("incident_reports")
          .select("id, reference_id, scheme, date, submitted_by_user_id, submitted_by_name, status, location, created_at, actual_fault")
          .overlaps("scheme_ids", [schemeId])
          .ilike("submitted_by_name", `${raw}%`)
          .limit(200),
      ]);
      if (byRef.error) throw byRef.error;
      if (byName.error) throw byName.error;

      const seen = new Set();
      const allResults = [];
      for (const row of [...(byRef.data || []), ...(byName.data || [])]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const report = fromIncidentRow(row);
        allResults.push({
          ...report,
          reportType: "incident",
          type: this.incidentClassification(report) || "Unknown",
          timestamp: report.createdAt,
        });
      }
      allResults.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));

      const page = allResults.slice(offset, offset + pageSize);
      return {
        results: page,
        lastDocs: { offset: offset + page.length },
        hasMore: offset + page.length < allResults.length,
      };
    } catch (error) {
      console.error("Search failed:", error);
      return { results: [], lastDocs: {}, hasMore: false };
    }
  }
}

export const clientDataService = new ClientDataService();
