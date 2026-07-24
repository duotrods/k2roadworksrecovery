import { supabase } from "../config/supabase";
import { AppError } from "../utils/errorHandling";

class RoleService {
  // After Google sign-in, complete the profile with the selected role. Not
  // currently wired to any UI (signInWithGoogle has no consumer yet) — kept
  // for parity with the previous Firebase implementation.
  async completeGoogleSignUpWithRole(user, role, additionalData) {
    if (!["staff", "client"].includes(role)) {
      throw new AppError("Invalid role selection", "role/invalid");
    }

    const { error } = await supabase.rpc("complete_signup", {
      p_role: role,
      p_display_name: user.user_metadata?.full_name || user.email,
      p_company: additionalData?.company ?? null,
      p_phone: additionalData?.phone ?? null,
      p_invite_type: null,
      p_invite_code: null,
    });
    if (error) {
      throw new AppError("Failed to complete sign-up", "role/signup-error", error);
    }
  }

  async requestAdminCreation(adminUid, newAdminEmail) {
    // This would create a request for another admin to approve
    // Implementation depends on workflow requirements
    throw new AppError("Not implemented", "role/not-implemented");
  }
}

export const roleService = new RoleService();
