/* eslint-disable no-unused-vars */
import { supabase } from "../config/supabase";
import { referenceIdService } from "./referenceIdService";
import { extractSchemeId, SCHEMES, DEMO_SCHEME_ID } from "../utils/schemes";
import { countVehicles, isPureIncident } from "../utils/incidentStats";
import { isVideoFile } from "../utils/fileType";
import { fromIncidentRow, toIncidentRow } from "../utils/incidentRowMapper";
import { fromCabinSafetyRow, toCabinSafetyRow } from "../utils/cabinSafetyRowMapper";
import { fromVehicleCheckRow, toVehicleCheckRow } from "../utils/vehicleCheckRowMapper";
import { fromDailyAllocationRow, toDailyAllocationRow } from "../utils/dailyAllocationRowMapper";
import { subscribeRealtimeList } from "../utils/realtimeSubscription";
import { fromActivityRow, toActivityRow } from "../utils/activityRowMapper";

// Form types whose data now lives in Supabase (not Firestore). Keyed by the
// legacy Firestore collection name so existing call sites (which still pass
// that name around as a de-facto "form type" key) can look up the Postgres
// table + row mapper without a wider rename.
const SUPABASE_BACKED_TABLES = {
  incidentReports: { table: "incident_reports", fromRow: fromIncidentRow },
  cabinHealthSafetyChecks: { table: "cabin_health_safety_checks", fromRow: fromCabinSafetyRow },
  vehicleDailyChecks: { table: "vehicle_daily_checks", fromRow: fromVehicleCheckRow },
  dailyAllocations: { table: "daily_allocations", fromRow: fromDailyAllocationRow },
};

// Normalizes createdAt across a Firestore Timestamp, a Supabase ISO string,
// or a plain Date, so merged lists spanning both backends sort correctly.
const toMillis = (createdAt) => {
  if (!createdAt) return 0;
  if (typeof createdAt === "string") return new Date(createdAt).getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  return 0;
};

class StaffService {
  // ============================================
  // ACTIVITY LOGGING (for Notice Board)
  // ============================================

