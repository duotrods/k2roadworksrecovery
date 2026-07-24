// Maps between the Postgres daily_allocations table (snake_case) and the
// camelCase shape the app already expects from the old Firestore documents
// — mirrors incidentRowMapper.js's pattern.

export const fromDailyAllocationRow = (row) => {
  if (!row) return null;
  const {
    id, scheme_id, scheme_name, week_ending, rows, scheme_ids,
    reference_id, submitted_by_user_id, submitted_by_name, status,
    created_at, updated_at, edit_history, last_edited_by_user_id,
    last_edited_by_name,
  } = row;

  return {
    id, schemeId: scheme_id, schemeName: scheme_name,
    weekEnding: week_ending, rows, schemeIds: scheme_ids,
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

// Reverse of fromDailyAllocationRow — only includes fields present on
// formData so partial updates don't clobber columns the caller didn't touch.
export const toDailyAllocationRow = (formData) => {
  const map = {
    schemeId: "scheme_id", schemeName: "scheme_name",
    weekEnding: "week_ending", rows: "rows",
  };

  const row = {};
  for (const [camelKey, snakeKey] of Object.entries(map)) {
    if (formData[camelKey] !== undefined) row[snakeKey] = formData[camelKey];
  }
  return row;
};
