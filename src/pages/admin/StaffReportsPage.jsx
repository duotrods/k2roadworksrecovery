import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { staffService } from "../../services/staffService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { SCHEMES, DEMO_SCHEME_ID } from "../../utils/schemes";
import {
  FileText,
  Eye,
  Edit,
  FilePlus2,
  Download,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ShieldCheck,
  Car,
  MoreVertical,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCarBurst, faUserShield, faCar } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-hot-toast";
import { generateReportPDF } from "../../utils/pdfGenerator";

// Module-level variable — survives component unmount/remount, no serialization needed
let _staffReportsRestore = null;

const StaffReportsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const [filterScheme, setFilterScheme] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLastDocs, setSearchLastDocs] = useState({});
  const searchPageCacheRef = useRef({});
  const [cursors, setCursors] = useState({});
  const [typeCursor, setTypeCursor] = useState(null);
  const pageCacheRef = useRef({});
  const wasRestoredRef = useRef(false);
  const searchDebounceRef = useRef(null);
  const searchCounterRef = useRef(0);
  const searchRateLimitRef = useRef([]); // timestamps of recent searches
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [typeCount, setTypeCount] = useState(0);
  const reportsPerPage = 10;

  // Maps admin display filter values → staffService type keys
  const adminTypeToServiceType = {
    'Recovery Job Sheet': 'incident',
    'Cabin H&S Check': 'cabin-safety',
    'Vehicle Daily Check': 'vehicle-check',
  };

  useEffect(() => {
    if (_staffReportsRestore) {
      setCurrentPage(_staffReportsRestore.page);
      setFilterType(_staffReportsRestore.filter);
      setFilterScheme(_staffReportsRestore.scheme);
      setReports(_staffReportsRestore.reports);
      setHasMore(_staffReportsRestore.hasMore);
      setCursors(_staffReportsRestore.cursors || {});
      setTypeCursor(_staffReportsRestore.typeCursor || null);
      setTypeCount(_staffReportsRestore.typeCount || 0);
      setTotalCount(_staffReportsRestore.totalCount || 0);
      // Restore the full page cache so Prev/Next navigation works on all cached pages
      pageCacheRef.current = _staffReportsRestore.pageCache ? { ..._staffReportsRestore.pageCache } : {
        [_staffReportsRestore.page]: {
          data: _staffReportsRestore.reports,
          cursors: _staffReportsRestore.cursors || {},
          typeCursor: _staffReportsRestore.typeCursor || null,
          hasMore: _staffReportsRestore.hasMore,
        }
      };
      setLoading(false);
      wasRestoredRef.current = true;
    } else {
      loadAllReports(true);
    }
    loadTotalCount();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const clearRestoreState = () => { _staffReportsRestore = null; };

  const typeToCollectionKey = {
    'Recovery Job Sheet': ['incident'],
    'Cabin H&S Check': ['cabinSafety'],
    'Vehicle Daily Check': ['vehicleCheck'],
  };

  const mapSearchResults = (results) => {
    const typeMap = {
      'Recovery Job Sheet': { type: 'Recovery Job Sheet', icon: FileText, color: 'bg-brand-100 text-brand-600' },
      'Cabin H&S Check': { type: 'Cabin H&S Check', icon: ShieldCheck, color: 'bg-emerald-100 text-emerald-600' },
      'Vehicle Daily Check': { type: 'Vehicle Daily Check', icon: Car, color: 'bg-amber-100 text-amber-600' },
    };
    return results.map(f => ({ ...f, ...(typeMap[f.type] || {}) }));
  };

  const runSearch = async (term, page = 1, lastDocs = {}, overrideType = null, overrideScheme = null) => {
    if (!term.trim()) {
      setSearchResults([]);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearchLastDocs({});
      searchPageCacheRef.current = {};
      return;
    }
    const now = Date.now();
    searchRateLimitRef.current = searchRateLimitRef.current.filter(t => now - t < 30000);
    if (searchRateLimitRef.current.length >= 10) {
      toast.error('Too many searches. Please wait a moment.');
      return;
    }
    searchRateLimitRef.current.push(now);
    const myCount = ++searchCounterRef.current;
    setSearchLoading(true);
    try {
      const activeType = overrideType !== null ? overrideType : filterType;
      const activeScheme = overrideScheme !== null ? overrideScheme : filterScheme;
      const collections = activeType !== 'all' ? typeToCollectionKey[activeType] : null;
      const { results, lastDocs: newLastDocs, hasMore } =
        await staffService.searchFormsPaginated(term.trim(), 10, lastDocs, collections);
      if (myCount !== searchCounterRef.current) return; // stale

      // Client-side scheme filter
      const schemeId = activeScheme !== 'all' ? activeScheme : null;
      const filtered = schemeId
        ? results.filter(f => {
          if (f.schemeIds?.length) return f.schemeIds.includes(schemeId);
          return f.schemeId === schemeId || f.scheme?.split(' ')[0] === schemeId;
        })
        : results;

      const mapped = mapSearchResults(filtered);
      searchPageCacheRef.current[page] = { results: mapped, lastDocs: newLastDocs, hasMore };
      setSearchResults(mapped);
      setSearchPage(page);
      setSearchHasMore(hasMore);
      setSearchLastDocs(newLastDocs);
    } catch (err) {
      console.error('Search failed:', err);
      toast.error('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchNextPage = () => {
    if (!searchHasMore) return;
    runSearch(searchQuery, searchPage + 1, searchLastDocs);
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

  const loadAllReports = async (resetPage = false, overrideFilter = null, overrideScheme = null, cursorOverride = null, targetPage = null, silent = false) => {
    // Check page cache first (targetPage is set by pagination handlers)
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

      const activeFilter = overrideFilter !== null ? overrideFilter : filterType;
      const activeScheme = overrideScheme !== null ? overrideScheme : filterScheme;
      // staffService's Supabase queries filter with .overlaps("scheme_ids", schemeIds),
      // which requires an array — a bare string produces a malformed array literal
      // and the query silently returns zero rows.
      const schemeId = activeScheme !== 'all' ? [activeScheme] : null;
      let rawForms;
      let newCursors = {};
      let newTypeCursor = null;
      let newHasMore = true;

      if (activeFilter === 'all') {
        const effectiveCursors = cursorOverride ? cursorOverride.cursors : (resetPage ? {} : cursors);
        const result = await staffService.getAllFormsPaginated(
          reportsPerPage,
          effectiveCursors,
          schemeId
        );
        rawForms = result.forms;
        newCursors = result.cursors;
        newHasMore = result.hasMore;
        setCursors(newCursors);
        setHasMore(newHasMore);
      } else {
        const effectiveTypeCursor = cursorOverride ? cursorOverride.typeCursor : (resetPage ? null : typeCursor);
        const serviceType = adminTypeToServiceType[activeFilter] || activeFilter;
        const result = await staffService.getFormsByTypePaginated(
          serviceType,
          reportsPerPage,
          effectiveTypeCursor,
          schemeId
        );
        rawForms = result.forms;
        newTypeCursor = result.lastDoc;
        newHasMore = result.hasMore;
        setTypeCursor(newTypeCursor);
        setHasMore(newHasMore);
      }

      // Map forms to reports with display metadata
      const mappedReports = rawForms.map(f => {
        let type, icon, color;

        if (f.type === 'Recovery Job Sheet') {
          type = "Recovery Job Sheet";
          icon = FileText;
          color = "bg-brand-100 text-brand-600";
        } else if (f.type === 'Cabin H&S Check') {
          type = "Cabin H&S Check";
          icon = ShieldCheck;
          color = "bg-emerald-100 text-emerald-600";
        } else if (f.type === 'Vehicle Daily Check') {
          type = "Vehicle Daily Check";
          icon = Car;
          color = "bg-amber-100 text-amber-600";
        }

        return { ...f, type, icon, color };
      });

      // Exclude demo scheme (DMO1) forms from admin view
      const filteredReports = mappedReports.filter(report => {
        if (report.schemeIds && Array.isArray(report.schemeIds)) {
          return !report.schemeIds.every(id => id === DEMO_SCHEME_ID);
        }
        const schemeId = report.schemeId || report.scheme?.split(' ')[0];
        return schemeId !== DEMO_SCHEME_ID;
      });

      setReports(filteredReports);

      // Cache this page's data
      const pageNum = targetPage || (resetPage ? 1 : currentPage);
      pageCacheRef.current[pageNum] = {
        data: filteredReports,
        cursors: newCursors,
        typeCursor: newTypeCursor,
        hasMore: newHasMore,
      };

      if (resetPage) {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error("Failed to load reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const loadTotalCount = async () => {
    try {
      const count = await staffService.getAllFormsCount();
      setTotalCount(count);
    } catch (error) {
      console.warn('Could not load total count:', error);
    }
  };

  const handleFilterChange = async (newType) => {
    clearRestoreState();
    setFilterType(newType);
    setTypeCursor(null);
    setCursors({});
    pageCacheRef.current = {};
    setCurrentPage(1);
    if (searchQuery.trim()) {
      searchPageCacheRef.current = {};
      runSearch(searchQuery, 1, {}, newType, null);
    } else {
      loadAllReports(true, newType);
    }
    if (newType !== 'all') {
      try {
        const serviceType = adminTypeToServiceType[newType] || newType;
        const count = await staffService.getFormCountForType(serviceType);
        setTypeCount(count);
      } catch {
        setTypeCount(0);
      }
    }
  };

  const handleSchemeChange = (newScheme) => {
    clearRestoreState();
    setFilterScheme(newScheme);
    setTypeCursor(null);
    setCursors({});
    pageCacheRef.current = {};
    setCurrentPage(1);
    if (searchQuery.trim()) {
      searchPageCacheRef.current = {};
      runSearch(searchQuery, 1, {}, null, newScheme);
    } else {
      loadAllReports(true, null, newScheme);
    }
  };

  const applyFilters = () => {
    // Type and scheme filtering are handled server-side; text search uses Firestore query
    setFilteredReports([...reports]);
  };

  // Non-demo schemes for the dropdown
  const availableSchemes = SCHEMES.filter(s => !s.isDemo);

  const handleViewReport = (report) => {
    _staffReportsRestore = { page: currentPage, filter: filterType, scheme: filterScheme, reports, hasMore, cursors, typeCursor, typeCount, totalCount, pageCache: { ...pageCacheRef.current } };
    // Navigate to appropriate view page based on report type
    if (report.type === "Recovery Job Sheet") {
      navigate(`/dashboard/admin/staff-reports/incident/${report.id}`);
    } else if (report.type === "Cabin H&S Check") {
      navigate(`/dashboard/admin/staff-reports/cabin-safety/${report.id}`);
    } else if (report.type === "Vehicle Daily Check") {
      navigate(`/dashboard/admin/staff-reports/vehicle-check/${report.id}`);
    }
  };

  // Admin edits reuse the same staff create/edit form pages staff use for
  // their own reports (create vs edit is just the ?edit= query param) — see
  // ReportsList.jsx's handleEditForm for the staff-side equivalent. Those
  // routes now also allow the admin role and pick admin's own sidebar chrome
  // when the signed-in user is an admin.
  const handleEditForm = (report) => {
    _staffReportsRestore = { page: currentPage, filter: filterType, scheme: filterScheme, reports, hasMore, cursors, typeCursor, typeCount, totalCount, pageCache: { ...pageCacheRef.current } };
    if (report.type === "Recovery Job Sheet") {
      navigate(`/dashboard/staff/forms/incident-report?edit=${report.id}`);
    } else if (report.type === "Cabin H&S Check") {
      navigate(`/dashboard/staff/forms/cabin-safety-check?edit=${report.id}`);
    } else if (report.type === "Vehicle Daily Check") {
      navigate(`/dashboard/staff/forms/vehicle-daily-check?edit=${report.id}`);
    }
  };

  const handleDownloadPDF = async (report) => {
    try {
      // Map display type to PDF generator type
      const typeMap = {
        "Recovery Job Sheet": "incident",
        "Cabin H&S Check": "cabin-safety",
        "Vehicle Daily Check": "vehicle-check",
      };
      const reportType = typeMap[report.type] || "incident";
      await generateReportPDF(report, reportType);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const isSearchMode = searchQuery.trim() !== '';

  // Use Firestore search results when searching, otherwise use paginated page data
  const currentReports = isSearchMode ? searchResults : filteredReports;
  const activeCount = filterType === 'all' ? totalCount : typeCount;
  const totalPages = Math.ceil(activeCount / reportsPerPage);

  // If restored page exceeds actual total pages, reset to page 1
  useEffect(() => {
    if (!loading && totalPages > 0 && currentPage > totalPages) {
      pageCacheRef.current = {};
      _staffReportsRestore = null;
      loadAllReports(true);
    }
  }, [totalPages, loading]);

  // Pagination handlers
  const handleNextPage = () => {
    const atLastPage = totalPages > 0 && currentPage >= totalPages;
    if (hasMore && !atLastPage) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadAllReports(false, null, null, null, nextPage);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      loadAllReports(false, null, null, null, prevPage);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getFormTypeIcon = (type) => {
    switch (type) {
      case "Recovery Job Sheet":
        return (
          <FontAwesomeIcon icon={faCarBurst} className="text-brand-600 text-[14px]" />
        );
      case "Cabin H&S Check":
        return (
          <FontAwesomeIcon icon={faUserShield} className="text-emerald-600 text-[14px]"/>
        );
      case "Vehicle Daily Check":
        return (
          <FontAwesomeIcon icon={faCar} className="text-amber-500 text-[14px]" />
        );
      default:
        return <FileText className="w-5 h-5 text-gray-500 text-[10px]" />;
    }
  };

    const getFormTypeBadge = (type) => {
      const badges = {
        "Recovery Job Sheet": "bg-brand-100 text-brand-600 font-semibold",
        "Cabin H&S Check": "bg-emerald-100 text-emerald-600 font-semibold",
        "Vehicle Daily Check": "bg-amber-100 text-amber-600 font-semibold",
      };
      return badges[type] || "badge-ghost";
    };

  // Live pill — shown only for incidents still live; completed/others get nothing.
  const renderStatusBadge = (report) => {
    if (report.type !== "Recovery Job Sheet" || report.status !== "live") return null;
    return (
      <span className="badge bg-red-50 badge-sm gap-2 text-[11px] text-red-600">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
        LIVE
      </span>
    );
  };

  // Get scheme(s) from form - handles different form structures
  const getFormScheme = (report) => {
    return report.scheme || "N/A";
  };

  // Get the appropriate date from form
  const getFormDate = (report) => {
    // For other forms - use form.date if available, otherwise createdAt
    if (report.date) {
      return report.date;
    }
    // Fallback to createdAt
    if (report.createdAt) {
      return formatDate(report.createdAt);
    }
    return "N/A";
  };

  // Get the appropriate time from form
  const getFormTime = (report) => {
    // For Recovery Job Sheets - always use timeSpotted
    if (report.type === "Recovery Job Sheet" && report.timeSpotted) {
      return report.timeSpotted;
    }
    // For other forms - use form.time if available, otherwise createdAt time
    if (report.time) {
      return report.time;
    }
    // Fallback to createdAt time
    if (report.createdAt) {
      const date = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
      return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    return "N/A";
  };

  // Handle delete report
  const handleDeleteClick = (report) => {
    setReportToDelete(report);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;

    setDeleting(true);
    try {
      // Map report type to collection name
      const collectionMap = {
        "Recovery Job Sheet": "incidentReports",
        "Cabin H&S Check": "cabinHealthSafetyChecks",
        "Vehicle Daily Check": "vehicleDailyChecks",
      };
      const collectionName = collectionMap[reportToDelete.type];

      if (collectionName) {
        await staffService.deleteReport(collectionName, reportToDelete.id);
        toast.success("Report deleted successfully");
        // Remove from local state
        setReports((prev) => prev.filter((r) => r.id !== reportToDelete.id));
      }
    } catch (error) {
      console.error("Failed to delete report:", error);
      toast.error("Failed to delete report");
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
      setReportToDelete(null);
    }
  };

  return (
    <AdminSidebarLayout>
      <div className="max-w-8xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className=" text-gray-800 mb-2">Staff Reports</h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">
            View and manage all submitted forms from staff members
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by reference ID or staff name..."
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchQuery(value);
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  if (!value.trim()) {
                    setSearchResults([]);
                    setSearchPage(1);
                    setSearchHasMore(false);
                    setSearchLastDocs({});
                    searchPageCacheRef.current = {};
                    setCurrentPage(1);
                    setCursors({});
                    setTypeCursor(null);
                    pageCacheRef.current = {};
                    loadAllReports(true, null, null, null, null, true);
                    return;
                  }
                  searchDebounceRef.current = setTimeout(() => {
                    searchPageCacheRef.current = {};
                    runSearch(value, 1, {});
                  }, 150);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Filter by Type */}
            <select
              value={filterType}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="select bg-white border-gray-300 rounded-lg w-full"
            >
              <option value="all">All Types</option>
              <option value="Recovery Job Sheet">Recovery Job Sheet</option>
              <option value="Cabin H&S Check">Cabin H&S Check</option>
              <option value="Vehicle Daily Check">Vehicle Daily Check</option>
            </select>

            {/* Filter by Scheme */}
            <select
              value={filterScheme}
              onChange={(e) => handleSchemeChange(e.target.value)}
              className="select bg-white border-gray-300 rounded-lg w-full"
            >
              <option value="all">All Schemes</option>
              {availableSchemes.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <Filter className="w-4 h-4" />
            <span>
              {isSearchMode
                ? `Page ${searchPage} — ${searchResults.length} search result${searchResults.length !== 1 ? 's' : ''}`
                : `Showing ${filteredReports.length} of ${activeCount} reports`}
            </span>
          </div>
        </div>

        {/* Reports Table */}
        <div className="bg-white rounded-xl shadow-md sm:overflow-hidden">
          {loading || searchLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="loading loading-spinner loading-lg text-brand-500"></div>
            </div>
          ) : currentReports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No reports found</p>
            </div>
          ) : (
            <>
              {/* Desktop: table */}
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
                    {currentReports.map((report) => (
                      <tr key={report.id} className="hover:bg-gray-50">
                        <td>
                          <div className="flex items-center gap-2">
                            
                            <span className={`badge ${getFormTypeBadge(report.type)} badge-sm p-3`}>
                              {getFormTypeIcon(report.type)}
                              {(report.type || '').toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-sm font-semibold">
                          <div>{report.referenceId || report.id.slice(0, 12)}</div>
                          {renderStatusBadge(report)}
                          {report.type === "Recovery Job Sheet" && report.incursion === "YES" && (
                            <span className="badge badge-error badge-xs mt-1">Incursion</span>
                          )}
                          {report.type === "Vehicle Daily Check" && report.day && (
                            <div className="text-xs font-sans font-normal text-gray-500 mt-1 capitalize">
                              {report.day}
                            </div>
                          )}
                        </td>
                        <td className="text-sm">
                          <div>
                            <div className="text-gray-800">
                              {report.submittedBy?.name || `${report.firstName || ""} ${report.lastName || ""}`.trim() || "N/A"}
                            </div>
                            {report.lastEditedBy && (
                              <div className="text-xs text-blue-600 mt-1">
                                Edited by: {report.lastEditedBy?.name || "Unknown"}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="text-sm text-gray-600 max-w-xs truncate">
                          {getFormScheme(report)}
                        </td>
                        <td className="text-sm">
                          <div className="text-gray-800 font-medium">{getFormDate(report)}</div>
                          <div className="text-gray-400">{getFormTime(report)}</div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-2">
                            {report.type === "Recovery Job Sheet" && report.status === "live" ? (
                              <button
                                onClick={() => handleEditForm(report)}
                                className="btn btn-sm btn-ghost text-red-500 hover:text-red-800"
                                title="Edit"
                              >
                                <FilePlus2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEditForm(report)}
                                className="btn btn-sm btn-ghost text-green-600 hover:text-green-800"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleViewReport(report)}
                              className="btn btn-sm btn-ghost text-blue-600 hover:text-blue-800"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPDF(report)}
                              className="btn btn-sm btn-ghost text-purple-600 hover:text-purple-800"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(report)}
                              className="btn btn-sm btn-ghost text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: one card per report, actions tucked into a kebab menu */}
              <div className="sm:hidden p-3 space-y-3">
                {currentReports.map((report) => (
                  <div
                    key={report.id}
                    className="border border-gray-200 rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs font-mono text-white bg-brand-600 px-2 py-1 rounded">
                          {report.referenceId || report.id.slice(0, 12)}
                        </code>
                        <span className={`badge ${getFormTypeBadge(report.type)} badge-sm pl-2`}>
                          {getFormTypeIcon(report.type)}
                          {(report.type || "").toUpperCase()}
                        </span>
                        {renderStatusBadge(report)}
                        {report.type === "Recovery Job Sheet" &&
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
                                handleEditForm(report);
                              }}
                              className={
                                report.type === "Recovery Job Sheet" && report.status === "live"
                                  ? "text-red-500"
                                  : "text-green-600"
                              }
                            >
                              {report.type === "Recovery Job Sheet" && report.status === "live" ? (
                                <FilePlus2 className="w-4 h-4" />
                              ) : (
                                <Edit className="w-4 h-4" />
                              )}
                              Edit
                            </button>
                          </li>
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
                                handleDownloadPDF(report);
                              }}
                              className="text-purple-600"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF
                            </button>
                          </li>
                          <li>
                            <button
                              onClick={() => {
                                document.activeElement?.blur();
                                handleDeleteClick(report);
                              }}
                              className="text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <p className="font-semibold text-brand-500">
                      {getFormScheme(report)}
                    </p>

                    <div className="flex items-center justify-between mt-2 text-sm text-gray-600">
                      <span>
                        {getFormDate(report)} · {getFormTime(report)}
                      </span>
                      {report.type === "Vehicle Daily Check" && report.day && (
                        <span className="capitalize">{report.day}</span>
                      )}
                    </div>

                    <p className="text-xs text-gray-400 mt-1">
                      {report.submittedBy?.name ||
                        `${report.firstName || ""} ${report.lastName || ""}`.trim() ||
                        "N/A"}
                    </p>
                  </div>
                ))}
              </div>

              {/* Search pagination */}
              {isSearchMode && (searchPage > 1 || searchHasMore) && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-gray-600">
                    Page {searchPage} — {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
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

              {/* Pagination */}
              {!isSearchMode && (currentPage > 1 || hasMore) && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-gray-600">
                    Page {currentPage}{totalPages > 1 ? ` of ${totalPages}` : ''}{activeCount > 0 ? ` (${activeCount} total reports)` : ''}
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
                      Page {currentPage}{totalPages > 1 ? ` of ${totalPages}` : ''}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={!hasMore || (totalPages > 0 && currentPage >= totalPages)}
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Delete Report</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this {reportToDelete?.type}?
              <br />
              <span className="font-semibold text-gray-800">
                Reference: {reportToDelete?.referenceId || reportToDelete?.id?.slice(0, 12)}
              </span>
              <br />
              <span className="text-red-600 text-sm mt-2 block">
                This action cannot be undone.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setReportToDelete(null);
                }}
                className="btn btn-outline"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="btn bg-red-600 hover:bg-red-700 text-white border-none"
                disabled={deleting}
              >
                {deleting ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminSidebarLayout>
  );
};

export default StaffReportsPage;