  async logActivity(activityData) {
    try {
      const { error } = await supabase
        .from("activities")
        .insert(toActivityRow(activityData));
      if (error) throw error;
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }

  async getRecentActivities(userId, lastLogoutTime, staffGroup = "internal") {
    try {
      const since =
        lastLogoutTime instanceof Date
          ? lastLogoutTime.toISOString()
          : lastLogoutTime;
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;

      return (data || [])
        .map(fromActivityRow)
        .filter((a) => a.staffId !== userId)
        .filter((a) => {
          // Activities without staffGroup are legacy internal activities
          const group = a.staffGroup || "internal";
          return group === staffGroup;
        })
        .slice(0, 20);
    } catch (error) {
      console.error("Failed to get activities:", error);
      return [];
    }
  }

  // Single-doc getters (1 read by id) used by the admin detail pages.
  async getIncidentReportById(reportId) {
    try {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (error) throw error;
      return fromIncidentRow(data);
    } catch (error) {
      console.error("Failed to get incident report:", error);
      return null;
    }
  }

  // ============================================
  // INCIDENT REPORTS
  // ============================================

  _countVehicles(formData) {
    return countVehicles(formData);
  }

  // Best-effort scheme vehicle-stat update via the increment_scheme_stat RPC.
  // No longer atomic with the report write (Postgres doesn't give the client
  // a writeBatch-equivalent without a bespoke RPC per call site) — matches
  // the same decoupled, non-fatal pattern already used by _applyCountDelta.
  async _adjustSchemeVehicleStats(schemeId, delta) {
    if (!schemeId || delta === 0) return;
    try {
      const { error } = await supabase.rpc("increment_scheme_stat", {
        p_scheme_id: schemeId,
        p_delta: delta,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Failed to adjust scheme vehicle stats:", error);
    }
  }

  async submitIncidentReport(formData, userId, userName, status = "submitted") {
    try {
      // Extract schemeId from scheme field (e.g., "A417 Missing Link - Kier" -> "A417")
      const schemeId = extractSchemeId(formData.scheme);

      // Check if this is a demo submission
      const isDemo = schemeId === DEMO_SCHEME_ID;

      // Generate reference ID — separate demo counter, or real staff counter
      const referenceId = await referenceIdService.generateReferenceId(
        "incident",
        isDemo,
      );

      const row = {
        ...toIncidentRow(formData),
        scheme_id: schemeId,
        scheme_ids: [schemeId],
        reference_id: referenceId,
        submitted_by_user_id: userId,
        submitted_by_name: userName,
        status,
        is_pure_incident: isPureIncident(formData),
        // Precomputed flag so the CCTV Recordings page can query video reports
        // directly instead of scanning every incident.
        has_video: (formData.files || []).some(isVideoFile),
      };

      const { data, error } = await supabase
        .from("incident_reports")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;

      // Update running vehicle total for this scheme (decoupled, non-fatal).
      const vehicleDelta = this._countVehicles(formData);
      this._adjustSchemeVehicleStats(schemeId, vehicleDelta);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Incident Report ${referenceId}`,
        relatedFormId: data.id,
        staffGroup: "internal",
      });

      return { id: data.id, referenceId };
    } catch (error) {
      console.error("Failed to submit incident report:", error);
      throw error;
    }
  }

  async getIncidentReports(userId = null, limitCount = null, dateRange = null) {
    try {
      let q = supabase.from("incident_reports").select("*");
      if (userId) q = q.eq("submitted_by_user_id", userId);
      if (dateRange?.startDate) {
        q = q.gte("created_at", dateRange.startDate.toISOString());
      }
      if (dateRange?.endDate) {
        q = q.lte("created_at", dateRange.endDate.toISOString());
      }
      q = q.order("created_at", { ascending: false });
      if (limitCount) q = q.limit(limitCount);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(fromIncidentRow);
    } catch (error) {
      console.error("Failed to get incident reports:", error);
      return [];
    }
  }

  async updateIncidentReport(reportId, formData, userId, userName, isCompletion = false) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("incident_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Report not found");

      const currentData = fromIncidentRow(currentRow);

      const extraFields = {};
      if (!isCompletion) {
        const editHistory = currentData.editHistory || [];
        editHistory.push({
          editedBy: { userId, name: userName },
          editedAt: new Date().toISOString(),
          previousSubmittedBy: currentData.submittedBy,
        });
        extraFields.edit_history = editHistory;
        extraFields.last_edited_by_user_id = userId;
        extraFields.last_edited_by_name = userName;
      }

      // Recalculate schemeIds when scheme is updated
      const newSchemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;
      const oldSchemeId =
        currentData.schemeId ||
        (currentData.scheme ? extractSchemeId(currentData.scheme) : null);

      // Recompute hasVideo from the final files array. Fall back to the current
      // files when this update doesn't carry `files`, so a non-file edit never
      // wipes the flag.
      const finalFiles =
        formData.files !== undefined ? formData.files : currentData.files;

      const row = {
        ...toIncidentRow(formData),
        scheme_id: newSchemeId,
        scheme_ids: [newSchemeId],
        is_pure_incident: isPureIncident(formData),
        has_video: (finalFiles || []).some(isVideoFile),
        ...extraFields,
      };

      const { error } = await supabase
        .from("incident_reports")
        .update(row)
        .eq("id", reportId);
      if (error) throw error;

      // Keep schemeStats correct, including when the scheme itself changes
      // (decoupled, non-fatal — see _adjustSchemeVehicleStats).
      const oldVehicles = this._countVehicles(currentData);
      const newVehicles = this._countVehicles(formData);
      if (oldSchemeId !== newSchemeId) {
        // Move the whole count off the old scheme and onto the new one.
        this._adjustSchemeVehicleStats(oldSchemeId, -oldVehicles);
        this._adjustSchemeVehicleStats(newSchemeId, newVehicles);
      } else {
        // Same scheme: only apply the difference.
        this._adjustSchemeVehicleStats(newSchemeId, newVehicles - oldVehicles);
      }

      // Log activity
      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited Incident Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update incident report:", error);
      throw error;
    }
  }

  async deleteIncidentReport(reportId, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("incident_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Report not found");

      const currentData = fromIncidentRow(currentRow);

      const { error } = await supabase
        .from("incident_reports")
        .delete()
        .eq("id", reportId);
      if (error) throw error;

      // Subtract its vehicles from the running total (decoupled, non-fatal).
      const vehicleDelta = this._countVehicles(currentData);
      if (vehicleDelta > 0) {
        const deletedSchemeId =
          currentData.schemeId || extractSchemeId(currentData.scheme);
        this._adjustSchemeVehicleStats(deletedSchemeId, -vehicleDelta);
      }

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted Incident Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to delete incident report:", error);
      throw error;
    }
  }

  // ============================================
  // REAL-TIME SUBSCRIPTIONS (Cost-optimized)
  // ============================================

  /**
   * Subscribe to real-time live incidents for the Live Operator Dashboard.
   * Postgres Realtime (postgres_changes) — requires incident_reports to be
   * added to the supabase_realtime publication, see
   * supabase/migrations/0007_enable_realtime_incident_reports.sql.
   * @param {function} callback - Called with array of live incidents
   * @param {function} onError - Called on error
   * @returns {function} Unsubscribe function
   */
  subscribeLiveIncidents(callback, onError) {
    return subscribeRealtimeList({
      table: "incident_reports",
      initialFetch: () =>
        supabase
          .from("incident_reports")
          .select("*")
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(50),
      matches: (row) => row.status === "live",
      limit: 50,
      callback: (rows) => callback(rows.map(fromIncidentRow)),
      onError,
    });
  }

  /**
   * Get count of completed incidents (efficient server-side count)
   */
  async getCompletedIncidentsCount() {
    try {
      const { count, error } = await supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error("Failed to get completed incidents count:", error);
      return 0;
    }
  }

  /**
   * Get paginated completed incidents - keyset pagination on created_at.
   * @param {number} pageSize - Number of rows per page
   * @param {string|null} lastDoc - created_at cursor from the previous page
   * @returns {Promise<{incidents: Array, lastDoc: string|null, hasMore: boolean}>}
   */
  async getCompletedIncidentsPaginated(pageSize = 10, lastDoc = null) {
    try {
      let q = supabase
        .from("incident_reports")
        .select("*")
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

  // ============================================
  // CABIN HEALTH & SAFETY CHECKS
  // ============================================

  async submitCabinHealthSafetyCheck(formData, userId, userName) {
    try {
      const schemeId = extractSchemeId(formData.scheme);
      const isDemo = schemeId === DEMO_SCHEME_ID;
      const referenceId = await referenceIdService.generateReferenceId(
        "cabinSafety",
        isDemo,
      );

      const row = {
        ...toCabinSafetyRow(formData),
        scheme_id: schemeId,
        scheme_ids: [schemeId],
        reference_id: referenceId,
        submitted_by_user_id: userId,
        submitted_by_name: userName,
        status: "submitted",
      };

      const { data, error } = await supabase
        .from("cabin_health_safety_checks")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Cabin Health & Safety Check ${referenceId}`,
        relatedFormId: data.id,
        staffGroup: "internal",
      });

      return data.id;
    } catch (error) {
      console.error("Failed to submit cabin health & safety check:", error);
      throw error;
    }
  }

  async getCabinHealthSafetyChecks(userId = null, limitCount = null) {
    try {
      let q = supabase.from("cabin_health_safety_checks").select("*");
      if (userId) q = q.eq("submitted_by_user_id", userId);
      q = q.order("created_at", { ascending: false });
      if (limitCount) q = q.limit(limitCount);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(fromCabinSafetyRow);
    } catch (error) {
      console.error("Failed to get cabin health & safety checks:", error);
      return [];
    }
  }

  async getCabinHealthSafetyCheckById(formId) {
    try {
      const { data, error } = await supabase
        .from("cabin_health_safety_checks")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (error) throw error;
      return fromCabinSafetyRow(data);
    } catch (error) {
      console.error("Failed to get cabin health & safety check:", error);
      throw error;
    }
  }

  async updateCabinHealthSafetyCheck(reportId, formData, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("cabin_health_safety_checks")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Report not found");

      const currentData = fromCabinSafetyRow(currentRow);
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date().toISOString(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      const row = {
        ...toCabinSafetyRow(formData),
        scheme_id: schemeId,
        scheme_ids: [schemeId],
        edit_history: editHistory,
        last_edited_by_user_id: userId,
        last_edited_by_name: userName,
      };

      const { error } = await supabase
        .from("cabin_health_safety_checks")
        .update(row)
        .eq("id", reportId);
      if (error) throw error;

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited Cabin Health & Safety Check ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update cabin health & safety check:", error);
      throw error;
    }
  }

  async deleteCabinHealthSafetyCheck(formId, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("cabin_health_safety_checks")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Form not found");

      const currentData = fromCabinSafetyRow(currentRow);

      const { error } = await supabase
        .from("cabin_health_safety_checks")
        .delete()
        .eq("id", formId);
      if (error) throw error;

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted Cabin Health & Safety Check ${currentData.referenceId}`,
        relatedFormId: formId,
      });

      return formId;
    } catch (error) {
      console.error("Failed to delete cabin health & safety check:", error);
      throw error;
    }
  }

  // ============================================
  // VEHICLE DAILY CHECKS
  // ============================================

  async submitVehicleDailyCheck(formData, userId, userName) {
    try {
      const schemeId = extractSchemeId(formData.scheme);
      const isDemo = schemeId === DEMO_SCHEME_ID;
      const referenceId = await referenceIdService.generateReferenceId(
        "vehicleCheck",
        isDemo,
      );

      const row = {
        ...toVehicleCheckRow(formData),
        scheme_id: schemeId,
        scheme_ids: [schemeId],
        reference_id: referenceId,
        submitted_by_user_id: userId,
        submitted_by_name: userName,
        status: "submitted",
      };

      const { data, error } = await supabase
        .from("vehicle_daily_checks")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Vehicle Daily Check ${referenceId}`,
        relatedFormId: data.id,
        staffGroup: "internal",
      });

