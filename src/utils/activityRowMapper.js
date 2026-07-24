// Maps between the Postgres activities table (snake_case) and the
// camelCase shape the app already expects from the old Firestore documents.
// Only covers the "staff" actor_type shape (type/staffId/staffName/
// description/relatedFormId/staffGroup) — the admin variant
// (userId/action/details/targetUserId) was never ported, since that
// table's INSERT policy is staff-only (see 0003_rls_policies.sql) and an
// admin-driven write would just be rejected; admin actions log to
// audit_logs instead (see userAdminService.js).

export const fromActivityRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    staffId: row.staff_id,
    staffName: row.staff_name,
    description: row.description,
    relatedFormId: row.related_form_id,
    staffGroup: row.staff_group,
    createdAt: row.created_at,
  };
};

export const toActivityRow = (activityData) => ({
  actor_type: "staff",
  type: activityData.type,
  staff_id: activityData.staffId,
  staff_name: activityData.staffName,
  description: activityData.description,
  related_form_id: activityData.relatedFormId,
  staff_group: activityData.staffGroup,
});
