export const USER_ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  CLIENT: "client",
};

export const ROLE_LABELS = {
  admin: "Administrator",
  staff: "Staff Member",
  client: "Client",
};

export const DASHBOARD_ROUTES = {
  admin: "/dashboard/admin",
  staff: "/dashboard/staff",
  client: "/dashboard/client",
};

// Returns the base path for staff-dashboard-equivalent roles.
// Kept as a helper so callers don't hardcode '/dashboard/staff'.
export const getStaffBasePath = () => "/dashboard/staff";


export const AUTH_ERRORS = {
  "auth/email-already-in-use": "This email is already registered",
  "auth/weak-password": "Password should be at least 6 characters",
  "auth/invalid-email": "Invalid email address",
  "auth/user-not-found": "No account found with this email",
  "auth/wrong-password": "Incorrect password",
  "auth/too-many-requests": "Too many attempts. Please try again later",
  "auth/network-request-failed": "Network error. Check your connection",
  "auth/invalid-otp":
    "Invalid or expired access code. Please check with your administrator.",
  "auth/operation-not-allowed":
    "Email/password sign-in is not enabled. Please contact support.",
};
