/* eslint-disable no-unused-vars */
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  Timestamp,
  onSnapshot,
  startAfter,
  getCountFromServer,
  increment,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { referenceIdService } from "./referenceIdService";
import {
  extractSchemeId,
  SCHEMES,
  DEMO_SCHEME_ID,
  getInternalSchemeIds,
} from "../utils/schemes";
import { countVehicles, isPureIncident } from "../utils/incidentStats";
import { isVideoFile } from "../utils/fileType";

class StaffService {
  // ============================================
  // ACTIVITY LOGGING (for Notice Board)
  // ============================================

  async logActivity(activityData) {
    try {
      const activitiesRef = collection(db, "activities");
      await addDoc(activitiesRef, {
        ...activityData,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }

  async getRecentActivities(userId, lastLogoutTime, staffGroup = "internal") {
    try {
      const activitiesRef = collection(db, "activities");
      const q = query(
        activitiesRef,
        where("createdAt", ">", lastLogoutTime),
        orderBy("createdAt", "desc"),
        limit(25),
      );

      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
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

  // ============================================
  // CCTV CHECK FORMS
  // ============================================

  async submitCCTVCheckForm(formData, userId, userName) {
    try {
      // Dynamically determine which schemes have data (issues or comments)
      const schemeIds = [];

      // Check A66-WJ section
      const hasA66Data =
        (formData.a66Cameras && formData.a66Cameras.length > 0) ||
        (formData.a66Comments && formData.a66Comments.trim() !== "");
      if (hasA66Data) {
        schemeIds.push("A66-WJ");
      }

      // Check Demo section
      const hasDemoData =
        (formData.demoCameras && formData.demoCameras.length > 0) ||
        (formData.demoComments && formData.demoComments.trim() !== "");
      if (hasDemoData) {
        schemeIds.push("DMO1");
      }

      // If no data in any section (clean check - all cameras working),
      // include the real scheme ID so every client can see the clean check form
      if (schemeIds.length === 0) {
        schemeIds.push("A66-WJ");
      }

      // Use the first scheme as the primary schemeId for backward compatibility
      const schemeId = schemeIds[0];

      // Check if this is a demo submission (only has DMO1 scheme)
      const isDemo = schemeIds.length === 1 && schemeIds[0] === DEMO_SCHEME_ID;

      // Generate reference ID — separate demo counter, or real staff counter
      const referenceId = await referenceIdService.generateReferenceId(
        "cctvCheck",
        isDemo,
      );

      const formsRef = collection(db, "cctvCheckForms");
      const docRef = await addDoc(formsRef, {
        ...formData,
        schemeId, // Keep for backward compatibility
        schemeIds, // New array format for multi-scheme support
        referenceId,
        submittedBy: {
          userId,
          name: userName,
        },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      // CCTV-check deletes are rare and rely on the hourly self-heal recount.
      this._applyCountDelta("cctvCheckForms", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted CCTV Check Form ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to submit CCTV check form:", error);
      throw error;
    }
  }

  async getCCTVCheckForms(userId = null, limitCount = null) {
    try {
      const formsRef = collection(db, "cctvCheckForms");
      let q;

      if (userId) {
        // When fetching for a specific user, apply limit if provided
        q = limitCount
          ? query(
              formsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(limitCount),
            )
          : query(
              formsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
            );
      } else {
        // When fetching all, no limit unless explicitly provided
        q = limitCount
          ? query(formsRef, orderBy("createdAt", "desc"), limit(limitCount))
          : query(formsRef, orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Failed to get CCTV check forms:", error);
      return [];
    }
  }

  // Fetch a single CCTV check form by id (1 read instead of scanning the whole
  // collection). Returns null if it doesn't exist.
  async getCCTVCheckFormById(formId) {
    try {
      const snap = await getDoc(doc(db, "cctvCheckForms", formId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get CCTV check form:", error);
      return null;
    }
  }

  // Single-doc getters (1 read by id) used by the admin detail pages.
  async getIncidentReportById(reportId) {
    try {
      const snap = await getDoc(doc(db, "incidentReports", reportId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get incident report:", error);
      return null;
    }
  }

  async getDailyOccurrenceReportById(reportId) {
    try {
      const snap = await getDoc(doc(db, "dailyOccurrenceReports", reportId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get daily occurrence report:", error);
      return null;
    }
  }

  async updateCCTVCheckForm(formId, formData, userId, userName) {
    try {
      const formRef = doc(db, "cctvCheckForms", formId);
      const formDoc = await getDoc(formRef);

      if (!formDoc.exists()) {
        throw new Error("Form not found");
      }

      const currentData = formDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      // Dynamically determine which schemes have data (issues or comments)
      const schemeIds = [];

      // Check A66-WJ section
      const hasA66Data =
        (formData.a66Cameras && formData.a66Cameras.length > 0) ||
        (formData.a66Comments && formData.a66Comments.trim() !== "");
      if (hasA66Data) {
        schemeIds.push("A66-WJ");
      }

      // Check Demo section
      const hasDemoData =
        (formData.demoCameras && formData.demoCameras.length > 0) ||
        (formData.demoComments && formData.demoComments.trim() !== "");
      if (hasDemoData) {
        schemeIds.push("DMO1");
      }

      // If no data in any section (clean check - all cameras working),
      // include the real scheme ID so every client can see the clean check form
      if (schemeIds.length === 0) {
        schemeIds.push("A66-WJ");
      }

      // Use the first scheme as the primary schemeId for backward compatibility
      const schemeId = schemeIds[0];

      await updateDoc(formRef, {
        ...formData,
        schemeId, // Keep for backward compatibility
        schemeIds, // Update array for client filtering
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited CCTV Check Form ${currentData.referenceId}`,
        relatedFormId: formId,
      });

      return formId;
    } catch (error) {
      console.error("Failed to update CCTV check form:", error);
      throw error;
    }
  }

  async deleteCCTVCheckForm(formId, userId, userName) {
    try {
      const formRef = doc(db, "cctvCheckForms", formId);
      const formDoc = await getDoc(formRef);

      if (!formDoc.exists()) {
        throw new Error("Form not found");
      }

      const currentData = formDoc.data();

      await deleteDoc(formRef);

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted CCTV Check Form ${currentData.referenceId}`,
        relatedFormId: formId,
      });

      return formId;
    } catch (error) {
      console.error("Failed to delete CCTV check form:", error);
      throw error;
    }
  }

  // ============================================
  // INCIDENT REPORTS
  // ============================================

  _countVehicles(formData) {
    return countVehicles(formData);
  }

  async _updateSchemeVehicleStats(schemeId, delta) {
    if (!schemeId || delta === 0) return;
    const statsRef = doc(db, "schemeStats", schemeId);
    await setDoc(
      statsRef,
      { totalVehiclesDispatched: increment(delta) },
      { merge: true },
    );
  }

  // Queue a vehicle-stats delta onto an existing batch so the stats update
  // commits atomically with the incident write that caused it.
  _queueSchemeVehicleStats(batch, schemeId, delta) {
    if (!schemeId || delta === 0) return;
    const statsRef = doc(db, "schemeStats", schemeId);
    batch.set(
      statsRef,
      { totalVehiclesDispatched: increment(delta) },
      { merge: true },
    );
  }

  // Recompute schemeStats.totalVehiclesDispatched from scratch by summing every
  // incident report's vehicle count per scheme. Use this to correct any drift
  // accumulated before the atomic writes above (admin/maintenance only).
  // Returns the recomputed totals keyed by schemeId.
  async reconcileSchemeVehicleStats() {
    const snapshot = await getDocs(collection(db, "incidentReports"));
    const totals = {};
    snapshot.forEach((d) => {
      const data = d.data();
      const schemeId =
        data.schemeId || (data.scheme ? extractSchemeId(data.scheme) : null);
      if (!schemeId) return;
      totals[schemeId] = (totals[schemeId] || 0) + this._countVehicles(data);
    });

    const batch = writeBatch(db);
    Object.entries(totals).forEach(([schemeId, total]) => {
      batch.set(
        doc(db, "schemeStats", schemeId),
        { totalVehiclesDispatched: total },
        { merge: true },
      );
    });
    await batch.commit();

    return totals;
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

      // Create the doc ref up-front so the report write and the scheme-stats
      // update can be committed atomically in a single batch.
      const docRef = doc(collection(db, "incidentReports"));
      const batch = writeBatch(db);
      batch.set(docRef, {
        ...formData,
        schemeId, // Keep for backward compatibility
        schemeIds: [schemeId], // New array format for multi-scheme support
        referenceId,
        submittedBy: {
          userId,
          name: userName,
        },
        status, // Use the provided status (defaults to "submitted", can be "live")
        isPureIncident: isPureIncident(formData),
        // Precomputed flag so the CCTV Recordings page can query video reports
        // directly instead of scanning every incident.
        hasVideo: (formData.files || []).some(isVideoFile),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update running vehicle total for this scheme (atomic with the report)
      const vehicleDelta = this._countVehicles(formData);
      this._queueSchemeVehicleStats(batch, schemeId, vehicleDelta);

      await batch.commit();

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      this._applyCountDelta("incidentReports", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Incident Report ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return { id: docRef.id, referenceId };
    } catch (error) {
      console.error("Failed to submit incident report:", error);
      throw error;
    }
  }

  async getIncidentReports(userId = null, limitCount = null, dateRange = null) {
    try {
      const reportsRef = collection(db, "incidentReports");
      // Build constraints so an optional createdAt range can be applied
      // server-side (avoids fetching the whole collection just to filter by
      // date). Range + orderBy on createdAt uses the auto single-field index.
      const constraints = [];
      if (userId) constraints.push(where("submittedBy.userId", "==", userId));
      if (dateRange?.startDate) {
        constraints.push(
          where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate)),
        );
      }
      if (dateRange?.endDate) {
        constraints.push(
          where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate)),
        );
      }
      constraints.push(orderBy("createdAt", "desc"));
      if (limitCount) constraints.push(limit(limitCount));

      const snapshot = await getDocs(query(reportsRef, ...constraints));
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Failed to get incident reports:", error);
      return [];
    }
  }

  async updateReportStatus(reportId, status) {
    try {
      const reportRef = doc(db, "incidentReports", reportId);
      await updateDoc(reportRef, {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to update report status:", error);
      throw error;
    }
  }

  async updateIncidentReport(reportId, formData, userId, userName, isCompletion = false) {
    try {
      const reportRef = doc(db, "incidentReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();

      const extraFields = {};

      if (!isCompletion) {
        const editHistory = currentData.editHistory || [];
        editHistory.push({
          editedBy: { userId, name: userName },
          editedAt: new Date(),
          previousSubmittedBy: currentData.submittedBy,
        });
        extraFields.editHistory = editHistory;
        extraFields.lastEditedBy = { userId, name: userName };
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

      const batch = writeBatch(db);
      batch.update(reportRef, {
        ...formData,
        schemeId: newSchemeId, // Keep for backward compatibility
        schemeIds: [newSchemeId], // Update array for client filtering
        isPureIncident: isPureIncident(formData),
        hasVideo: (finalFiles || []).some(isVideoFile),
        ...extraFields,
        updatedAt: serverTimestamp(),
      });

      // Keep schemeStats correct, including when the scheme itself changes.
      const oldVehicles = this._countVehicles(currentData);
      const newVehicles = this._countVehicles(formData);
      if (oldSchemeId !== newSchemeId) {
        // Move the whole count off the old scheme and onto the new one.
        this._queueSchemeVehicleStats(batch, oldSchemeId, -oldVehicles);
        this._queueSchemeVehicleStats(batch, newSchemeId, newVehicles);
      } else {
        // Same scheme: only apply the difference.
        this._queueSchemeVehicleStats(
          batch,
          newSchemeId,
          newVehicles - oldVehicles,
        );
      }

      await batch.commit();

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
      const reportRef = doc(db, "incidentReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();

      // Delete the report and subtract its vehicles from the running total
      // atomically so the two can never diverge.
      const batch = writeBatch(db);
      batch.delete(reportRef);
      const vehicleDelta = this._countVehicles(currentData);
      if (vehicleDelta > 0) {
        const deletedSchemeId =
          currentData.schemeId || extractSchemeId(currentData.scheme);
        this._queueSchemeVehicleStats(batch, deletedSchemeId, -vehicleDelta);
      }
      await batch.commit();

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      this._applyCountDelta(
        "incidentReports",
        currentData.schemeId === DEMO_SCHEME_ID,
        -1,
      );

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
   * Subscribe to real-time live incidents for Live Operator Dashboard
   * Uses onSnapshot for instant updates - only charges when data changes
   * @param {function} callback - Called with array of live incidents
   * @param {function} onError - Called on error
   * @returns {function} Unsubscribe function
   */
  subscribeLiveIncidents(callback, onError) {
    const reportsRef = collection(db, "incidentReports");
    const q = query(
      reportsRef,
      where("status", "==", "live"),
      orderBy("createdAt", "desc"),
      limit(50), // Reasonable limit for live incidents
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
      onError,
    );
  }

  /**
   * Get count of completed incidents (efficient server-side count)
   * Uses getCountFromServer - only 1 read regardless of document count
   */
  async getCompletedIncidentsCount() {
    try {
      const reportsRef = collection(db, "incidentReports");
      const q = query(reportsRef, where("status", "==", "completed"));
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.error("Failed to get completed incidents count:", error);
      return 0;
    }
  }

  /**
   * Get paginated completed incidents - TRUE server-side pagination
   * Only reads `pageSize` documents per request (massive cost savings!)
   * @param {number} pageSize - Number of documents per page
   * @param {DocumentSnapshot|null} lastDoc - Last document from previous page (cursor)
   * @returns {Promise<{incidents: Array, lastDoc: DocumentSnapshot, hasMore: boolean}>}
   */
  async getCompletedIncidentsPaginated(pageSize = 10, lastDoc = null) {
    try {
      const reportsRef = collection(db, "incidentReports");
      let q;

      if (lastDoc) {
        q = query(
          reportsRef,
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(pageSize),
        );
      } else {
        q = query(
          reportsRef,
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

      return {
        incidents,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error("Failed to get paginated completed incidents:", error);
      return { incidents: [], lastDoc: null, hasMore: false };
    }
  }

  // ============================================
  // CCTV UPLOADS
  // ============================================

  async saveCCTVUploadMetadata(uploadData, userId, userName) {
    try {
      // Extract schemeId from scheme field if present
      const schemeId = uploadData.scheme
        ? extractSchemeId(uploadData.scheme)
        : null;

      const uploadsRef = collection(db, "cctvUploads");
      const docRef = await addDoc(uploadsRef, {
        ...uploadData,
        ...(schemeId && {
          schemeId, // Keep for backward compatibility
          schemeIds: [schemeId], // New array format for multi-scheme support
        }),
        uploadedBy: {
          userId,
          name: userName,
        },
        uploadedAt: serverTimestamp(),
      });

      // Log activity
      await this.logActivity({
        type: "upload",
        staffId: userId,
        staffName: userName,
        description: `${userName} uploaded ${uploadData.fileName}`,
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to save upload metadata:", error);
      throw error;
    }
  }

  async getCCTVUploads(userId = null, limitCount = 50) {
    try {
      const uploadsRef = collection(db, "cctvUploads");
      let q;

      if (userId) {
        q = query(
          uploadsRef,
          where("uploadedBy.userId", "==", userId),
          orderBy("uploadedAt", "desc"),
          limit(limitCount),
        );
      } else {
        q = query(uploadsRef, orderBy("uploadedAt", "desc"), limit(limitCount));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((doc) => doc.deleted !== true);
    } catch (error) {
      console.error("Failed to get CCTV uploads:", error);
      return [];
    }
  }

  async submitCCTVUpload(uploadData, userId, userName) {
    try {
      // Extract schemeId from scheme field if present
      const schemeId = uploadData.scheme
        ? extractSchemeId(uploadData.scheme)
        : null;

      const uploadsRef = collection(db, "cctvUploads");
      const docRef = await addDoc(uploadsRef, {
        ...uploadData,
        ...(schemeId && {
          schemeId, // Keep for backward compatibility
          schemeIds: [schemeId], // New array format for multi-scheme support
        }),
        submittedBy: userName,
        uploadedBy: {
          userId,
          name: userName,
        },
        uploadedAt: serverTimestamp(), // Changed from createdAt to uploadedAt to match query
      });

      // Log activity
      await this.logActivity({
        type: "cctv_upload",
        staffId: userId,
        staffName: userName,
        description: `${userName} uploaded CCTV footage for ${uploadData.scheme} - ${uploadData.cameraNumber}`,
        relatedUploadId: docRef.id,
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to submit CCTV upload:", error);
      throw error;
    }
  }

  async deleteCCTVUpload(uploadId) {
    try {
      const uploadRef = doc(db, "cctvUploads", uploadId);
      await updateDoc(uploadRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to delete CCTV upload:", error);
      throw error;
    }
  }

  // ============================================
  // ASSET DAMAGE REPORTS
  // ============================================

  async submitAssetDamageReport(formData, userId, userName) {
    try {
      // Extract schemeId from scheme field
      const schemeId = extractSchemeId(formData.scheme);

      // Check if this is a demo submission
      const isDemo = schemeId === DEMO_SCHEME_ID;

      // Generate reference ID — separate demo counter, or real staff counter
      const referenceId = await referenceIdService.generateReferenceId(
        "assetDamage",
        isDemo,
      );

      const reportsRef = collection(db, "assetDamageReports");
      const docRef = await addDoc(reportsRef, {
        ...formData,
        schemeId, // Keep for backward compatibility
        schemeIds: [schemeId], // New array format for multi-scheme support
        referenceId,
        submittedBy: {
          userId,
          name: userName,
        },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      this._applyCountDelta("assetDamageReports", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Asset Damage Report ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to submit asset damage report:", error);
      throw error;
    }
  }

  async getAssetDamageReports(userId = null, limitCount = null) {
    try {
      const reportsRef = collection(db, "assetDamageReports");
      let q;

      if (userId) {
        // When fetching for a specific user, apply limit if provided
        q = limitCount
          ? query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(limitCount),
            )
          : query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
            );
      } else {
        // When fetching all, no limit unless explicitly provided
        q = limitCount
          ? query(reportsRef, orderBy("createdAt", "desc"), limit(limitCount))
          : query(reportsRef, orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Failed to get asset damage reports:", error);
      return [];
    }
  }

  async updateAssetDamageReport(reportId, formData, userId, userName) {
    try {
      const reportRef = doc(db, "assetDamageReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      // Recalculate schemeIds when scheme is updated
      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      await updateDoc(reportRef, {
        ...formData,
        schemeId, // Keep for backward compatibility
        schemeIds: [schemeId], // Update array for client filtering
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited Asset Damage Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update asset damage report:", error);
      throw error;
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

      const reportsRef = collection(db, "cabinHealthSafetyChecks");
      const docRef = await addDoc(reportsRef, {
        ...formData,
        schemeId,
        schemeIds: [schemeId],
        referenceId,
        submittedBy: { userId, name: userName },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      this._applyCountDelta("cabinHealthSafetyChecks", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Cabin Health & Safety Check ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to submit cabin health & safety check:", error);
      throw error;
    }
  }

  async getCabinHealthSafetyChecks(userId = null, limitCount = null) {
    try {
      const reportsRef = collection(db, "cabinHealthSafetyChecks");
      let q;

      if (userId) {
        q = limitCount
          ? query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(limitCount),
            )
          : query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
            );
      } else {
        q = limitCount
          ? query(reportsRef, orderBy("createdAt", "desc"), limit(limitCount))
          : query(reportsRef, orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Failed to get cabin health & safety checks:", error);
      return [];
    }
  }

  async getCabinHealthSafetyCheckById(formId) {
    try {
      const snap = await getDoc(doc(db, "cabinHealthSafetyChecks", formId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get cabin health & safety check:", error);
      throw error;
    }
  }

  async updateCabinHealthSafetyCheck(reportId, formData, userId, userName) {
    try {
      const reportRef = doc(db, "cabinHealthSafetyChecks", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      await updateDoc(reportRef, {
        ...formData,
        schemeId,
        schemeIds: [schemeId],
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

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
      const formRef = doc(db, "cabinHealthSafetyChecks", formId);
      const formDoc = await getDoc(formRef);

      if (!formDoc.exists()) {
        throw new Error("Form not found");
      }

      const currentData = formDoc.data();

      await deleteDoc(formRef);

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

      const reportsRef = collection(db, "vehicleDailyChecks");
      const docRef = await addDoc(reportsRef, {
        ...formData,
        schemeId,
        schemeIds: [schemeId],
        referenceId,
        submittedBy: { userId, name: userName },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      this._applyCountDelta("vehicleDailyChecks", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Vehicle Daily Check ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to submit vehicle daily check:", error);
      throw error;
    }
  }

  async getVehicleDailyChecks(userId = null, limitCount = null) {
    try {
      const reportsRef = collection(db, "vehicleDailyChecks");
      let q;

      if (userId) {
        q = limitCount
          ? query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(limitCount),
            )
          : query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
            );
      } else {
        q = limitCount
          ? query(reportsRef, orderBy("createdAt", "desc"), limit(limitCount))
          : query(reportsRef, orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Failed to get vehicle daily checks:", error);
      return [];
    }
  }

  async getVehicleDailyCheckById(formId) {
    try {
      const snap = await getDoc(doc(db, "vehicleDailyChecks", formId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get vehicle daily check:", error);
      throw error;
    }
  }

  async updateVehicleDailyCheck(reportId, formData, userId, userName) {
    try {
      const reportRef = doc(db, "vehicleDailyChecks", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      await updateDoc(reportRef, {
        ...formData,
        schemeId,
        schemeIds: [schemeId],
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

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
      const formRef = doc(db, "vehicleDailyChecks", formId);
      const formDoc = await getDoc(formRef);

      if (!formDoc.exists()) {
        throw new Error("Form not found");
      }

      const currentData = formDoc.data();

      await deleteDoc(formRef);

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

      const allocationsRef = collection(db, "dailyAllocations");
      const docRef = await addDoc(allocationsRef, {
        ...formData,
        schemeIds: [formData.schemeId],
        referenceId,
        submittedBy: { userId, name: userName },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { id: docRef.id, referenceId };
    } catch (error) {
      console.error("Failed to submit daily allocation:", error);
      throw error;
    }
  }

  async updateDailyAllocation(allocationId, formData, userId, userName) {
    try {
      const allocationRef = doc(db, "dailyAllocations", allocationId);
      const allocationDoc = await getDoc(allocationRef);

      if (!allocationDoc.exists()) {
        throw new Error("Allocation not found");
      }

      const currentData = allocationDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      await updateDoc(allocationRef, {
        ...formData,
        schemeIds: [formData.schemeId],
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      return allocationId;
    } catch (error) {
      console.error("Failed to update daily allocation:", error);
      throw error;
    }
  }

  async getDailyAllocationById(allocationId) {
    try {
      const snap = await getDoc(doc(db, "dailyAllocations", allocationId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("Failed to get daily allocation:", error);
      throw error;
    }
  }

  async deleteDailyAllocation(allocationId) {
    return this.deleteReport("dailyAllocations", allocationId);
  }

  // ─── CCTV Faults ────────────────────────────────────────────────────────────

  async submitCCTVFaultsReport(formData, userId, userName) {
    try {
      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : null;
      const isDemo = schemeId === DEMO_SCHEME_ID;
      const referenceId = await referenceIdService.generateReferenceId(
        "cctvFaults",
        isDemo,
      );

      const docRef = await addDoc(collection(db, "cctvFaultsReports"), {
        ...formData,
        type: "CCTV Faults",
        status: "live",
        schemeId,
        schemeIds: [schemeId],
        referenceId,
        submittedBy: { userId, name: userName },
        clientAcknowledged: false,
        clientNote: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      this._applyCountDelta("cctvFaultsReports", isDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted CCTV Fault Report ${referenceId}`,
        relatedFormId: docRef.id,
      });

      return { id: docRef.id, referenceId };
    } catch (error) {
      console.error("Failed to submit CCTV fault report:", error);
      throw error;
    }
  }

  async getCCTVFaultsReports() {
    try {
      const q = query(
        collection(db, "cctvFaultsReports"),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Failed to get CCTV fault reports:", error);
      return [];
    }
  }

  async updateCCTVFaultsReport(reportId, formData, userId, userName) {
    try {
      const reportRef = doc(db, "cctvFaultsReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) throw new Error("Report not found");

      const currentData = reportDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      const schemeId = formData.scheme
        ? extractSchemeId(formData.scheme)
        : currentData.schemeId;

      await updateDoc(reportRef, {
        ...formData,
        schemeId,
        schemeIds: [schemeId],
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited CCTV Fault Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update CCTV fault report:", error);
      throw error;
    }
  }

  // Real-time subscription to live CCTV faults, scoped to a viewer's scheme set.
  // schemeScope: array of scheme IDs the viewer may see (real staff → internal
  // schemes; demo → demo scheme). Falls back to the internal schemes if none is
  // supplied. One listener per scheme — avoids a composite index and the "in"-operator crash.
  subscribeAllLiveCCTVFaults(callback, onError, schemeScope = null) {
    const scope =
      schemeScope && schemeScope.length > 0
        ? schemeScope
        : getInternalSchemeIds();

    const resultsByScheme = {};
    const unsubs = scope.map((schemeId) => {
      const q = query(
        collection(db, "cctvFaultsReports"),
        where("status", "==", "live"),
        where("schemeId", "==", schemeId),
        orderBy("createdAt", "desc"),
        limit(100),
      );
      return onSnapshot(
        q,
        (snapshot) => {
          resultsByScheme[schemeId] = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          const merged = Object.values(resultsByScheme)
            .flat()
            .sort(
              (a, b) =>
                (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
            );
          callback(merged);
        },
        (err) => {
          if (onError) onError(err);
        },
      );
    });
    return () => unsubs.forEach((u) => u());
  }

  async completeCCTVFault(reportId, userId, userName) {
    try {
      const reportRef = doc(db, "cctvFaultsReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) throw new Error("Report not found");

      const { referenceId } = reportDoc.data();

      await updateDoc(reportRef, {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "form_completed",
        staffId: userId,
        staffName: userName,
        description: `${userName} marked CCTV Fault Report ${referenceId} as completed`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to complete CCTV fault report:", error);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  async deleteAssetDamageReport(reportId, userId, userName) {
    try {
      const reportRef = doc(db, "assetDamageReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();

      await deleteDoc(reportRef);

      // Keep the live dashboard counter in step (decoupled, non-fatal).
      this._applyCountDelta(
        "assetDamageReports",
        currentData.schemeId === DEMO_SCHEME_ID,
        -1,
      );

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted Asset Damage Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to delete asset damage report:", error);
      throw error;
    }
  }

  // ============================================
  // DAILY OCCURRENCE REPORTS
  // ============================================

  async submitDailyOccurrenceReport(formData, userId, userName) {
    try {
      // Get the date from the first occurrence to check for existing reports
      const firstOccurrenceDate = formData.occurrences[0]?.date;

      if (!firstOccurrenceDate) {
        throw new Error("At least one occurrence with a date is required");
      }

      // Check if a report already exists for this date
      const reportsRef = collection(db, "dailyOccurrenceReports");
      const dateQuery = query(
        reportsRef,
        where("occurrences", "!=", null),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(dateQuery);
      let existingReport = null;

      // Determine if the new submission is from a demo scheme
      const newSubmissionSchemeId = formData.occurrences[0]?.scheme
        ? extractSchemeId(formData.occurrences[0].scheme)
        : null;
      const isNewSubmissionDemo = newSubmissionSchemeId === DEMO_SCHEME_ID;

      // Find existing report with matching date AND same demo/real status
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.occurrences && data.occurrences.length > 0) {
          // Check if any occurrence in the existing report matches today's date
          const hasMatchingDate = data.occurrences.some(
            (occ) => occ.date === firstOccurrenceDate,
          );
          if (hasMatchingDate) {
            // Use the report's schemeIds array directly (more reliable than extracting from occurrences)
            // This correctly handles "All Schemes" which stores ["A417", "M3", "A47"] without DMO1
            const reportSchemeIds = data.schemeIds || [];

            const hasAnyDemo = reportSchemeIds.includes(DEMO_SCHEME_ID);
            const hasOnlyDemo =
              reportSchemeIds.length > 0 &&
              reportSchemeIds.every((id) => id === DEMO_SCHEME_ID);

            // For demo submission: only merge with reports that are EXCLUSIVELY demo
            // For real submission: only merge with reports that have NO demo schemes
            if (isNewSubmissionDemo) {
              // Demo staff: only merge with purely demo reports (schemeIds contains only DMO1)
              if (hasOnlyDemo) {
                existingReport = { id: docSnap.id, ...data };
                break;
              }
            } else {
              // Real staff: only merge with reports that have NO demo schemes at all
              if (!hasAnyDemo) {
                existingReport = { id: docSnap.id, ...data };
                break;
              }
            }
          }
        }
      }

      // If an existing report is found, merge the occurrences
      if (existingReport) {
        // Combine existing occurrences with new ones
        const mergedOccurrences = [
          ...existingReport.occurrences,
          ...formData.occurrences,
        ];

        // Recalculate schemeIds from all occurrences
        const hasAllSchemes = mergedOccurrences.some(
          (occ) => occ.scheme === "All Schemes",
        );
        let schemeIds;
        if (hasAllSchemes) {
          // Exclude demo scheme from "All Schemes"
          schemeIds = SCHEMES.filter((scheme) => !scheme.isDemo).map(
            (scheme) => scheme.id,
          );
        } else {
          schemeIds = [
            ...new Set(
              mergedOccurrences
                .map((occ) => (occ.scheme ? extractSchemeId(occ.scheme) : null))
                .filter((id) => id !== null),
            ),
          ];
        }

        // Update the existing report
        const reportRef = doc(db, "dailyOccurrenceReports", existingReport.id);
        await updateDoc(reportRef, {
          occurrences: mergedOccurrences,
          schemeIds,
          updatedAt: serverTimestamp(),
          lastAddedBy: {
            userId,
            name: userName,
            addedAt: serverTimestamp(),
          },
        });

        // Log activity
        await this.logActivity({
          type: "form_updated",
          staffId: userId,
          staffName: userName,
          description: `${userName} added ${formData.occurrences.length} occurrence(s) to Daily Occurrence Report ${existingReport.referenceId} for ${firstOccurrenceDate}`,
          relatedFormId: existingReport.id,
        });

        return {
          id: existingReport.id,
          merged: true,
          referenceId: existingReport.referenceId,
        };
      }

      // No existing report found - create a new one
      // Generate reference ID — separate demo counter, or real staff counter
      const referenceId = await referenceIdService.generateReferenceId(
        "dailyOccurrence",
        isNewSubmissionDemo,
      );

      // Extract unique schemeIds from all occurrences
      const hasAllSchemes = formData.occurrences.some(
        (occ) => occ.scheme === "All Schemes",
      );
      let schemeIds;
      if (hasAllSchemes) {
        // Exclude demo scheme from "All Schemes"
        schemeIds = SCHEMES.filter((scheme) => !scheme.isDemo).map(
          (scheme) => scheme.id,
        );
      } else {
        schemeIds = [
          ...new Set(
            formData.occurrences
              .map((occ) => (occ.scheme ? extractSchemeId(occ.scheme) : null))
              .filter((id) => id !== null),
          ),
        ];
      }

      const docRef = await addDoc(reportsRef, {
        ...formData,
        schemeIds,
        referenceId,
        submittedBy: {
          userId,
          name: userName,
        },
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Only a brand-new document changes the count — the merge path above
      // returns early and doesn't reach here, so +1 here is always correct.
      this._applyCountDelta("dailyOccurrenceReports", isNewSubmissionDemo, 1);

      await this.logActivity({
        type: "form_submitted",
        staffId: userId,
        staffName: userName,
        description: `${userName} submitted Daily Occurrence Report ${referenceId}`,
        relatedFormId: docRef.id,
        staffGroup: "internal",
      });

      return { id: docRef.id, merged: false, referenceId };
    } catch (error) {
      console.error("Failed to submit daily occurrence report:", error);
      throw error;
    }
  }

  async getDailyOccurrenceReports(userId = null, limitCount = null) {
    try {
      const reportsRef = collection(db, "dailyOccurrenceReports");
      let q;

      if (userId) {
        // When fetching for a specific user, apply limit if provided
        q = limitCount
          ? query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(limitCount),
            )
          : query(
              reportsRef,
              where("submittedBy.userId", "==", userId),
              orderBy("createdAt", "desc"),
            );
      } else {
        // When fetching all, no limit unless explicitly provided
        q = limitCount
          ? query(reportsRef, orderBy("createdAt", "desc"), limit(limitCount))
          : query(reportsRef, orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Failed to get daily occurrence reports:", error);
      return [];
    }
  }

  async updateDailyOccurrenceReport(reportId, formData, userId, userName) {
    try {
      const reportRef = doc(db, "dailyOccurrenceReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        previousSubmittedBy: currentData.submittedBy,
      });

      // Recalculate schemeIds when occurrences are updated
      // Check if any occurrence has "All Schemes"
      const hasAllSchemes = formData.occurrences?.some(
        (occ) => occ.scheme === "All Schemes",
      );

      let schemeIds;
      if (hasAllSchemes) {
        // Include all scheme IDs except demo when "All Schemes" is selected
        schemeIds = SCHEMES.filter((scheme) => !scheme.isDemo).map(
          (scheme) => scheme.id,
        );
      } else if (formData.occurrences) {
        // Extract unique scheme IDs from occurrences
        schemeIds = [
          ...new Set(
            formData.occurrences
              .map((occ) => (occ.scheme ? extractSchemeId(occ.scheme) : null))
              .filter((id) => id !== null),
          ),
        ];
      } else {
        // Fallback to current schemeIds if no occurrences in formData
        schemeIds = currentData.schemeIds || [];
      }

      await updateDoc(reportRef, {
        ...formData,
        schemeIds, // Update array for client filtering
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "form_edited",
        staffId: userId,
        staffName: userName,
        description: `${userName} edited Daily Occurrence Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to update daily occurrence report:", error);
      throw error;
    }
  }

  async deleteDailyOccurrenceReport(reportId, userId, userName) {
    try {
      const reportRef = doc(db, "dailyOccurrenceReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();

      await deleteDoc(reportRef);

      // A delete always removes one whole document → total −1. (Daily-log
      // counts use the collection total, so demo status is irrelevant here.)
      this._applyCountDelta("dailyOccurrenceReports", false, -1);

      await this.logActivity({
        type: "form_deleted",
        staffId: userId,
        staffName: userName,
        description: `${userName} deleted Daily Occurrence Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return reportId;
    } catch (error) {
      console.error("Failed to delete daily occurrence report:", error);
      throw error;
    }
  }

  // Remove a single occurrence from a daily occurrence report (admin only)
  async removeOccurrenceFromReport(
    reportId,
    occurrenceIndex,
    userId,
    userName,
  ) {
    try {
      const reportRef = doc(db, "dailyOccurrenceReports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        throw new Error("Report not found");
      }

      const currentData = reportDoc.data();
      const occurrences = currentData.occurrences || [];

      if (occurrenceIndex < 0 || occurrenceIndex >= occurrences.length) {
        throw new Error("Invalid occurrence index");
      }

      // Get the occurrence being removed for logging
      const removedOccurrence = occurrences[occurrenceIndex];

      // Remove the occurrence at the specified index
      const updatedOccurrences = occurrences.filter(
        (_, i) => i !== occurrenceIndex,
      );

      // If no occurrences left, delete the entire report
      if (updatedOccurrences.length === 0) {
        await deleteDoc(reportRef);

        // Whole document removed → total −1.
        this._applyCountDelta("dailyOccurrenceReports", false, -1);

        await this.logActivity({
          type: "form_deleted",
          staffId: userId,
          staffName: userName,
          description: `${userName} deleted Daily Occurrence Report ${currentData.referenceId} (last occurrence removed)`,
          relatedFormId: reportId,
        });

        return { deleted: true, reportId };
      }

      // Recalculate schemeIds from remaining occurrences
      const hasAllSchemes = updatedOccurrences.some(
        (occ) => occ.scheme === "All Schemes",
      );

      let schemeIds;
      if (hasAllSchemes) {
        schemeIds = SCHEMES.filter((scheme) => !scheme.isDemo).map(
          (scheme) => scheme.id,
        );
      } else {
        schemeIds = [
          ...new Set(
            updatedOccurrences
              .map((occ) => extractSchemeId(occ.scheme))
              .filter(Boolean),
          ),
        ];
      }

      // Update edit history
      const editHistory = currentData.editHistory || [];
      editHistory.push({
        editedBy: { userId, name: userName },
        editedAt: new Date(),
        action: "occurrence_removed",
        removedOccurrence: {
          date: removedOccurrence.date,
          time: removedOccurrence.time,
          scheme: removedOccurrence.scheme,
        },
      });

      await updateDoc(reportRef, {
        occurrences: updatedOccurrences,
        schemeIds,
        editHistory,
        lastEditedBy: { userId, name: userName },
        updatedAt: serverTimestamp(),
      });

      await this.logActivity({
        type: "occurrence_removed",
        staffId: userId,
        staffName: userName,
        description: `${userName} removed occurrence #${occurrenceIndex + 1} from Daily Occurrence Report ${currentData.referenceId}`,
        relatedFormId: reportId,
      });

      return {
        deleted: false,
        reportId,
        remainingOccurrences: updatedOccurrences.length,
      };
    } catch (error) {
      console.error("Failed to remove occurrence from report:", error);
      throw error;
    }
  }

  // Generic delete report function for admin use
  async deleteReport(collectionName, reportId) {
    try {
      const reportRef = doc(db, collectionName, reportId);
      await deleteDoc(reportRef);
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
        cctvForms,
        incidentReports,
        assetDamageReports,
        dailyOccurrenceReports,
        cctvFaultsReports,
        cabinSafetyChecks,
        vehicleDailyChecks,
      ] = await Promise.all([
        this.fetchPaginatedForms(
          "cctvCheckForms",
          perTypeLimit,
          cursors.cctv,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "incidentReports",
          perTypeLimit,
          cursors.incident,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "assetDamageReports",
          perTypeLimit,
          cursors.assetDamage,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "dailyOccurrenceReports",
          perTypeLimit,
          cursors.dailyOccurrence,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "cctvFaultsReports",
          perTypeLimit,
          cursors.cctvFaults,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "cabinHealthSafetyChecks",
          perTypeLimit,
          cursors.cabinSafety,
          schemeIds,
        ),
        this.fetchPaginatedForms(
          "vehicleDailyChecks",
          perTypeLimit,
          cursors.vehicleCheck,
          schemeIds,
        ),
      ]);

      // Transform and combine all forms — tag each with its source for cursor tracking
      const allForms = [
        ...cctvForms.docs.map((f) => ({
          ...f,
          type: "CCTV Check Sheet",
          _source: "cctv",
        })),
        ...incidentReports.docs.map((f) => ({
          ...f,
          type: "Incident Report",
          _source: "incident",
        })),
        ...assetDamageReports.docs.map((f) => ({
          ...f,
          type: "Asset Damage",
          _source: "assetDamage",
        })),
        ...dailyOccurrenceReports.docs.map((f) => ({
          ...f,
          type: "Daily Occurrence",
          _source: "dailyOccurrence",
        })),
        ...cctvFaultsReports.docs.map((f) => ({
          ...f,
          type: "CCTV Faults",
          _source: "cctvFaults",
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
        .sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        })
        .slice(0, pageSize);

      // Only advance cursors for collections that had docs included in the final slice.
      // This prevents skipping unseen docs from collections that were fetched but not displayed.
      const newCursors = { ...cursors };
      sortedForms.forEach((form) => {
        if (form._firestoreDoc) {
          newCursors[form._source] = form._firestoreDoc;
        }
      });

      // Clean internal tracking fields before returning
      const cleanForms = sortedForms.map(
        ({ _source, _firestoreDoc, ...rest }) => rest,
      );

      return {
        forms: cleanForms,
        cursors: newCursors,
        hasMore:
          cctvForms.hasMore ||
          incidentReports.hasMore ||
          assetDamageReports.hasMore ||
          dailyOccurrenceReports.hasMore ||
          cctvFaultsReports.hasMore ||
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
      "cctv-check": { collection: "cctvCheckForms", label: "CCTV Check Sheet" },
      incident: { collection: "incidentReports", label: "Incident Report" },
      "asset-damage": {
        collection: "assetDamageReports",
        label: "Asset Damage",
      },
      "daily-occurrence": {
        collection: "dailyOccurrenceReports",
        label: "Daily Occurrence",
      },
      "cctv-faults": { collection: "cctvFaultsReports", label: "CCTV Faults" },
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
      const result = await this.fetchPaginatedForms(
        config.collection,
        pageSize,
        lastDoc,
        schemeId,
      );
      const forms = result.docs.map(({ _firestoreDoc, ...f }) => ({
        ...f,
        type: config.label,
      }));
      return { forms, lastDoc: result.lastDoc, hasMore: result.hasMore };
    } catch (error) {
      console.error(`Error fetching ${formType} forms:`, error);
      return { forms: [], lastDoc: null, hasMore: false };
    }
  }

  /**
   * Helper method to fetch paginated documents from a collection
   */
  async fetchPaginatedForms(
    collectionName,
    limitCount,
    lastDoc,
    schemeIds = null,
  ) {
    try {
      const collectionRef = collection(db, collectionName);
      // Build query constraints: optional scheme filter + orderBy + optional cursor + limit
      const constraints = [];
      if (schemeIds && schemeIds.length > 0) {
        constraints.push(where("schemeIds", "array-contains-any", schemeIds));
      }
      constraints.push(orderBy("createdAt", "desc"));
      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }
      constraints.push(limit(limitCount));

      const q = query(collectionRef, ...constraints);

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
      console.error(`Error fetching from ${collectionName}:`, error);
      return { docs: [], lastDoc: null, hasMore: false };
    }
  }

  /**
   * Count a collection scoped to a viewer's scheme set.
   * schemeScope: array of scheme IDs the viewer may see (real staff → internal
   * schemes; TP staff → company schemes; demo → demo scheme). Always scoped via
   * `schemeIds array-contains-any`, so the count matches exactly what the list
   * query returns. Falls back to the cached non-demo aggregate if no scope.
   */
  countForScope(collectionName, schemeScope) {
    if (schemeScope && schemeScope.length > 0) {
      return this.getCollectionCountServerBySchemeIds(
        collectionName,
        schemeScope,
      );
    }
    return this.getCollectionCountCached(collectionName, { excludeDemo: true });
  }

  /**
   * Get total count of all forms, scoped to the viewer's scheme set.
   * schemeScope: array of scheme IDs (see countForScope).
   */
  async getAllFormsCount(schemeScope = null) {
    try {
      const countFn = (col) => this.countForScope(col, schemeScope);

      const [
        cctvCount,
        incidentCount,
        assetCount,
        dailyCount,
        cctvFaultsCount,
        cabinSafetyCount,
        vehicleCheckCount,
      ] = await Promise.all([
        countFn("cctvCheckForms"),
        countFn("incidentReports"),
        countFn("assetDamageReports"),
        countFn("dailyOccurrenceReports"),
        countFn("cctvFaultsReports"),
        countFn("cabinHealthSafetyChecks"),
        countFn("vehicleDailyChecks"),
      ]);

      return (
        cctvCount +
        incidentCount +
        assetCount +
        dailyCount +
        cctvFaultsCount +
        cabinSafetyCount +
        vehicleCheckCount
      );
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

      const [
        cctvCount,
        incidentCount,
        assetCount,
        dailyCount,
        cctvFaultsCount,
        cabinSafetyCount,
        vehicleCheckCount,
      ] = await Promise.all([
        countFn("cctvCheckForms"),
        countFn("incidentReports"),
        countFn("assetDamageReports"),
        countFn("dailyOccurrenceReports"),
        countFn("cctvFaultsReports"),
        countFn("cabinHealthSafetyChecks"),
        countFn("vehicleDailyChecks"),
      ]);
      return {
        cctvCheckTotal: cctvCount,
        incidentReportTotal: incidentCount,
        assetDamageTotal: assetCount,
        dailyLogsTotal: dailyCount,
        cctvFaultsTotal: cctvFaultsCount,
        cabinSafetyTotal: cabinSafetyCount,
        vehicleCheckTotal: vehicleCheckCount,
      };
    } catch (error) {
      console.warn("Could not get forms count by type:", error);
      return {
        cctvCheckTotal: 0,
        incidentReportTotal: 0,
        assetDamageTotal: 0,
        dailyLogsTotal: 0,
        cctvFaultsTotal: 0,
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
      "cctv-check": "cctvCheckForms",
      incident: "incidentReports",
      "asset-damage": "assetDamageReports",
      "daily-occurrence": "dailyOccurrenceReports",
      "cctv-faults": "cctvFaultsReports",
      "cabin-safety": "cabinHealthSafetyChecks",
      "vehicle-check": "vehicleDailyChecks",
    };
    const collectionName = collectionMap[formType];
    if (!collectionName) return 0;
    return await this.countForScope(collectionName, schemeScope);
  }

  /**
   * Helper: count documents excluding demo submissions.
   * Uses two positive aggregations (total − demo) instead of a `!=` inequality
   * scan — same result for these schemeId-bearing collections, but avoids the
   * inequality index scan.
   */
  async getCollectionCountServerExcludeDemo(collectionName) {
    try {
      const collectionRef = collection(db, collectionName);
      const [totalSnap, demoSnap] = await Promise.all([
        getCountFromServer(collectionRef),
        getCountFromServer(
          query(collectionRef, where("schemeId", "==", DEMO_SCHEME_ID)),
        ),
      ]);
      return totalSnap.data().count - demoSnap.data().count;
    } catch (error) {
      console.warn(
        `Could not get non-demo count for ${collectionName}:`,
        error,
      );
      return 0;
    }
  }

  async getCollectionCountServerBySchemeIds(collectionName, schemeIds) {
    try {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, where("schemeIds", "array-contains-any", schemeIds));
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.warn(`Could not get scheme-scoped count for ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Hybrid live counter. Reads a shared summary doc (1 read). The doc's `count`
   * is kept LIVE by `_applyCountDelta` (+1 on create, −1 on delete), so reads
   * are both cheap and up-to-the-second. A full recount runs at most once per
   * SELF_HEAL window: if the stored count was last reconciled longer ago than
   * that (or the doc is missing), we recompute the true count via aggregation
   * and reset the baseline — so any missed/incorrect increment self-corrects.
   * Used for the all-time dashboard totals (not date-range counts).
   */
  async getCollectionCountCached(collectionName, { excludeDemo = false } = {}) {
    const SELF_HEAL_TTL_MS = 60 * 60 * 1000; // recount baseline at most hourly
    const cacheRef = doc(
      db,
      "collectionStatsCache",
      excludeDemo ? `${collectionName}__nondemo` : collectionName,
    );

    try {
      const snap = await getDoc(cacheRef);
      if (snap.exists()) {
        const cached = snap.data();
        if (
          typeof cached.count === "number" &&
          cached.cachedAt &&
          Date.now() - cached.cachedAt.toMillis() < SELF_HEAL_TTL_MS
        ) {
          return cached.count;
        }
      }
    } catch {
      // Cache read failed — fall through to a fresh aggregation.
    }

    const count = excludeDemo
      ? await this.getCollectionCountServerExcludeDemo(collectionName)
      : await this.getCollectionCountServer(collectionName);

    // Fire-and-forget cache write (don't block or fail the read).
    setDoc(cacheRef, {
      count,
      collectionName,
      excludeDemo,
      cachedAt: serverTimestamp(),
    }).catch(() => {});

    return count;
  }

  /**
   * Keep the live counters in step with a create (+1) or delete (−1). Updates
   * the collection total and, when the doc isn't a demo submission, the
   * non-demo total. Fire-and-forget and fully decoupled from the form write —
   * if it fails (e.g. rules not yet deployed) the form is unaffected and the
   * hourly recount in getCollectionCountCached corrects the number.
   */
  _applyCountDelta(collectionName, isDemo, delta) {
    try {
      setDoc(
        doc(db, "collectionStatsCache", collectionName),
        { count: increment(delta) },
        { merge: true },
      ).catch(() => {});
      if (!isDemo) {
        setDoc(
          doc(db, "collectionStatsCache", `${collectionName}__nondemo`),
          { count: increment(delta) },
          { merge: true },
        ).catch(() => {});
      }
    } catch {
      // Never let counter maintenance affect the caller.
    }
  }

  /**
   * Force a fresh recount of one counter doc and write it as the new baseline.
   * Used by the admin "Backfill collection stats" utility to seed/reset the
   * live counters to the true values. Returns the computed count.
   */
  async recountCollectionStat(collectionName, excludeDemo = false) {
    const count = excludeDemo
      ? await this.getCollectionCountServerExcludeDemo(collectionName)
      : await this.getCollectionCountServer(collectionName);
    const cacheRef = doc(
      db,
      "collectionStatsCache",
      excludeDemo ? `${collectionName}__nondemo` : collectionName,
    );
    await setDoc(cacheRef, {
      count,
      collectionName,
      excludeDemo,
      cachedAt: serverTimestamp(),
    });
    return count;
  }

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

    const termRef = raw.toUpperCase();
    const termName = raw;
    const termRefEnd = termRef + "";
    const termNameEnd = termName + "";

    const COLLECTIONS = [
      { name: "incidentReports",        key: "incident",        type: "Incident Report" },
      { name: "assetDamageReports",     key: "assetDamage",     type: "Asset Damage" },
      { name: "dailyOccurrenceReports", key: "dailyOccurrence", type: "Daily Occurrence" },
      { name: "cctvCheckForms",         key: "cctv",            type: "CCTV Check Sheet" },
      { name: "cctvFaultsReports",      key: "cctvFaults",      type: "CCTV Faults" },
      { name: "cabinHealthSafetyChecks", key: "cabinSafety",    type: "Cabin H&S Check" },
      { name: "vehicleDailyChecks",     key: "vehicleCheck",    type: "Vehicle Daily Check" },
    ];

    // Fetch pageSize+1 per collection so we can detect hasMore
    const fetchLimit = pageSize + 1;

    const buildQuery = (collName, field, start, end, cursor) => {
      const constraints = [
        where(field, ">=", start),
        where(field, "<=", end),
        orderBy(field, "asc"),
      ];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(fetchLimit));
      return query(collection(db, collName), ...constraints);
    };

    // Per collection: run refId query + name query in parallel, deduplicate
    const perCollectionResults = await Promise.all(
      COLLECTIONS.map(async ({ name, key, type }) => {
        const cursor = lastDocs[key] || null;
        const [refSnap, nameSnap] = await Promise.all([
          getDocs(buildQuery(name, "referenceId",      termRef,  termRefEnd,  cursor)),
          getDocs(buildQuery(name, "submittedBy.name", termName, termNameEnd, cursor)),
        ]);

        const seen = new Set();
        const docs = [];
        for (const snap of [refSnap, nameSnap]) {
          for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            docs.push({ id: d.id, ...d.data(), type, _firestoreDoc: d, _key: key });
          }
        }
        return docs;
      })
    );

    const allDocs = perCollectionResults.flat().filter(inScope);

    // Sort by createdAt desc
    allDocs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    const hasMore = allDocs.length > pageSize;
    const page = allDocs.slice(0, pageSize);

    // Build new cursor map from the last doc of each collection that appeared in this page
    const newLastDocs = { ...lastDocs };
    page.forEach((doc) => {
      newLastDocs[doc._key] = doc._firestoreDoc;
    });

    const results = page.map(({ _firestoreDoc, _key, ...rest }) => rest);

    return { results, lastDocs: newLastDocs, hasMore };
  }

  async searchFormsByReferenceId(searchTerm) {
    const raw = searchTerm.trim();
    if (!raw) return [];
    const termRef = raw.toUpperCase();
    const termName = raw;
    const termRefEnd = termRef + "\uf8ff";
    const termNameEnd = termName + "\uf8ff";

    const COLLECTIONS = [
      { name: "incidentReports", type: "Incident Report" },
      { name: "assetDamageReports", type: "Asset Damage" },
      { name: "dailyOccurrenceReports", type: "Daily Occurrence" },
      { name: "cctvCheckForms", type: "CCTV Check Sheet" },
      { name: "cctvFaultsReports", type: "CCTV Faults" },
      { name: "cabinHealthSafetyChecks", type: "Cabin H&S Check" },
      { name: "vehicleDailyChecks", type: "Vehicle Daily Check" },
    ];

    // Run referenceId and submittedBy.name queries in parallel
    const [refSnapshots, nameSnapshots] = await Promise.all([
      Promise.all(
        COLLECTIONS.map(({ name }) =>
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
      Promise.all(
        COLLECTIONS.map(({ name }) =>
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
    ]);

    const seen = new Set();
    const results = [];

    const addDocs = (snapshots) => {
      snapshots.forEach((snap, i) => {
        const { type } = COLLECTIONS[i];
        snap.docs.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          results.push({ id: d.id, ...d.data(), type });
        });
      });
    };

    addDocs(refSnapshots);
    addDocs(nameSnapshots);

    results.sort(
      (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
    );
    return results.slice(0, 20);
  }

  /**
   * Helper to get count from a collection using server-side counting (includes all docs)
   */
  async getCollectionCountServer(collectionName) {
    try {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getCountFromServer(collectionRef);
      return snapshot.data().count;
    } catch (error) {
      console.warn(`Could not get count for ${collectionName}:`, error);
      return 0;
    }
  }
}

export const staffService = new StaffService();
