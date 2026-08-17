// Demo scheme ID constant
export const DEMO_SCHEME_ID = "DMO1";

// List of all schemes/clients in the system
export const SCHEMES = [
  {
    id: "M3",
    fullName: "M3 Jct 9 - Balfour Beatty",
    shortName: "M3 Jct 9",
    contractor: "Balfour Beatty",
  },
  {
    id: "A428",
    fullName: "A428 Black Cat - Skanska",
    shortName: "A428 Black Cat",
    contractor: "Skanska",
  },
  {
    id: "DMO1",
    fullName: "DMO1 Demo Scheme - Demo",
    shortName: "Demo Scheme",
    contractor: "Demo",
    isDemo: true,
  },
];

// All internal (non-demo) scheme IDs. Used to scope counts/feeds to real
// schemes and exclude the demo scheme.
export const getInternalSchemeIds = () =>
  SCHEMES.filter((s) => !s.isDemo).map((s) => s.id);

// Returns the scheme-ID array a *staff-side* viewer is scoped to for forms,
// counts, search, and live feeds. (Admin views are intentionally unscoped and
// do not call this.)
// - Demo users: only the demo scheme
// - Real staff: all internal (non-demo) schemes
export const getViewerSchemeScope = (userProfile) => {
  if (!userProfile) return getInternalSchemeIds();
  if (isDemoUser(userProfile)) return [DEMO_SCHEME_ID];
  return getInternalSchemeIds();
};

// Returns the filtered list of SCHEMES a user should see in form dropdowns.
// - Demo users: only the demo scheme
// - Everyone else: all non-demo schemes
export const getSchemesForUser = (userProfile) => {
  if (!userProfile) return [];
  if (isDemoUser(userProfile)) {
    return SCHEMES.filter((s) => s.isDemo);
  }
  return SCHEMES.filter((s) => !s.isDemo);
};

// Helper function to get scheme by ID
export const getSchemeById = (id) => {
  return SCHEMES.find((scheme) => scheme.id === id);
};

// Helper function to get scheme by full name
export const getSchemeByFullName = (fullName) => {
  return SCHEMES.find((scheme) => scheme.fullName === fullName) || null;
};

// Helper function to extract scheme ID from full name
export const extractSchemeId = (fullName) => {
  if (!fullName) {
    console.error("extractSchemeId called with undefined or null fullName");
    return null;
  }
  const scheme = getSchemeByFullName(fullName);
  return scheme ? scheme.id : fullName.split(" ")[0]; // Fallback to first word
};

// Helper function to check if a user is a demo account
export const isDemoUser = (userProfile) => {
  if (!userProfile) return false;

  // Check if user has demo scheme assigned
  if (userProfile.schemeIds && userProfile.schemeIds.includes(DEMO_SCHEME_ID)) {
    return true;
  }

  // Backward compatibility: check single schemeId
  if (userProfile.schemeId === DEMO_SCHEME_ID) {
    return true;
  }

  return false;
};

// Helper function to check if a scheme ID is the demo scheme
export const isDemoScheme = (schemeId) => {
  return schemeId === DEMO_SCHEME_ID;
};

// Full camera list per scheme — single source of truth used by fault form and uptime page
export const CAMERA_OPTIONS_BY_SCHEME = {
  "A66-WJ": [
    "CAM 1","CAM 2","CAM 3","CAM 4","CAM 5","CAM 6","CAM 7","CAM 8","CAM 9","CAM 10",
    "CAM 11","CAM 12","CAM 13","CAM 14","CAM 15","CAM 16","CAM 17","CAM 18","CAM 19","CAM 20",
  ],
  DMO1: [
    "DEMO-CAM-1","DEMO-CAM-2","DEMO-CAM-3","DEMO-CAM-4",
    "DEMO-CAM-5","DEMO-CAM-6","DEMO-CAM-7","DEMO-CAM-8",
  ],
};
