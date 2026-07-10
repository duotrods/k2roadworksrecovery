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
  const CCTVCheckFormPage = lazy(() => import("./pages/staff/CCTVCheckFormPage"));
  const IncidentReportFormPage = lazy(() => import("./pages/staff/IncidentReportFormPage"));
  const StaffReportsListPage = lazy(() => import("./pages/staff/StaffReportsListPage"));
  const DailyOccurrenceFormPage = lazy(() => import("./pages/staff/DailyOccurrenceFormPage"));
  const CCTVFaultsFormPage = lazy(() => import("./pages/staff/CCTVFaultsFormPage"));
  const CCTVFaultsLivePage = lazy(() => import("./pages/staff/CCTVFaultsLivePage"));
  const IncidentReportView = lazy(() => import("./pages/staff/IncidentReportView"));
  const CCTVCheckView = lazy(() => import("./pages/staff/CCTVCheckView"));
  const DailyOccurrenceView = lazy(() => import("./pages/staff/DailyOccurrenceView"));
  const CCTVFaultsView = lazy(() => import("./pages/staff/CCTVFaultsView"));
  const OTPManagementPage = lazy(() => import("./pages/admin/OTPManagementPage"));
  const BackfillVehicleStatsPage = lazy(() => import("./pages/admin/BackfillVehicleStatsPage"));
  const BackfillHasVideoPage = lazy(() => import("./pages/admin/BackfillHasVideoPage"));
  const BackfillCollectionStatsPage = lazy(() => import("./pages/admin/BackfillCollectionStatsPage"));
  const ReferenceIdManagerPage = lazy(() => import("./pages/admin/ReferenceIdManagerPage"));
  const SchemeAssignmentPage = lazy(() => import("./pages/admin/SchemeAssignmentPage"));
  const StaffManagementPage = lazy(() => import("./pages/admin/StaffManagementPage"));
  const StaffReportsPage = lazy(() => import("./pages/admin/StaffReportsPage"));
  const ClientChartsPage = lazy(() => import("./pages/admin/ClientChartsPage"));
  const IncidentReportDetailPage = lazy(() => import("./pages/admin/IncidentReportDetailPage"));
  const CCTVCheckDetailPage = lazy(() => import("./pages/admin/CCTVCheckDetailPage"));
  const DailyLogsDetailPage = lazy(() => import("./pages/admin/DailyLogsDetailPage"));

  // Live Operator pages
  const LiveOperatorIncidentDetailPage = lazy(() => import("./pages/liveoperator/IncidentDetailPage"));

  // Client pages
  const AnalyticsPage = lazy(() => import("./pages/client/AnalyticsPage"));
  const ReportsPage = lazy(() => import("./pages/client/ReportsPage"));
  const CCTVRecordingsPage = lazy(() => import("./pages/client/CCTVRecordingsPage"));
  const ClientIncidentReportView = lazy(() => import("./pages/client/IncidentReportView"));
  const ClientDailyOccurrenceView = lazy(() => import("./pages/client/DailyOccurrenceView"));
  const ClientCCTVCheckView = lazy(() => import("./pages/client/CCTVCheckView"));
  const ClientLiveIncidentsPage = lazy(() => import("./pages/client/LiveIncidentsPage"));
  const ClientLiveCameraFaultsPage = lazy(() => import("./components/dashboard/CCTVFaultOperatorDashboard"));
  const ClientCCTVFaultView = lazy(() => import("./pages/client/CCTVFaultView"));
  const ClientCCTVFaultsPage = lazy(() => import("./pages/client/CCTVFaultsPage"));
  const CCTVUptimePage = lazy(() => import("./pages/client/CCTVUptimePage"));
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
                <Route path="/__/auth/action" element={<AuthActionPage />} />

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
                  path="/dashboard/admin/backfill-collection-stats"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <BackfillCollectionStatsPage />
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
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <StaffManagementPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/staff-reports"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <StaffReportsPage />
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
                  path="/dashboard/admin/staff-reports/cctv/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <CCTVCheckDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/admin/staff-reports/daily/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
                      <DailyLogsDetailPage />
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
                  path="/dashboard/staff/forms/cctv-check"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CCTVCheckFormPage />
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

                <Route
                  path="/dashboard/staff/forms/daily-occurence"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <DailyOccurrenceFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/forms/cctv-faults"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CCTVFaultsFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/cctv-faults"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CCTVFaultsLivePage />
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
                  path="/dashboard/staff/reports/cctv-check/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CCTVCheckView />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/reports/daily-logs/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <DailyOccurrenceView />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/staff/reports/cctv-faults/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.STAFF]}>
                      <CCTVFaultsView />
                    </ProtectedRoute>
                  }
                />

                {/* CCTV Fault Operator Routes */}
                <Route
                  path="/dashboard/cctvoperator"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CCTVOPERATOR]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/cctvoperator/cctv-fault/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CCTVOPERATOR]}>
                      <ClientCCTVFaultView />
                    </ProtectedRoute>
                  }
                />

                {/* Live Operator Routes */}
                <Route
                  path="/dashboard/liveoperator"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.LIVEOPERATOR]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/liveoperator/incident/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.LIVEOPERATOR]}>
                      <LiveOperatorIncidentDetailPage />
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
                  path="/dashboard/client/live-camera-faults"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientLiveCameraFaultsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/cctv-faults"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientCCTVFaultsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/client/cctv-fault/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientCCTVFaultView />
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
                  path="/dashboard/client/reports/daily-occurrence/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientDailyOccurrenceView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/client/reports/cctv-check/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientCCTVCheckView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/client/reports/cctv-faults/:id"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <ClientCCTVFaultView />
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

                {/* Client routes */}
                <Route
                  path="/dashboard/client/cctv-uptime"
                  element={
                    <ProtectedRoute allowedRoles={[USER_ROLES.CLIENT]}>
                      <CCTVUptimePage />
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
