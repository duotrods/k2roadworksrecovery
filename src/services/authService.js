import { supabase } from '../config/supabase';
import { userService } from './userService';
import { AppError } from '../utils/errorHandling';
import { USER_ROLES } from '../utils/constants';

// Supabase auth errors carry a plain message, not Firebase-style `auth/xxx`
// codes — this maps the message text onto the existing AUTH_ERRORS lookup
// table (utils/constants.js) so getAuthErrorMessage() keeps working at every
// call site without touching them all individually.
const mapAuthErrorCode = (error) => {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('already registered')) return 'auth/email-already-in-use';
  if (msg.includes('password should be at least') || msg.includes('password is too short')) {
    return 'auth/weak-password';
  }
  if (msg.includes('email not confirmed')) return 'auth/email-not-confirmed';
  if (msg.includes('invalid login credentials')) return 'auth/wrong-password';
  if (msg.includes('unable to validate email') || msg.includes('invalid email')) {
    return 'auth/invalid-email';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'auth/too-many-requests';
  if (msg.includes('network')) return 'auth/network-request-failed';
  return error?.code || 'auth/unknown-error';
};

const toAppError = (error) => new AppError(error.message, mapAuthErrorCode(error), error);

class AuthService {
  async signUpWithEmail(email, password, userData) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: userData.displayName,
            role: userData.role || USER_ROLES.CLIENT,
            company: userData.company,
            phone: userData.phone,
          },
        },
      });
      if (error) throw toAppError(error);

      // A session comes back immediately only if email confirmation is
      // disabled project-wide. Otherwise the profile gets completed on the
      // user's first authenticated load, once they click the confirmation
      // link — see userService.ensureUserProfile / AuthContext.
      if (data.session) {
        await userService.ensureUserProfile(data.user);
      }

      return { uid: data.user.id, ...data.user };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async signInWithEmail(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw toAppError(error);
      userService.updateLastLogin().catch(() => {});
      return { uid: data.user.id, ...data.user };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  // Not currently wired to any sign-in UI (kept for parity with the previous
  // Firebase implementation, which was equally unused). Redirect-based
  // (unlike Firebase's signInWithPopup) — the browser navigates away and
  // back, so there's no "isNewUser" return value here; new-vs-existing is
  // resolved on the next authenticated load via userService.ensureUserProfile.
  async signInWithGoogle() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw toAppError(error);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async signOut() {
    try {
      await userService.updateLastLogout();
      // Clear session storage to reset notice board + security warning for next login
      sessionStorage.removeItem('hasSeenNoticeBoard');
      sessionStorage.removeItem('hasSeenSecurityWarning');
      // Clear redirect to prevent redirecting to role-specific pages on next login
      window.history.replaceState({}, '', '/signin');
      const { error } = await supabase.auth.signOut();
      if (error) throw toAppError(error);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async resetPassword(email) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw toAppError(error);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async resendVerificationEmail() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw toAppError(error);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async signUpClientWithOTP(email, password, userData, otpCode) {
    try {
      const { data: rows, error: checkError } = await supabase.rpc('check_invite_code', {
        p_type: 'client_otp',
        p_code: otpCode,
      });
      if (checkError) {
        throw new AppError('Failed to validate access code', 'auth/invalid-otp', checkError);
      }
      if (!rows?.[0]?.valid) {
        throw new AppError('Invalid or expired access code', 'auth/invalid-otp');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: userData.displayName,
            role: USER_ROLES.CLIENT,
            company: userData.company,
            phone: userData.phone,
            invite_type: 'client_otp',
            invite_code: otpCode,
          },
        },
      });
      if (error) throw toAppError(error);

      if (data.session) {
        await userService.ensureUserProfile(data.user);
      }

      return { uid: data.user.id, ...data.user };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }

  async signUpStaffWithOTP(email, password, userData, otpCode) {
    try {
      const { data: rows, error: checkError } = await supabase.rpc('check_invite_code', {
        p_type: 'staff_invite',
        p_code: otpCode,
      });
      if (checkError) {
        throw new AppError('Failed to validate invite code', 'auth/invalid-staff-code', checkError);
      }
      if (!rows?.[0]?.valid) {
        throw new AppError('Invalid or expired staff invite code', 'auth/invalid-staff-code');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: userData.displayName,
            role: USER_ROLES.STAFF,
            company: userData.company,
            phone: userData.phone,
            invite_type: 'staff_invite',
            invite_code: otpCode,
          },
        },
      });
      if (error) throw toAppError(error);

      if (data.session) {
        await userService.ensureUserProfile(data.user);
      }

      return { uid: data.user.id, ...data.user };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error);
    }
  }
}

export const authService = new AuthService();
