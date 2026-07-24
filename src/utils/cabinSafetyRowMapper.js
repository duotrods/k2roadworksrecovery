// Maps between the Postgres cabin_health_safety_checks table (snake_case)
// and the camelCase shape the app already expects from the old Firestore
// documents — mirrors incidentRowMapper.js's pattern.

export const fromCabinSafetyRow = (row) => {
  if (!row) return null;
  const {
    id, cabin_or_plot_no, inspection_completed_by, site_location,
    inspection_date, scheme, checklist, scheme_id, scheme_ids,
    reference_id, submitted_by_user_id, submitted_by_name, status,
    created_at, updated_at, edit_history, last_edited_by_user_id,
    last_edited_by_name,
  } = row;

  return {
    id, cabinOrPlotNo: cabin_or_plot_no,
    inspectionCompletedBy: inspection_completed_by,
    siteLocation: site_location, inspectionDate: inspection_date,
    scheme, checklist, schemeId: scheme_id, schemeIds: scheme_ids,
    referenceId: reference_id,
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

// Reverse of fromCabinSafetyRow — only includes fields present on formData
// so partial updates don't clobber columns the caller didn't touch.
export const toCabinSafetyRow = (formData) => {
  const map = {
    cabinOrPlotNo: "cabin_or_plot_no",
    inspectionCompletedBy: "inspection_completed_by",
    siteLocation: "site_location", inspectionDate: "inspection_date",
    scheme: "scheme", checklist: "checklist",
  };

  const row = {};
  for (const [camelKey, snakeKey] of Object.entries(map)) {
    if (formData[camelKey] !== undefined) row[snakeKey] = formData[camelKey];
  }
  return row;
};
