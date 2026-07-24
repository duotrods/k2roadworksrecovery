// Maps between the Postgres vehicle_daily_checks table (snake_case) and
// the camelCase shape the app already expects from the old Firestore
// documents — mirrors incidentRowMapper.js's pattern.

export const fromVehicleCheckRow = (row) => {
  if (!row) return null;
  const {
    id, week_commencing, drivers_name, vehicle_type_reg, mileage, scheme,
    checks, drivers_report, action_taken, supervisor_signature, date,
    scheme_id, scheme_ids, reference_id, submitted_by_user_id,
    submitted_by_name, status, created_at, updated_at, edit_history,
    last_edited_by_user_id, last_edited_by_name,
  } = row;

  return {
    id, weekCommencing: week_commencing, driversName: drivers_name,
    vehicleTypeReg: vehicle_type_reg, mileage, scheme, checks,
    driversReport: drivers_report, actionTaken: action_taken,
    supervisorSignature: supervisor_signature, date,
    schemeId: scheme_id, schemeIds: scheme_ids, referenceId: reference_id,
    submittedBy: submitted_by_user_id || submitted_by_name
      ? { userId: submitted_by_user_id, name: submitted_by_name }
      : null,
    status, createdAt: created_at, updatedAt: updated_at,
    editHistory: edit_history || [],
    lastEditedBy: last_edited_by_user_id || last_edited_by_name
      ? { userId: last_edited_by_user_id, name: last_edited_by_name }
      : null,
  };
};

// Reverse of fromVehicleCheckRow — only includes fields present on formData
// so partial updates don't clobber columns the caller didn't touch.
export const toVehicleCheckRow = (formData) => {
  const map = {
    weekCommencing: "week_commencing", driversName: "drivers_name",
    vehicleTypeReg: "vehicle_type_reg", mileage: "mileage",
    scheme: "scheme", checks: "checks", driversReport: "drivers_report",
    actionTaken: "action_taken",
    supervisorSignature: "supervisor_signature", date: "date",
  };

  const row = {};
  for (const [camelKey, snakeKey] of Object.entries(map)) {
    if (formData[camelKey] !== undefined) row[snakeKey] = formData[camelKey];
  }
  return row;
};
