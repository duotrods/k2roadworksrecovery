import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandling';

// Crockford base32 (excludes 0/O, 1/I/L ambiguity) — exactly 32 characters,
// so mapping a random byte via `% 32` has zero modulo bias.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Cryptographically-random code of the given length, drawn via the Web
// Crypto API rather than Math.random() (not a CSPRNG, and — combined with
// these codes' previous short length — made invite/OTP codes practically
// brute-forceable against the anon-callable check_invite_code RPC, which
// has no rate limiting of its own).
const secureRandomCode = (length) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
};

// Maps an invite_codes row (type='client_otp') to the shape OTPManagement.jsx
// already renders.
const mapClientCode = (row) => ({
  id: row.id,
  otpCode: row.code,
  schemeId: row.scheme_id,
  schemeName: row.scheme_name,
  createdByName: row.created_by_name,
  isUsed: row.is_used,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

// Maps an invite_codes row (type='staff_invite'). Staff codes are multi-use,
// so "used" is derived from uses_remaining hitting zero — mirrors how the
// old Firestore staffInviteCodes doc computed isUsed at redemption time.
const mapStaffCode = (row) => ({
  id: row.id,
  inviteCode: row.code,
  createdByName: row.created_by_name,
  expiresAt: row.expires_at,
  usesRemaining: row.uses_remaining,
  maxUses: row.max_uses,
  isUsed: (row.uses_remaining ?? 0) <= 0,
  createdAt: row.created_at,
});

class InviteCodeService {
  generateOTPCode(schemeId) {
    const year = new Date().getFullYear();
    return `${schemeId}-${year}-${secureRandomCode(8)}`;
  }

  generateStaffInviteCode() {
    const year = new Date().getFullYear();
    return `STAFF-${year}-${secureRandomCode(10)}`;
  }

  async createClientCode(schemeId, schemeName, adminUid, adminName, expiresInDays = 30) {
    try {
      const code = this.generateOTPCode(schemeId);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const { error } = await supabase.from('invite_codes').insert({
        type: 'client_otp',
        code,
        scheme_id: schemeId,
        scheme_name: schemeName,
        created_by: adminUid,
        created_by_name: adminName,
        expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;

      return code;
    } catch (error) {
      throw new AppError('Failed to create access code', 'invite/create-error', error);
    }
  }

  async createStaffInviteCode(adminUid, adminName, expiresInDays = 30, maxUses = 1) {
    try {
      const code = this.generateStaffInviteCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const { error } = await supabase.from('invite_codes').insert({
        type: 'staff_invite',
        code,
        uses_remaining: maxUses,
        max_uses: maxUses,
        created_by: adminUid,
        created_by_name: adminName,
        expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;

      return code;
    } catch (error) {
      throw new AppError('Failed to create staff invite code', 'invite/create-error', error);
    }
  }

  // Offset-based pagination — simpler than Firestore's cursor approach and a
  // fine fit here since this is a small, admin-only, low-volume table.
  async getClientCodesPaginated(page = 1, pageSize = 10) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('invite_codes')
        .select('id, code, scheme_id, scheme_name, created_by_name, is_used, created_at, expires_at', { count: 'exact' })
        .eq('type', 'client_otp')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      return {
        otps: (data || []).map(mapClientCode),
        hasMore: from + (data?.length || 0) < (count || 0),
        total: count || 0,
      };
    } catch (error) {
      console.error('Error loading client OTPs:', error);
      return { otps: [], hasMore: false, total: 0 };
    }
  }

  async getStaffCodesPaginated(page = 1, pageSize = 10) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('invite_codes')
        .select('id, code, created_by_name, expires_at, uses_remaining, max_uses, created_at', { count: 'exact' })
        .eq('type', 'staff_invite')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      return {
        codes: (data || []).map(mapStaffCode),
        hasMore: from + (data?.length || 0) < (count || 0),
        total: count || 0,
      };
    } catch (error) {
      console.error('Error loading staff invite codes:', error);
      return { codes: [], hasMore: false, total: 0 };
    }
  }
}

export const inviteCodeService = new InviteCodeService();
