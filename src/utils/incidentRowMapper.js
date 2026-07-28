// Maps between the Postgres incident_reports table (snake_case) and the
// camelCase shape the app already expects from the old Firestore documents
// — shared by staffService.js and clientDataService.js so forms, view
// pages, and pdfGenerator.js keep working unmodified against either.

export const fromIncidentRow = (row) => {
  if (!row) return null;
  const {
    id, first_name, scheme, driver_name, vehicle_allocated, job_source,
    customer_log_no, date, time, notes, driver_on_scene, police_on_scene,
    nh_on_scene, ripv_on_scene, time_of_arrival, marker_post, vehicle_type,
    time_completed, vehicle_reg_no, vehicle_make_model, vehicle_colour,
    transmission, no_of_passengers, speedo, has_caravan_trailer,
    trailer_number, fault_reported, actual_fault, checks, vehicle_condition,
    recovery_destination, storage_name, storage_address, storage_contact_no,
    storage_email, property_removed, vehicle_outcome, service_acceptance,
    name, satisfaction_confirmed, signature_url, time_spotted_to_on,
    time_onsite_to_cleared, scheme_id, scheme_ids, reference_id,
    submitted_by_user_id, submitted_by_name, status, current_step, is_pure_incident,
    has_video, files, created_at, updated_at, edit_history,
    last_edited_by_user_id, last_edited_by_name,
  } = row;

  return {
    id, firstName: first_name, scheme, driverName: driver_name,
    vehicleAllocated: vehicle_allocated, jobSource: job_source,
    customerLogNo: customer_log_no, date, time, notes,
    driverOnScene: driver_on_scene, policeOnScene: police_on_scene,
    nhOnScene: nh_on_scene, ripvOnScene: ripv_on_scene,
    timeOfArrival: time_of_arrival, markerPost: marker_post,
    vehicleType: vehicle_type, timeCompleted: time_completed,
    vehicleRegNo: vehicle_reg_no, vehicleMakeModel: vehicle_make_model,
    vehicleColour: vehicle_colour, transmission,
    noOfPassengers: no_of_passengers, speedo,
    hasCaravanTrailer: has_caravan_trailer, trailerNumber: trailer_number,
    faultReported: fault_reported, actualFault: actual_fault, checks,
    vehicleCondition: vehicle_condition,
    recoveryDestination: recovery_destination, storageName: storage_name,
    storageAddress: storage_address, storageContactNo: storage_contact_no,
    storageEmail: storage_email, propertyRemoved: property_removed,
    vehicleOutcome: vehicle_outcome, serviceAcceptance: service_acceptance,
    name, satisfactionConfirmed: satisfaction_confirmed,
    signatureUrl: signature_url, timeSpottedToOn: time_spotted_to_on,
    timeOnsiteToCleared: time_onsite_to_cleared, schemeId: scheme_id,
    schemeIds: scheme_ids, referenceId: reference_id,
    submittedBy: submitted_by_user_id || submitted_by_name
      ? { userId: submitted_by_user_id, name: submitted_by_name }
      : null,
    status, currentStep: current_step,
    isPureIncident: is_pure_incident, hasVideo: has_video, files,
    createdAt: created_at, updatedAt: updated_at,
    editHistory: edit_history || [],
    lastEditedBy: last_edited_by_user_id || last_edited_by_name
      ? { userId: last_edited_by_user_id, name: last_edited_by_name }
      : null,
  };
};

// Reverse of fromIncidentRow — camelCase form data to a snake_case row patch.
// Only includes fields that are actually present on formData so partial
// updates don't clobber columns the caller didn't touch.
export const toIncidentRow = (formData) => {
  const map = {
    firstName: "first_name", scheme: "scheme", driverName: "driver_name",
    vehicleAllocated: "vehicle_allocated", jobSource: "job_source",
    customerLogNo: "customer_log_no", date: "date", time: "time",
    notes: "notes", driverOnScene: "driver_on_scene",
    policeOnScene: "police_on_scene", nhOnScene: "nh_on_scene",
    ripvOnScene: "ripv_on_scene", timeOfArrival: "time_of_arrival",
    markerPost: "marker_post", vehicleType: "vehicle_type",
    timeCompleted: "time_completed", vehicleRegNo: "vehicle_reg_no",
    vehicleMakeModel: "vehicle_make_model", vehicleColour: "vehicle_colour",
    transmission: "transmission", noOfPassengers: "no_of_passengers",
    speedo: "speedo", hasCaravanTrailer: "has_caravan_trailer",
    trailerNumber: "trailer_number", faultReported: "fault_reported",
    actualFault: "actual_fault", checks: "checks",
    vehicleCondition: "vehicle_condition",
    recoveryDestination: "recovery_destination", storageName: "storage_name",
    storageAddress: "storage_address", storageContactNo: "storage_contact_no",
    storageEmail: "storage_email", propertyRemoved: "property_removed",
    vehicleOutcome: "vehicle_outcome", serviceAcceptance: "service_acceptance",
    name: "name", satisfactionConfirmed: "satisfaction_confirmed",
    signatureUrl: "signature_url", timeSpottedToOn: "time_spotted_to_on",
    timeOnsiteToCleared: "time_onsite_to_cleared", files: "files",
    status: "status", currentStep: "current_step",
  };

  const row = {};
  for (const [camelKey, snakeKey] of Object.entries(map)) {
    if (formData[camelKey] !== undefined) row[snakeKey] = formData[camelKey];
  }
  return row;
};