      return data.id;
    } catch (error) {
      console.error("Failed to submit vehicle daily check:", error);
      throw error;
    }
  }

  async getVehicleDailyChecks(userId = null, limitCount = null) {
    try {
      let q = supabase.from("vehicle_daily_checks").select("*");
      if (userId) q = q.eq("submitted_by_user_id", userId);
      q = q.order("created_at", { ascending: false });
      if (limitCount) q = q.limit(limitCount);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(fromVehicleCheckRow);
    } catch (error) {
      console.error("Failed to get vehicle daily checks:", error);
      return [];
    }
  }

  async getVehicleDailyCheckById(formId) {
    try {
      const { data, error } = await supabase
        .from("vehicle_daily_checks")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (error) throw error;
      return fromVehicleCheckRow(data);
    } catch (error) {
      console.error("Failed to get vehicle daily check:", error);
      throw error;
    }
  }

  async updateVehicleDailyCheck(reportId, formData, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("vehicle_daily_checks")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Report not found");

      const currentData = fromVehicleCheckRow(currentRow);
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date().toISOString(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      const row = {
        ...toVehicleCheckRow(formData),
        scheme_id: schemeId,
        scheme_ids: [schemeId],
        edit_history: editHistory,
        last_edited_by_user_id: userId,
        last_edited_by_name: userName,
      };

      const { error } = await supabase
        .from("vehicle_daily_checks")
        .update(row)
        .eq("id", reportId);
      if (error) throw error;

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited Vehicle Daily Check ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update vehicle daily check:", error);
      throw error;
    }
  }

  async deleteVehicleDailyCheck(formId, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("vehicle_daily_checks")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Form not found");

      const currentData = fromVehicleCheckRow(currentRow);

      const { error } = await supabase
        .from("vehicle_daily_checks")
        .delete()
        .eq("id", formId);
      if (error) throw error;

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted Vehicle Daily Check ${currentData.referenceId}`,
        relatedFormId: formId,
      });

      return formId;
    } catch (error) {
      console.error("Failed to delete vehicle daily check:", error);
      throw error;
    }
  }

  // ============================================
  // DAILY ALLOCATIONS (admin-only weekly roster)
  // ============================================

  async submitDailyAllocation(formData, userId, userName) {
    try {
      const referenceId = await referenceIdService.generateReferenceId(
        "dailyAllocation",
        false,
      );

      const row = {
        ...toDailyAllocationRow(formData),
        scheme_ids: [formData.schemeId],
        reference_id: referenceId,
        submitted_by_user_id: userId,
        submitted_by_name: userName,
        status: "submitted",
      };

      const { data, error } = await supabase
        .from("daily_allocations")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;

      return { id: data.id, referenceId };
    } catch (error) {
      console.error("Failed to submit daily allocation:", error);
      throw error;
    }
  }

  async updateDailyAllocation(allocationId, formData, userId, userName) {
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from("daily_allocations")
        .select("*")
        .eq("id", allocationId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!currentRow) throw new Error("Allocation not found");

      const currentData = fromDailyAllocationRow(currentRow);
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date().toISOString(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const row = {
        ...toDailyAllocationRow(formData),
        scheme_ids: [formData.schemeId],
        edit_history: editHistory,
        last_edited_by_user_id: userId,
        last_edited_by_name: userName,
      };

      const { error } = await supabase
        .from("daily_allocations")
        .update(row)
        .eq("id", allocationId);
      if (error) throw error;

      return allocationId;
    } catch (error) {
      console.error("Failed to update daily allocation:", error);
      throw error;
    }
  }

  async getDailyAllocationById(allocationId) {
    try {
      const { data, error } = await supabase
        .from("daily_allocations")
        .select("*")
        .eq("id", allocationId)
        .maybeSingle();
      if (error) throw error;
      return fromDailyAllocationRow(data);
    } catch (error) {
      console.error("Failed to get daily allocation:", error);
      throw error;
    }
  }

  async deleteDailyAllocation(allocationId) {
    return this.deleteReport("dailyAllocations", allocationId);
  }

  // Generic delete report function for admin use.
  async deleteReport(collectionName, reportId) {
    const supabaseTable = SUPABASE_BACKED_TABLES[collectionName]?.table;
    if (!supabaseTable) {
      throw new Error(`Unknown or non-Supabase collection: ${collectionName}`);
    }
    try {
      const { error } = await supabase
        .from(supabaseTable)
        .delete()
        .eq("id", reportId);
      if (error) throw error;
      return reportId;
    } catch (error) {
      console.error(`Failed to delete report from ${collectionName}:`, error);
      throw error;
    }
  }

  // ============================================
  // SERVER-SIDE PAGINATION (Cost-optimized)
  // ============================================

  /**
   * Get all forms with server-side pagination (COST-OPTIMIZED!)
   * Only reads `pageSize` documents per request (massive cost savings!)
   * @param {number} pageSize - Number of documents per page
   * @param {object} cursors - Cursors for each collection type
   * @returns {Promise<{forms: Array, cursors: object, hasMore: boolean}>}
   */
  async getAllFormsPaginated(pageSize = 10, cursors = {}, schemeIds = null) {
    try {
      // Fetch pageSize from each type so the merged result is truly chronological
      const perTypeLimit = pageSize;

      const [
        incidentReports,
        cabinSafetyChecks,
        vehicleDailyChecks,
      ] = await Promise.all([
        this.fetchPaginatedFormsAny(
          "incidentReports",
          perTypeLimit,
          cursors.incident,
          schemeIds,
        ),
        this.fetchPaginatedFormsAny(
          "cabinHealthSafetyChecks",
          perTypeLimit,
          cursors.cabinSafety,
          schemeIds,
        ),
        this.fetchPaginatedFormsAny(
          "vehicleDailyChecks",
          perTypeLimit,
          cursors.vehicleCheck,
          schemeIds,
        ),
      ]);

      // Transform and combine all forms — tag each with its source for cursor tracking
      const allForms = [
        ...incidentReports.docs.map((f) => ({
          ...f,
          type: "Incident Report",
          _source: "incident",
        })),
        ...cabinSafetyChecks.docs.map((f) => ({
          ...f,
          type: "Cabin H&S Check",
          _source: "cabinSafety",
        })),
        ...vehicleDailyChecks.docs.map((f) => ({
          ...f,
          type: "Vehicle Daily Check",
          _source: "vehicleCheck",
        })),
      ];

      // Sort by createdAt and take only pageSize items
      const sortedForms = allForms
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, pageSize);

      // Only advance cursors for collections that had docs included in the final slice.
      // This prevents skipping unseen docs from collections that were fetched but not displayed.
      const newCursors = { ...cursors };
      sortedForms.forEach((form) => {
        if (form._cursor) {
          newCursors[form._source] = form._cursor;
        }
      });

      // Clean internal tracking fields before returning
      const cleanForms = sortedForms.map(
        ({ _source, _cursor, ...rest }) => rest,
      );

      return {
        forms: cleanForms,
        cursors: newCursors,
        hasMore:
          incidentReports.hasMore ||
          cabinSafetyChecks.hasMore ||
          vehicleDailyChecks.hasMore,
      };
    } catch (error) {
      console.error("Failed to get paginated forms:", error);
      return { forms: [], cursors: {}, hasMore: false };
    }
  }

  /**
   * Get forms of a specific type with true server-side pagination
   * Used when a type filter is active — fetches exactly pageSize of that type only
   */
  async getFormsByTypePaginated(
    formType,
    pageSize = 10,
    lastDoc = null,
    schemeId = null,
  ) {
    const configMap = {
      incident: { collection: "incidentReports", label: "Incident Report" },
      "cabin-safety": {
        collection: "cabinHealthSafetyChecks",
        label: "Cabin H&S Check",
      },
      "vehicle-check": {
        collection: "vehicleDailyChecks",
        label: "Vehicle Daily Check",
      },
    };
    const config = configMap[formType];
    if (!config) return { forms: [], lastDoc: null, hasMore: false };

    try {
      const result = await this.fetchPaginatedFormsAny(
        config.collection,
        pageSize,
        lastDoc,
        schemeId,
      );
      const forms = result.docs.map(({ _cursor, ...f }) => ({
        ...f,
        type: config.label,
      }));
      return { forms, lastDoc: result.lastDoc, hasMore: result.hasMore };
    } catch (error) {
      console.error(`Error fetching ${formType} forms:`, error);
      return { forms: [], lastDoc: null, hasMore: false };
    }
  }

  // Looks up which Supabase table backs this form type — every form type is
  // Supabase-backed now, so this is a straight lookup, not a fallback.
  async fetchPaginatedFormsAny(collectionName, limitCount, cursor, schemeIds = null) {
    const supabaseTable = SUPABASE_BACKED_TABLES[collectionName];
    if (!supabaseTable) {
      console.error(`Unknown or non-Supabase collection: ${collectionName}`);
      return { docs: [], lastDoc: null, hasMore: false };
    }
    return this.fetchPaginatedSupabaseTable(
      supabaseTable.table,
      limitCount,
      cursor,
      schemeIds,
      supabaseTable.fromRow,
    );
  }

  // Keyset pagination (created_at cursor) for a Supabase-backed table —
  // Supabase equivalent of fetchPaginatedForms below.
  async fetchPaginatedSupabaseTable(tableName, limitCount, cursor, schemeIds, fromRow) {
    try {
      let q = supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limitCount);
      if (schemeIds && schemeIds.length > 0) {
        q = q.overlaps("scheme_ids", schemeIds);
      }
      if (cursor) {
        q = q.lt("created_at", cursor);
      }
      const { data, error } = await q;
      if (error) throw error;
      const docs = (data || []).map((row) => ({
        ...fromRow(row),
        _cursor: row.created_at,
      }));
      return {
        docs,
        lastDoc: docs.length > 0 ? docs[docs.length - 1]._cursor : cursor,
        hasMore: docs.length === limitCount,
      };
    } catch (error) {
      console.error(`Error fetching from ${tableName}:`, error);
      return { docs: [], lastDoc: null, hasMore: false };
    }
  }

  /**
   * Count a collection scoped to a viewer's scheme set.
   * schemeScope: array of scheme IDs the viewer may see (real staff → internal
   * schemes; TP staff → company schemes; demo → demo scheme). Every form
   * type is Supabase-backed now, so this is a straight pass-through.
   */
  countForScope(collectionName, schemeScope) {
    const supabaseTable = SUPABASE_BACKED_TABLES[collectionName]?.table;
    if (!supabaseTable) {
      console.warn(`Unknown or non-Supabase collection: ${collectionName}`);
      return Promise.resolve(0);
    }
    return this.getSupabaseCount(supabaseTable, {
      schemeScope,
      excludeDemo: true,
    });
  }

  // Live count for a Supabase-backed table, scoped the same way as the
  // Firestore path above: schemeScope (array-overlap on scheme_ids) when
  // given, otherwise excludeDemo (no cache needed — Supabase counts are
  // cheap, unlike Firestore's billed-per-read aggregation queries).
  async getSupabaseCount(tableName, { schemeScope = null, excludeDemo = false } = {}) {
    try {
      let q = supabase.from(tableName).select("*", { count: "exact", head: true });
      if (schemeScope && schemeScope.length > 0) {
        q = q.overlaps("scheme_ids", schemeScope);
      } else if (excludeDemo) {
        q = q.neq("scheme_id", DEMO_SCHEME_ID);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.warn(`Could not get Supabase count for ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Get total count of all forms, scoped to the viewer's scheme set.
   * schemeScope: array of scheme IDs (see countForScope).
   */
  async getAllFormsCount(schemeScope = null) {
    try {
      const countFn = (col) => this.countForScope(col, schemeScope);

      const [incidentCount, cabinSafetyCount, vehicleCheckCount] =
        await Promise.all([
          countFn("incidentReports"),
          countFn("cabinHealthSafetyChecks"),
          countFn("vehicleDailyChecks"),
        ]);

      return incidentCount + cabinSafetyCount + vehicleCheckCount;
    } catch (error) {
      console.warn("Could not get total forms count:", error);
      return 0;
    }
  }

  /**
   * Get count per form type (for stat cards), scoped to the viewer's scheme set.
   * schemeScope: array of scheme IDs (see countForScope).
   */
  async getAllFormsCountByType(schemeScope = null) {
    try {
      const countFn = (col) => this.countForScope(col, schemeScope);

      const [incidentCount, cabinSafetyCount, vehicleCheckCount] =
        await Promise.all([
          countFn("incidentReports"),
          countFn("cabinHealthSafetyChecks"),
          countFn("vehicleDailyChecks"),
        ]);
      return {
        incidentReportTotal: incidentCount,
        cabinSafetyTotal: cabinSafetyCount,
        vehicleCheckTotal: vehicleCheckCount,
      };
    } catch (error) {
      console.warn("Could not get forms count by type:", error);
      return {
        incidentReportTotal: 0,
        cabinSafetyTotal: 0,
        vehicleCheckTotal: 0,
      };
    }
  }

  /**
   * Get count for a specific form type (for filtered pagination display),
   * scoped to the viewer's scheme set.
   * schemeScope: array of scheme IDs (see countForScope).
   */
  async getFormCountForType(formType, schemeScope = null) {
    const collectionMap = {
      incident: "incidentReports",
      "cabin-safety": "cabinHealthSafetyChecks",
      "vehicle-check": "vehicleDailyChecks",
    };
    const collectionName = collectionMap[formType];
    if (!collectionName) return 0;
    return await this.countForScope(collectionName, schemeScope);
  }

  // Searches across the 3 Supabase-backed form types by reference-id or
  // submitted-by-name prefix (case-insensitive). Uses offset pagination
  // (stored on lastDocs.offset) over the merged, re-sorted result set --
  // simpler than per-table keyset pagination and fine for the small result
  // sets this kind of search returns. `collections` (when given) is an
  // array of the type keys below, used to scope to the active filter.
  async searchFormsPaginated(
    searchTerm,
    pageSize = 10,
    lastDocs = {},
    collections = null,
    schemeScope = null,
  ) {
    const raw = searchTerm.trim();
    if (!raw) return { results: [], lastDocs: {}, hasMore: false };
    if (raw.length > 100) return { results: [], lastDocs: {}, hasMore: false };

    // Restrict results to the viewer's scheme scope. A doc is in scope if its
    // schemeId or any of its schemeIds falls within the scope set.
    const scopeSet =
      schemeScope && schemeScope.length > 0 ? new Set(schemeScope) : null;
    const inScope = (doc) => {
      if (!scopeSet) return true;
      if (Array.isArray(doc.schemeIds) && doc.schemeIds.length > 0) {
        return doc.schemeIds.some((id) => scopeSet.has(id));
      }
      if (doc.schemeId) return scopeSet.has(doc.schemeId);
      return false;
    };

    const ALL_TYPES = [
      { key: "incident", table: "incident_reports", fromRow: fromIncidentRow, type: "Incident Report" },
      { key: "cabinSafety", table: "cabin_health_safety_checks", fromRow: fromCabinSafetyRow, type: "Cabin H&S Check" },
      { key: "vehicleCheck", table: "vehicle_daily_checks", fromRow: fromVehicleCheckRow, type: "Vehicle Daily Check" },
    ];
    const TYPES = collections && collections.length > 0
      ? ALL_TYPES.filter((t) => collections.includes(t.key))
      : ALL_TYPES;

    try {
      const perTypeResults = await Promise.all(
        TYPES.map(async ({ table, fromRow, type }) => {
          const [byRef, byName] = await Promise.all([
            supabase.from(table).select("*").ilike("reference_id", `${raw}%`).limit(50),
            supabase.from(table).select("*").ilike("submitted_by_name", `${raw}%`).limit(50),
          ]);
          if (byRef.error) throw byRef.error;
          if (byName.error) throw byName.error;

          const seen = new Set();
          const docs = [];
          for (const row of [...(byRef.data || []), ...(byName.data || [])]) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            docs.push({ ...fromRow(row), type });
          }
          return docs;
        })
      );

      const allDocs = perTypeResults.flat().filter(inScope);
      allDocs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      const offset = lastDocs.offset || 0;
      const page = allDocs.slice(offset, offset + pageSize);

      return {
        results: page,
        lastDocs: { offset: offset + page.length },
        hasMore: offset + page.length < allDocs.length,
      };
    } catch (error) {
      console.error("Search failed:", error);
      return { results: [], lastDocs: {}, hasMore: false };
    }
  }

}

export const staffService = new StaffService();
