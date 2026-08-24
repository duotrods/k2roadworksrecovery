import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { clientDataService } from "../../services/clientDataService";
import ClientSidebarLayout from "../../components/layout/ClientSidebarLayout";
import {
  FileText,
  Calendar,
  Search,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import toast from "react-hot-toast";
import { generateReportPDF } from "../../utils/pdfGenerator";
import { SCHEMES } from "../../utils/schemes";
import ReportDetailModal from "../../components/client/reports/ReportDetailModal";
import {
  getReportTypeIcon,
  getReportTypeBadge,
  getReportTypeLabel,
  getReportDisplayDate,
  getReportDisplayTime,
} from "../../utils/reportDisplay";

// Module-level variable — survives component unmount/remount, no serialization needed
let _reportsRestore = null;

const ReportsPage = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const basePath = "/dashboard/client";
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState(null);
  const [cursors, setCursors] = useState({});
  const [typeCursor, setTypeCursor] = useState(null);
  const pageCacheRef = useRef({});
  const wasRestoredRef = useRef(false);
  const searchDebounceRef = useRef(null);
  const searchCounterRef = useRef(0);
  const searchRateLimitRef = useRef([]);
  const countCacheRef = useRef({}); // { cacheKey: { counts, fetchedAt } }
  const allViewCacheRef = useRef({}); // { pageNum: { data, cursors, hasMore, cachedAt } }
  const [hasMore, setHasMore] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLastDocs, setSearchLastDocs] = useState({});
  const searchPageCacheRef = useRef({});
  const [subFilter, setSubFilter] = useState(null); // 'free-recovery' | 'incursion' | null
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [appliedDateFilter, setAppliedDateFilter] = useState(null); // null = no filter

  const isSearchMode = searchTerm.trim() !== "";

  const runSearch = async (term, page = 1, lastDocs = {}, overrideFilterType = null) => {
    if (!term.trim()) {
      setSearchResults([]);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearchLastDocs({});
      searchPageCacheRef.current = {};
      return;
    }
    const now = Date.now();
    searchRateLimitRef.current = searchRateLimitRef.current.filter(
      (t) => now - t < 30000,
    );
    if (searchRateLimitRef.current.length >= 10) {
      toast.error("Too many searches. Please wait a moment.");
      return;
    }
    searchRateLimitRef.current.push(now);
    const myCount = ++searchCounterRef.current;
    setSearchLoading(true);
    try {
      const activeScheme = userProfile.activeSchemeId || userProfile.schemeId;
      const activeFilter = overrideFilterType !== null ? overrideFilterType : filterType;
      const { results, lastDocs: newLastDocs, hasMore } =
        await clientDataService.searchReportsPaginated(
          activeScheme,
          term.trim(),
          10,
          lastDocs,
          activeFilter === "all" ? null : activeFilter,
        );
      if (myCount !== searchCounterRef.current) return; // stale
      searchPageCacheRef.current[page] = { results, lastDocs: newLastDocs, hasMore };
      setSearchResults(results);
      setSearchPage(page);
      setSearchHasMore(hasMore);
      setSearchLastDocs(newLastDocs);
    } catch (err) {
      console.error("Search failed:", err);
      toast.error("Search failed. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchNextPage = () => {
    if (!searchHasMore) return;
    runSearch(searchTerm, searchPage + 1, searchLastDocs);
  };

  const handleSearchPrevPage = () => {
    if (searchPage <= 1) return;
    const cached = searchPageCacheRef.current[searchPage - 1];
    if (cached) {
      setSearchResults(cached.results);
      setSearchPage(searchPage - 1);
      setSearchHasMore(cached.hasMore);
      setSearchLastDocs(cached.lastDocs);
    }
  };
  const [reportTypeCounts, setReportTypeCounts] = useState({
    incident: 0,
    pureIncident: 0,
    freeRecovery: 0,
    driveOff: 0,
    incursions: 0,
    vehiclesDispatched: 0,
    incidentAssetDamage: 0,
    total: 0,
  });
  const reportsPerPage = 10;

  useEffect(() => {
    const activeScheme = userProfile?.activeSchemeId || userProfile?.schemeId;
    if (activeScheme) {
      if (_reportsRestore) {
        setCurrentPage(_reportsRestore.page);
        setFilterType(_reportsRestore.filter);
        setReports(_reportsRestore.reports);
        setHasMore(_reportsRestore.hasMore);
        setCursors(_reportsRestore.cursors || {});
        setTypeCursor(_reportsRestore.typeCursor || null);
        if (_reportsRestore.reportTypeCounts)
          setReportTypeCounts(_reportsRestore.reportTypeCounts);
        if (_reportsRestore.appliedDateFilter) {
          setAppliedDateFilter(_reportsRestore.appliedDateFilter);
          setDateFilter({
            startDate: _reportsRestore.appliedDateFilter.startDate
              .toISOString()
              .split("T")[0],
            endDate: _reportsRestore.appliedDateFilter.endDate
              .toISOString()
              .split("T")[0],
          });
        }
        // Restore the full page cache so Prev/Next navigation works on all cached pages
        pageCacheRef.current = _reportsRestore.pageCache
          ? { ..._reportsRestore.pageCache }
          : {
              [_reportsRestore.page]: {
                data: _reportsRestore.reports,
                cursors: _reportsRestore.cursors || {},
                typeCursor: _reportsRestore.typeCursor || null,
                hasMore: _reportsRestore.hasMore,
              },
            };
        setLoading(false);
        wasRestoredRef.current = true;
        // counts already restored from _reportsRestore — skip the 10 extra queries
      } else {
        loadReports(true);
        loadTotalCount();
      }
    }
  }, [
    userProfile?.activeSchemeId,
    userProfile?.schemeId,
    userProfile?.schemeName,
  ]);

  const clearRestoreState = () => {
    _reportsRestore = null;
  };

  const loadReports = async (
    resetPage = false,
    overrideFilterType = null,
    cursorOverride = null,
    targetPage = null,
    silent = false,
    subFilterOverride = undefined,
    dateRange = null,
  ) => {
    // Check page cache first
    if (targetPage && pageCacheRef.current[targetPage]) {
      const cached = pageCacheRef.current[targetPage];
      setReports(cached.data);
      setCursors(cached.cursors);
      setTypeCursor(cached.typeCursor);
      setHasMore(cached.hasMore);
      setCurrentPage(targetPage);
      return;
    }

    try {
      if (!silent) setLoading(true);
      const activeScheme = userProfile.activeSchemeId || userProfile.schemeId;
      const activeFilter =
        overrideFilterType !== null ? overrideFilterType : filterType;

      let newCursors = {};
      let newTypeCursor = null;
      let newHasMore = true;
      let newReports;

      if (activeFilter === "all") {
        const effectiveCursors = cursorOverride
          ? cursorOverride.cursors
          : resetPage
            ? {}
            : cursors;
        const pageNum = targetPage || (resetPage ? 1 : currentPage);
        const allCacheKey = `${activeScheme}|${dateRange?.startDate?.getTime() ?? ""}|${pageNum}`;
        const allCached = allViewCacheRef.current[allCacheKey];
        const ALL_TTL = 2 * 60 * 1000; // 2 minutes
        if (allCached && Date.now() - allCached.cachedAt < ALL_TTL && !resetPage) {
          setReports(allCached.data);
          setCursors(allCached.cursors);
          setHasMore(allCached.hasMore);
          setCurrentPage(pageNum);
          setLoading(false);
          return;
        }
        const result = await clientDataService.getAllReportsPaginated(
          activeScheme,
          reportsPerPage,
          effectiveCursors,
          dateRange,
        );
        newReports = result.reports;
        newCursors = result.cursors;
        newHasMore = result.hasMore;
        setCursors(newCursors);
        setHasMore(newHasMore);
        allViewCacheRef.current[allCacheKey] = {
          data: newReports,
          cursors: newCursors,
          hasMore: newHasMore,
          cachedAt: Date.now(),
        };
      } else {
        const effectiveTypeCursor = cursorOverride
          ? cursorOverride.typeCursor
          : resetPage
            ? null
            : typeCursor;
        const activeSub =
          subFilterOverride !== undefined ? subFilterOverride : subFilter;
        const extraWhere =
          activeSub === "incursion"
            ? { field: "incursion", op: "==", value: "YES" }
            : activeSub === "free-recovery"
              ? {
                  field: "incidentType",
                  op: "in",
                  value: ["Free Recovery", "Drive Off"],
                }
              : activeSub === "asset-damage"
                ? { field: "propertyDamage", op: "==", value: true }
                : activeSub === "pure"
                  ? { field: "isPureIncident", op: "==", value: true }
                  : null;
        const result = await clientDataService.getReportsByTypePaginated(
          activeScheme,
          activeFilter,
          reportsPerPage,
          effectiveTypeCursor,
          extraWhere,
          dateRange,
        );
        newReports = result.reports;
        newTypeCursor = result.lastDoc;
        newHasMore = result.hasMore;
        setTypeCursor(newTypeCursor);
        setHasMore(newHasMore);
      }

      setReports(newReports);

      // Cache this page's data
      const pageNum = targetPage || (resetPage ? 1 : currentPage);
      pageCacheRef.current[pageNum] = {
        data: newReports,
        cursors: newCursors,
        typeCursor: newTypeCursor,
        hasMore: newHasMore,
      };

      if (resetPage) {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error("Failed to load reports:", error);
      if (
        error.message?.includes("index") ||
        error.cause?.message?.includes("index")
      ) {
        toast.error(
          "Firebase indexes are still building. Please wait 5-10 minutes and refresh.",
        );
      } else {
        toast.error("Failed to load reports. Check console for details.");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTotalCount = async (dateRange = null) => {
    try {
      const activeScheme = userProfile.activeSchemeId || userProfile.schemeId;
      const cacheKey = `${activeScheme}|${dateRange?.startDate?.getTime() ?? ""}|${dateRange?.endDate?.getTime() ?? ""}`;
      const cached = countCacheRef.current[cacheKey];
      const TTL = 5 * 60 * 1000; // 5 minutes
      if (cached && Date.now() - cached.fetchedAt < TTL) {
        setReportTypeCounts(cached.counts);
        return;
      }
      const counts = await clientDataService.getAllReportsCountByType(
        activeScheme,
        dateRange,
      );
      countCacheRef.current[cacheKey] = { counts, fetchedAt: Date.now() };
      setReportTypeCounts(counts);
    } catch (error) {
      console.warn("Could not load total count:", error);
    }
  };

  // Filter and search reports (client-side search + daily-occurrence scheme check only)
  // Type filtering is handled server-side when filterType !== 'all'
  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.referenceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.location?.toLowerCase().includes(searchTerm.toLowerCase());

    // When 'all' view: also apply type filter client-side
    const matchesType =
      filterType === "all" || report.reportType === filterType;

    // Sub-filter for free recovery, incursions, asset damage (client-side safety net)
    if (subFilter === "free-recovery" && report.reportType === "incident") {
      return (
        matchesSearch &&
        (report.incidentType === "Free Recovery" ||
          report.incidentType === "Drive Off")
      );
    }
    if (subFilter === "incursion" && report.reportType === "incident") {
      return matchesSearch && report.incursion === "YES";
    }
    if (subFilter === "asset-damage" && report.reportType === "incident") {
      return matchesSearch && report.propertyDamage === true;
    }
    if (subFilter === "pure" && report.reportType === "incident") {
      return matchesSearch; // server filters by isPureIncident==true — no client work needed
    }
    if (subFilter) return false; // hide non-incident rows when a sub-filter is active

    return matchesSearch && matchesType;
  });

  // Use type-specific count for pagination when a filter is active
  const getActiveCount = () => {
    if (filterType === "incident" && subFilter === "incursion")
      return reportTypeCounts.incursions;
    if (filterType === "incident" && subFilter === "free-recovery")
      return (
        (reportTypeCounts.freeRecovery || 0) + (reportTypeCounts.driveOff || 0)
      );
    if (filterType === "incident" && subFilter === "asset-damage")
      return reportTypeCounts.incidentAssetDamage;
    if (filterType === "incident" && subFilter === "pure")
      return reportTypeCounts.pureIncident;
    if (filterType === "incident") return reportTypeCounts.incident;
    return reportTypeCounts.total;
  };
  const activeCount = getActiveCount();

  const currentReports = isSearchMode ? searchResults : filteredReports;
  const totalPages = Math.ceil(activeCount / reportsPerPage);

  // If restored page exceeds actual total pages, reset to page 1
  useEffect(() => {
    if (!loading && totalPages > 0 && currentPage > totalPages) {
      pageCacheRef.current = {};
      _reportsRestore = null;
      loadReports(true);
    }
  }, [totalPages, loading]);

  // Pagination handlers
  const handleNextPage = () => {
    const atLastPage = totalPages > 0 && currentPage >= totalPages;
    if (hasMore && !atLastPage) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadReports(
        false,
        null,
        null,
        nextPage,
        false,
        undefined,
        appliedDateFilter,
      );
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      loadReports(
        false,
        null,
        null,
        prevPage,
        false,
        undefined,
        appliedDateFilter,
      );
    }
  };

  const handleViewReport = (report) => {
    _reportsRestore = {
      page: currentPage,
      filter: filterType,
      reports,
      hasMore,
      cursors,
      typeCursor,
      reportTypeCounts,
      pageCache: { ...pageCacheRef.current },
      appliedDateFilter,
    };
    // Navigate to appropriate view page based on report type
    const reportTypeRoutes = {
      incident: `${basePath}/reports/incident/${report.id}`,
    };

    const route = reportTypeRoutes[report.reportType];
    if (route) {
      navigate(route);
    } else {
      setSelectedReport(report); // Fallback to modal
    }
  };

  const handleDownloadReport = async (report) => {
    try {
      // The list row only carries display columns (egress optimization) —
      // fetch the full record before handing it to the PDF generator, which
      // reads ~40 fields.
      const fullReport =
        report.reportType === "incident"
          ? await clientDataService.getIncidentById(report.id)
          : report;
      await generateReportPDF(fullReport, report.reportType);
      toast.success(`Downloaded ${report.referenceId || "report"} as PDF`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to download report");
    }
  };

  // Get the active scheme name for display
  const getActiveSchemeName = () => {
    // If activeSchemeName is set, use it
    if (userProfile?.activeSchemeName) {
      return userProfile.activeSchemeName;
    }

    // If we have an activeSchemeId but no activeSchemeName, look it up
    if (userProfile?.activeSchemeId) {
      const activeSchemeObj = SCHEMES.find(
        (s) => s.id === userProfile.activeSchemeId,
      );
      if (activeSchemeObj) {
        return activeSchemeObj.fullName;
      }
    }

    // Fall back to the default scheme name
    return userProfile?.schemeName;
  };

  const handleApplyDateFilter = () => {
    if (!dateFilter.startDate || !dateFilter.endDate) {
      toast.error("Please select both a start and end date.");
      return;
    }
    const start = new Date(dateFilter.startDate);
    // Set end date to end of day so the full day is included
    const end = new Date(dateFilter.endDate);
    end.setHours(23, 59, 59, 999);
    const range = { startDate: start, endDate: end };
    setAppliedDateFilter(range);
    clearRestoreState();
    pageCacheRef.current = {};
    allViewCacheRef.current = {};
    setTypeCursor(null);
    setCursors({});
    loadReports(true, null, null, null, false, undefined, range);
    loadTotalCount(range);
  };

  const handleClearDateFilter = () => {
    setDateFilter({ startDate: "", endDate: "" });
    setAppliedDateFilter(null);
    clearRestoreState();
    pageCacheRef.current = {};
    allViewCacheRef.current = {};
    setTypeCursor(null);
    setCursors({});
    loadReports(true, null, null, null, false, undefined, null);
    loadTotalCount(null);
  };

  // LIVE pill — shown only for incidents still live (matches admin StaffReportsPage).
  const renderStatusBadge = (report) => {
    if (report.reportType !== "incident" || report.status !== "live") return null;
    return (
      <span className="badge bg-red-50 badge-sm gap-2 text-[11px] text-red-600">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
        LIVE
      </span>
    );
  };

  return (
    <ClientSidebarLayout>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Reports</h1>
          <p className="text-gray-600 mt-2">
            View and manage all reports for {getActiveSchemeName()}
          </p>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Search */}
            <div className="w-full md:w-72 relative shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by reference ID or staff name..."
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  setCurrentPage(1);
                  if (searchDebounceRef.current)
                    clearTimeout(searchDebounceRef.current);
                  if (value.trim() === "") {
                    // Search cleared — go back to normal pagination
                    setSearchResults([]);
                    setSearchPage(1);
                    setSearchHasMore(false);
                    setSearchLastDocs({});
                    searchPageCacheRef.current = {};
                    if (wasRestoredRef.current) {
                      wasRestoredRef.current = false;
                      clearRestoreState();
                    }
                    pageCacheRef.current = {};
                    loadReports(true, null, null, null, true);
                  } else if (value.trim().length >= 3) {
                    // Only search after 3 chars — skips "I", "IN" etc.
                    searchDebounceRef.current = setTimeout(() => {
                      searchPageCacheRef.current = {};
                      runSearch(value, 1, {});
                    }, 400);
                  }
                }}
                className="input input-bordered w-full pl-4 bg-white border-gray-300"
              />
            </div>

            {/* Date Range Filter — date inputs stack on mobile so the native
                calendar icon never overlaps the yyyy, inline from sm: up */}
            <div className="flex items-start gap-2 flex-1">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0 mt-3" />
              <div className="flex flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 min-w-0">
                <input
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) =>
                    setDateFilter((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className="input input-bordered bg-white border-gray-300 text-sm h-10 w-full sm:flex-1 min-w-0"
                />
                <span className="text-gray-400 text-sm shrink-0">to</span>
                <input
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) =>
                    setDateFilter((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className="input input-bordered bg-white border-gray-300 text-sm h-10 w-full sm:flex-1 min-w-0"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleApplyDateFilter}
                    className="btn btn-sm bg-brand-500 hover:bg-brand-600 text-white border-none flex-1 sm:flex-none"
                  >
                    Apply
                  </button>
                  {appliedDateFilter && (
                    <button
                      onClick={handleClearDateFilter}
                      className="btn btn-sm btn-ghost text-gray-500 flex-1 sm:flex-none"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                value={filterType}
                onChange={(e) => {
                  const newType = e.target.value;
                  clearRestoreState();
                  setSubFilter(null);
                  setFilterType(newType);
                  setTypeCursor(null);
                  setCursors({});
                  pageCacheRef.current = {};
                  if (searchTerm.trim()) {
                    searchPageCacheRef.current = {};
                    runSearch(searchTerm, 1, {}, newType === "all" ? null : newType);
                  } else {
                    loadReports(
                      true,
                      newType,
                      null,
                      null,
                      false,
                      null,
                      appliedDateFilter,
                    );
                  }
                }}
                className="select  select-bordered bg-white border-gray-300"
              >
                <option value="all">All Types</option>
                <option value="incident">Recovery Job Sheets</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reports Table */}
        <div className="bg-white rounded-xl shadow-md sm:overflow-hidden">
          {loading || searchLoading ? (
            <div className="p-12 text-center">
              <span className="loading loading-spinner loading-lg text-brand-500"></span>
            </div>
          ) : currentReports.length > 0 ? (
            <>
              {/* Mobile: one card per report, actions tucked into a kebab menu */}
              <div className="sm:hidden p-3 space-y-3">
                {currentReports.map((report, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs font-mono text-white bg-brand-600 px-2 py-1 rounded">
                          {report.referenceId}
                        </code>
                        <span
                          className={`badge ${getReportTypeBadge(report.reportType)} badge-sm pl-2`}
                        >
                          {getReportTypeIcon(report.reportType)}
                          {getReportTypeLabel(report.reportType)}
                        </span>
                        {renderStatusBadge(report)}
                        {report.reportType === "incident" &&
                          report.incursion === "YES" && (
                            <span className="badge badge-error badge-xs">
                              Incursion
                            </span>
                          )}
                      </div>

                      <div className="dropdown dropdown-end shrink-0">
                        <button
                          tabIndex={0}
                          type="button"
                          className="btn btn-ghost btn-sm btn-circle text-gray-500"
                          title="Actions"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-white rounded-lg border border-gray-200 shadow-lg z-20 w-44 p-2"
                        >
                          <li>
                            <button
                              onClick={() => {
                                document.activeElement?.blur();
                                handleViewReport(report);
                              }}
                              className="text-blue-600"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </li>
                          <li>
                            <button
                              onClick={() => {
                                document.activeElement?.blur();
                                handleDownloadReport(report);
                              }}
                              className="text-purple-600"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <p className="font-semibold text-brand-500">
                      {report.scheme || getActiveSchemeName() || "N/A"}
                    </p>

                    <div className="flex items-center justify-between mt-2 text-sm text-gray-600">
                      <span>
                        {getReportDisplayDate(report)} ·{" "}
                        {getReportDisplayTime(report)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 mt-1">
                      {report.submittedBy?.name ||
                        (typeof report.submittedBy === "string"
                          ? report.submittedBy
                          : "Staff")}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop: full table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="table w-full">
                  <thead className="bg-brand-500">
                    <tr>
                      <th className="text-left text-white">Type</th>
                      <th className="text-left text-white">Reference ID</th>
                      <th className="text-left text-white">Submitted By</th>
                      <th className="text-left text-white">Scheme</th>
                      <th className="text-left text-white">Date & Time</th>
                      <th className="text-center text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReports.map((report, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td>
                          <div className="flex items-center gap-2">
                            <span
                              className={`badge ${getReportTypeBadge(report.reportType)} badge-sm p-3`}
                            >
                              {getReportTypeIcon(report.reportType)}
                              {getReportTypeLabel(report.reportType)}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-sm font-semibold">
                          <div>{report.referenceId}</div>
                          {renderStatusBadge(report)}
                          {report.reportType === "incident" &&
                            report.incursion === "YES" && (
                              <span className="badge badge-error badge-xs mt-1">
                                Incursion
                              </span>
                            )}
                        </td>
                        <td className="text-sm text-gray-800">
                          {report.submittedBy?.name ||
                            (typeof report.submittedBy === "string"
                              ? report.submittedBy
                              : "Staff")}
                        </td>
                        <td className="text-sm text-gray-600 max-w-xs truncate">
                          {report.scheme || getActiveSchemeName() || "N/A"}
                        </td>
                        <td>
                          <div className="text-sm">
                            <p className="font-medium text-gray-800">
                              {getReportDisplayDate(report)}
                            </p>
                            <p className="text-gray-400">
                              {getReportDisplayTime(report)}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewReport(report)}
                              className="btn btn-sm btn-ghost text-blue-600 hover:text-blue-800"
                              title="View Report"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadReport(report)}
                              className="btn btn-sm btn-ghost text-purple-600 hover:text-purple-800"
                              title="Download Report"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Search pagination */}
              {isSearchMode && (searchPage > 1 || searchHasMore) && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-gray-600">
                    Page {searchPage} &mdash; {searchResults.length} result
                    {searchResults.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSearchPrevPage}
                      disabled={searchPage === 1}
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium">Page {searchPage}</span>
                    <button
                      onClick={handleSearchNextPage}
                      disabled={!searchHasMore}
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Pagination — hidden while searching */}
              {!isSearchMode && (currentPage > 1 || hasMore) && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-gray-600">
                    Page {currentPage}
                    {totalPages > 1 ? ` of ${totalPages}` : ""}
                    {activeCount > 0
                      ? ` (${activeCount} total ${filterType === "all" ? "reports" : filterType.replace(/-/g, " ") + "s"})`
                      : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium">
                      Page {currentPage}
                      {totalPages > 1 ? ` of ${totalPages}` : ""}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={
                        !hasMore ||
                        (totalPages > 0 && currentPage >= totalPages)
                      }
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No reports found</p>
              <p className="text-gray-400 text-sm mt-2">
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Report Detail Modal (fallback when no dedicated view route exists) */}
      <ReportDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onDownload={handleDownloadReport}
      />
    </ClientSidebarLayout>
  );
};

export default ReportsPage;
