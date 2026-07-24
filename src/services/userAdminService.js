import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandling';
import { USER_ROLES } from '../utils/constants';

// Same row->camelCase shape as userService.getUserDocument, so
// SchemeAssignment.jsx/StaffManagement.jsx need no changes beyond swapping
// which service they call.
const mapUserRow = (row) => {
  if (!row) return null;
  return {
    uid: row.id,
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    emailVerified: row.email_verified,
    company: row.company,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    schemeNames: row.scheme_names,
    schemeIds: (row.user_schemes || []).map((s) => s.scheme_id),
    activeSchemeId: row.active_scheme_id,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
  };
};

// Best-effort admin audit-log write — never blocks the caller if it fails.
const logAudit = (action, performedBy, targetUser, details) => {
  supabase
    .from('audit_logs')
    .insert({ action, performed_by: performedBy, target_user: targetUser, details })
    .then(({ error }) => {
      if (error) console.warn('Audit log failed:', error);
    });
};

class UserAdminService {
  // All users (no role filter), offset-paginated — backs the admin
  // "User Management" dashboard.
  async getUsersPaginated(page = 1, pageSize = 10) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('users')
        .select('*, user_schemes(scheme_id, scheme_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      return {
        users: (data || []).map(mapUserRow),
        total: count || 0,
        hasMore: from + (data?.length || 0) < (count || 0),
      };
    } catch (error) {
      throw new AppError('Failed to fetch users', 'supabase/read-error', error);
    }
  }

  async promoteToAdmin(targetUid, adminUid) {
    try {
      const { data: targetRow, error: fetchError } = await supabase
        .from('users')
        .select('role, email, display_name')
        .eq('id', targetUid)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!targetRow) throw new AppError('User not found', 'supabase/not-found');
      if (targetRow.role !== USER_ROLES.STAFF) {
        throw new AppError('Can only promote staff users to admin', 'supabase/permission-denied');
      }
      if (targetUid === adminUid) {
        throw new AppError('Cannot promote yourself', 'supabase/invalid-operation');
      }

      const { error } = await supabase
        .from('users')
        .update({ role: USER_ROLES.ADMIN })
        .eq('id', targetUid);
      if (error) throw error;

      logAudit('promote_to_admin', adminUid, targetUid, {
        oldValue: USER_ROLES.STAFF,
        newValue: USER_ROLES.ADMIN,
        targetUserEmail: targetRow.email,
        targetUserName: targetRow.display_name,
      });

      return { success: true, message: 'User promoted to admin successfully' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to promote user', 'supabase/update-error', error);
    }
  }

  // Calls the server-side delete-user-account proxy (api/delete-user-account.js,
  // a Vercel function holding the service-role key — same pattern as the R2
  // upload proxy in api/upload.js). Deletes the auth.users row; public.users
  // cascades automatically.
  async deleteUserAccount(targetUid) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/delete-user-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ targetUid }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AppError(data?.error || 'Failed to delete user', 'supabase/function-error');
      }
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to delete user', 'supabase/function-error', error);
    }
  }

  // Admin-only login audit log (login_logs_select RLS restricts SELECT to
  // admins). Offset-paginated.
  async getLoginLogsPaginated(page = 1, pageSize = 10) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('login_logs')
        .select('*', { count: 'exact' })
        .order('login_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      return {
        logs: (data || []).map((row) => ({
          id: row.id,
          displayName: row.display_name,
          email: row.email,
          role: row.role,
          loginAt: row.login_at,
          expireAt: row.expire_at,
        })),
        total: count || 0,
        hasMore: from + (data?.length || 0) < (count || 0),
      };
    } catch (error) {
      throw new AppError('Failed to fetch login logs', 'supabase/read-error', error);
    }
  }

  async getLoginLogsCount() {
    try {
      const { count, error } = await supabase
        .from('login_logs')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    } catch (error) {
      throw new AppError('Failed to count login logs', 'supabase/read-error', error);
    }
  }

  async getUsersByRolePaginated(role, page = 1, pageSize = 10) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('users')
        .select('*, user_schemes(scheme_id, scheme_name)', { count: 'exact' })
        .eq('role', role)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      return {
        users: (data || []).map(mapUserRow),
        hasMore: from + (data?.length || 0) < (count || 0),
        total: count || 0,
      };
    } catch (error) {
      throw new AppError('Failed to fetch users', 'supabase/read-error', error);
    }
  }

  async getUsersCountByRole() {
    try {
      const [totalRes, staffRes, clientRes] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'staff'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'client'),
      ]);
      if (totalRes.error) throw totalRes.error;
      if (staffRes.error) throw staffRes.error;
      if (clientRes.error) throw clientRes.error;

      return {
        total: totalRes.count || 0,
        staff: staffRes.count || 0,
        client: clientRes.count || 0,
      };
    } catch (error) {
      throw new AppError('Failed to count users by role', 'supabase/read-error', error);
    }
  }

  async assignSchemeToUser(userId, schemeId, schemeName, adminUid) {
    try {
      const { data: targetRow, error: fetchError } = await supabase
        .from('users')
        .select('*, user_schemes(scheme_id, scheme_name)')
        .eq('id', userId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!targetRow) throw new AppError('User not found', 'supabase/not-found');

      const target = mapUserRow(targetRow);
      if (target.role !== USER_ROLES.CLIENT) {
        throw new AppError('Cannot assign schemes to this role', 'supabase/permission-denied');
      }

      // user_schemes' composite (user_id, scheme_id) primary key does the
      // "already assigned" duplicate check for us — no separate read needed.
      const { error: insertError } = await supabase
        .from('user_schemes')
        .insert({ user_id: userId, scheme_id: schemeId, scheme_name: schemeName });
      if (insertError) {
        if (insertError.code === '23505') {
          throw new AppError('Scheme already assigned to this user', 'firestore/already-exists');
        }
        throw insertError;
      }

      const isFirstScheme = target.schemeIds.length === 0;
      const { error: updateError } = await supabase
        .from('users')
        .update({
          scheme_names: { ...(target.schemeNames || {}), [schemeId]: schemeName },
          ...(isFirstScheme && { active_scheme_id: schemeId }),
        })
        .eq('id', userId);
      if (updateError) throw updateError;

      logAudit('scheme_assigned', adminUid, userId, { schemeId, schemeName });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error.message || 'Failed to assign scheme', 'supabase/update-error', error);
    }
  }

  async removeSchemeFromUser(userId, schemeId, adminUid) {
    try {
      const { data: targetRow, error: fetchError } = await supabase
        .from('users')
        .select('*, user_schemes(scheme_id, scheme_name)')
        .eq('id', userId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!targetRow) throw new AppError('User not found', 'supabase/not-found');

      const target = mapUserRow(targetRow);
      if (target.schemeIds.length <= 1) {
        throw new AppError('Cannot remove the only scheme from a user', 'firestore/invalid-operation');
      }

      const { error: deleteError } = await supabase
        .from('user_schemes')
        .delete()
        .eq('user_id', userId)
        .eq('scheme_id', schemeId);
      if (deleteError) throw deleteError;

      const updatedSchemeNames = { ...(target.schemeNames || {}) };
      delete updatedSchemeNames[schemeId];
      const patch = { scheme_names: updatedSchemeNames };
      if (target.activeSchemeId === schemeId) {
        patch.active_scheme_id = target.schemeIds.filter((id) => id !== schemeId)[0] ?? null;
      }

      const { error: updateError } = await supabase.from('users').update(patch).eq('id', userId);
      if (updateError) throw updateError;

      logAudit('scheme_removed', adminUid, userId, { schemeId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error.message || 'Failed to remove scheme', 'supabase/update-error', error);
    }
  }

  async archiveUser(targetUid, adminUid) {
    try {
      if (targetUid === adminUid) {
        throw new AppError('Cannot archive yourself', 'firestore/invalid-operation');
      }

      const { data: targetRow, error: fetchError } = await supabase
        .from('users')
        .select('role')
        .eq('id', targetUid)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!targetRow) throw new AppError('User not found', 'supabase/not-found');
      if (targetRow.role === USER_ROLES.ADMIN) {
        throw new AppError('Cannot archive admin users', 'supabase/permission-denied');
      }

      const { error } = await supabase
        .from('users')
        .update({ is_archived: true, archived_at: new Date().toISOString(), archived_by: adminUid })
        .eq('id', targetUid);
      if (error) throw error;

      // NOTE: the old Firestore version also wrote an activity-feed entry
      // here, but `activities` INSERT is staff-only under RLS (a preserved
      // quirk from the original rules — see 0003_rls_policies.sql), so an
      // admin-driven write would be rejected. Skipped for now, consistent
      // with how other non-critical activity-log writes are deferred
      // throughout this migration.
      return { success: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to archive user', 'supabase/update-error', error);
    }
  }

  async unarchiveUser(targetUid, adminUid) {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
          unarchived_at: new Date().toISOString(),
          unarchived_by: adminUid,
        })
        .eq('id', targetUid);
      if (error) throw error;

      return { success: true };
    } catch (error) {
      throw new AppError('Failed to unarchive user', 'supabase/update-error', error);
    }
  }
}

export const userAdminService = new UserAdminService();
