import { firestoreService } from "./firestoreService";
import { AppError } from "../utils/errorHandling";

class RoleService {
  async completeGoogleSignUpWithRole(user, role, additionalData) {
    // After Google sign-in, create user document with selected role
    if (!["staff", "client"].includes(role)) {
      throw new AppError("Invalid role selection", "role/invalid");
    }

    await firestoreService.createUserDocument(user.uid, {
      displayName: user.displayName,
      role,
      emailVerified: user.emailVerified,
      ...additionalData,
      metadata: {
        signInMethod: "google",
        ipAddress: null,
        userAgent: navigator.userAgent,
      },
    });
  }

  async requestAdminCreation(adminUid, newAdminEmail) {
    // This would create a request for another admin to approve
    // Implementation depends on workflow requirements
    throw new AppError("Not implemented", "role/not-implemented");
  }
}

export const roleService = new RoleService();
