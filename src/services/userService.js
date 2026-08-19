import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandling';

// Maps a public.users row (+ joined user_schemes) to the camelCase shape the
// rest of the app already expects from the old Firestore user documents.
// Keeps `uid` alongside `id` since most of the codebase reads `userProfile.uid`.
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
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    lastLogoutAt: row.last_logout_at,
    isActive: row.is_active,
    canCreateAdmins: row.can_create_admins,
    canSubmitCabinHsChecks: row.can_submit_cabin_hs_checks,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    schemeNames: row.scheme_names,
    schemeIds: (row.user_schemes || []).map((s) => s.scheme_id),
    activeSchemeId: row.active_scheme_id,
    isArchived: row.is_archived,
  };
};

class UserService {
  async getUserDocument(uid) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, user_schemes(scheme_id, scheme_name)')
        .eq('id', uid)
        .maybeSingle();
      if (error) throw error;
      return mapUserRow(data);
    } catch (error) {
      throw new AppError('Failed to fetch user document', 'supabase/read-error', error);
    }
  }

  // Called once per authenticated session. If the profile row already
  // exists, returns it. Otherwise this is the user's first authenticated
  // load after signup (immediately, or after clicking the email-confirmation
  // link) — completes the profile using the signup data stashed in
  // supabase_user.user_metadata at signUp() time.
  async ensureUserProfile(supabaseUser) {
    const existing = await this.getUserDocument(supabaseUser.id);
    if (existing) return existing;

    const meta = supabaseUser.user_metadata || {};
    const { error } = await supabase.rpc('complete_signup', {
      p_role: meta.role || 'client',
      p_display_name: meta.display_name || '',
      p_company: meta.company || null,
      p_phone: meta.phone || null,
      p_invite_type: meta.invite_type || null,
      p_invite_code: meta.invite_code || null,
    });
    if (error) {
      throw new AppError('Failed to complete signup', 'supabase/signup-error', error);
    }
    return this.getUserDocument(supabaseUser.id);
  }

  // Fire-and-forget login audit entry — mirrors the old Firestore version's
  // 15-day expiry (actual cleanup runs server-side via the
  // cleanup_expired_login_logs() cron job, see 0004_rpc_functions.sql).
  async logUserLogin(userId, displayName, email, role) {
    const expireAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const { error } = await supabase.from('login_logs').insert({
      user_id: userId,
      display_name: displayName || 'Unknown',
      email: email || '',
      role: role || 'unknown',
      expire_at: expireAt.toISOString(),
    });
    if (error) console.error('Failed to log user login:', error);
  }

  async updateLastLogin() {
    try {
      const { error } = await supabase.rpc('update_own_profile', {
        p_last_login_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Failed to update last login:', error);
      // Non-critical, don't throw
    }
  }

  async updateLastLogout() {
    try {
      const { error } = await supabase.rpc('update_own_profile', {
        p_last_logout_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Failed to update last logout:', error);
      // Non-critical, don't throw
    }
  }

  // Only covers the fields update_own_profile() exposes (display name,
  // active scheme, last login/logout, email verified) — always applies to
  // the caller's own row. Admin-driven updates to OTHER users' profiles go
  // through userAdminService instead.
  async updateUserProfile(_uid, updates) {
    try {
      const { error } = await supabase.rpc('update_own_profile', {
        p_display_name: updates.displayName ?? null,
        p_active_scheme_id: updates.activeSchemeId ?? null,
        p_last_logout_at: updates.lastLogoutAt ?? null,
        p_last_login_at: updates.lastLoginAt ?? null,
        p_email_verified: updates.emailVerified ?? null,
      });
      if (error) throw error;
    } catch (error) {
      throw new AppError('Failed to update profile', 'supabase/update-error', error);
    }
  }
}

export const userService = new UserService();
