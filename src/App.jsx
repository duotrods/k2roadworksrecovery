  import { lazy, Suspense } from "react";
  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  import { Toaster } from "react-hot-toast";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { AuthProvider } from "./context/AuthContext";
  import ErrorBoundary from "./components/common/ErrorBoundary";
  import ProtectedRoute from "./components/auth/ProtectedRoute";
  import { Analytics } from "@vercel/analytics/react";
  import { SpeedInsights } from "@vercel/speed-insights/react";

  // Create a client
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
        gcTime: 10 * 60 * 1000, // Cache retained for 10 minutes (v5: renamed from cacheTime)
        refetchOnWindowFocus: false, // Don't refetch when user returns to tab
        retry: 1, // Retry failed requests once
      },
    },
  });

  // Existing components

  // New pages
  import SignInPage from "./pages/auth/SignInPage";
  import SignUpPage from "./pages/auth/SignUpPage";
  import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
  import AuthActionPage from "./pages/auth/AuthActionPage";
  // Heavy/authenticated routes are lazy-loaded so they ship as separate chunks
  // instead of bloating the initial bundle. Auth entry pages (above) stay eager
  // so the sign-in path has no loading flash.
  const Dashboard = lazy(() => import("./pages/shared/Dashboard"));
  const FormsSelectionPage = lazy(() => import("./pages/staff/FormsSelectionPage"));
  const IncidentReportFormPage = lazy(() => import("./pages/staff/IncidentReportFormPage"));
  const StaffReportsListPage = lazy(() => import("./pages/staff/StaffReportsListPage"));
  const CabinSafetyCheckFormPage = lazy(() => import("./pages/staff/CabinSafetyCheckFormPage"));
  const VehicleDailyCheckFormPage = lazy(() => import("./pages/staff/VehicleDailyCheckFormPage"));
  const IncidentReportView = lazy(() => import("./pages/staff/IncidentReportView"));
  const CabinSafetyCheckView = lazy(() => import("./pages/staff/CabinSafetyCheckView"));
  const VehicleDailyCheckView = lazy(() => import("./pages/staff/VehicleDailyCheckView"));
  const OTPManagementPage = lazy(() => import("./pages/admin/OTPManagementPage"));
  const BackfillVehicleStatsPage = lazy(() => import("./pages/admin/BackfillVehicleStatsPage"));
  const BackfillHasVideoPage = lazy(() => import("./pages/admin/BackfillHasVideoPage"));
  const ReferenceIdManagerPage = lazy(() => import("./pages/admin/ReferenceIdManagerPage"));
  const SchemeAssignmentPage = lazy(() => import("./pages/admin/SchemeAssignmentPage"));
  const StaffReportsPage = lazy(() => import("./pages/admin/StaffReportsPage"));
  const DailyAllocationsListPage = lazy(() => import("./pages/admin/DailyAllocationsListPage"));
  const DailyAllocationsFormPage = lazy(() => import("./pages/admin/DailyAllocationsFormPage"));
  const ClientChartsPage = lazy(() => import("./pages/admin/ClientChartsPage"));
  const IncidentReportDetailPage = lazy(() => import("./pages/admin/IncidentReportDetailPage"));
  const CabinSafetyCheckDetailPage = lazy(() => import("./pages/admin/CabinSafetyCheckDetailPage"));
  const VehicleDailyCheckDetailPage = lazy(() => import("./pages/admin/VehicleDailyCheckDetailPage"));
  const AdminLiveIncidentsPage = lazy(() => import("./pages/admin/LiveIncidentsPage"));

  // Live Incidents board (relocated under staff after role consolidation)
  const StaffSidebarLayout = lazy(() => import("./components/layout/StaffSidebarLayout"));
  const LiveOperatorDashboard = lazy(() => import("./components/dashboard/LiveOperatorDashboard"));
  const LiveIncidentDetailPage = lazy(() => import("./pages/staff/LiveIncidentDetailPage"));

  // Client pages
  const AnalyticsPage = lazy(() => import("./pages/client/AnalyticsPage"));
  const ReportsPage = lazy(() => import("./pages/client/ReportsPage"));
  const CCTVRecordingsPage = lazy(() => import("./pages/client/CCTVRecordingsPage"));
  const ClientIncidentReportView = lazy(() => import("./pages/client/IncidentReportView"));
  const ClientLiveIncidentsPage = lazy(() => import("./pages/client/LiveIncidentsPage"));
  const DocumentsPage = lazy(() => import("./pages/client/DocumentsPage"));
  const StaffDocumentsPage = lazy(() => import("./pages/staff/StaffDocumentsPage"));
  const HelpPage = lazy(() => import("./pages/HelpPage"));
  const UnauthorizedPage = lazy(() => import("./pages/UnauthorizedPage"));

  import { USER_ROLES } from "./utils/constants";
  import "./index.css";

  // Fallback shown while a lazy route chunk loads.
  const PageLoader = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <span className="loading loading-spinner loading-lg text-brand-500"></span>
    </div>
  );

  const App = () => {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <Toaster position="top-right" />
              <Analytics />
              <SpeedInsights />

              <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Navigate to="/signin" replace />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset-password" element={<AuthActionPage />} />

                {/* Protected dashboard routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/live-incidents"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <AdminLiveIncidentsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/otp-management"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <OTPManagementPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/backfill-vehicle-stats"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <BackfillVehicleStatsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/backfill-has-video"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <BackfillHasVideoPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/reference-id-manager"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <ReferenceIdManagerPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/scheme-assignment"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <SchemeAssignmentPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/staff-management"
                  element={<Navigate to="/dashboard/admin" replace />}
                />

                <Route
                  path="/dashboard/admin/staff-reports"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <StaffReportsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Daily Allocations (admin-only weekly roster) */}
                <Route
                  path="/dashboard/admin/daily-allocations"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <DailyAllocationsListPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/daily-allocations/new"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <DailyAllocationsFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/daily-allocations/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <DailyAllocationsFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/client-charts"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <ClientChartsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Admin Staff Report Detail Pages */}
                <Route
                  path="/dashboard/admin/staff-reports/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <IncidentReportDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/staff-reports/cabin-safety/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <CabinSafetyCheckDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/staff-reports/vehicle-check/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <VehicleDailyCheckDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Staff Forms Routes */}
                <Route
                  path="/dashboard/staff/forms"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <FormsSelectionPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/forms/cabin-safety-check"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CabinSafetyCheckFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/forms/vehicle-daily-check"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <VehicleDailyCheckFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/forms/incident-report"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <IncidentReportFormPage />
                    </ProtectedRoute>
                  }
                />

                {/* Staff Reports and Uploads Routes */}
                <Route
                  path="/dashboard/staff/reports"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <StaffReportsListPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/reports/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <IncidentReportView />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/documents"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <StaffDocumentsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/reports/cabin-safety-check/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CabinSafetyCheckView />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/reports/vehicle-daily-check/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <VehicleDailyCheckView />
                    </ProtectedRoute>
                  }
                />

                {/* Staff Live Incidents Board (formerly the standalone Live Operator role) */}
                <Route
                  path="/dashboard/staff/live-incidents"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <StaffSidebarLayout>
                        <LiveOperatorDashboard />
                      </StaffSidebarLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/live-incidents/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <LiveIncidentDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/live-incidents"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientLiveIncidentsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientIncidentReportView />
                    </ProtectedRoute>
                  }
                />

                {/* Client Pages Routes */}
                <Route
                  path="/dashboard/client/analytics"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <AnalyticsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/reports"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Client Report View Routes */}
                <Route
                  path="/dashboard/client/reports/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientIncidentReportView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/client/cctv-recordings"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <CCTVRecordingsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/documents"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <DocumentsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Help */}
                <Route
                  path="/help"
                  element={
                    <ProtectedRoute>
                      <HelpPage />
                    </ProtectedRoute>
                  }
                />

                {/* Unauthorized — ProtectedRoute redirects here on a role mismatch */}
                <Route
                  path="/unauthorized"
                  element={
                    <ProtectedRoute>
                      <UnauthorizedPage />
                    </ProtectedRoute>
                  }
                />

                {/* Catch all */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  };

  export default App;
