import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import {
  FileText,
  Eye,
  Edit,
  Download,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Radio,
  CheckCircle,
  FilePlus2,
  AlertTriangle,
  ShieldCheck,
  Car,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { generateReportPDF } from "../../utils/pdfGenerator";
import {
  isDemoUser,
  DEMO_SCHEME_ID,
  getViewerSchemeScope,
} from "../../utils/schemes";
import { getStaffBasePath } from "../../utils/constants";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";

// Module-level variable — survives component unmount/remount, no serialization needed
let _dashRestore = null;

const StaffReportsListPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  // Scheme scope for this viewer: TP staff → their company schemes; real staff →
  // all internal (non-demo, non-TP) schemes; demo → demo scheme. This keeps
  // third-party forms out of the real-staff list, counts, and search.
  const schemeScope = getViewerSchemeScope(userProfile);

  const [latestForms, setLatestForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [cursors, setCursors] = useState({});
  const [typeCursor, setTypeCursor] = useState(null);
  const pageCacheRef = useRef({}); // Cache: { [pageNumber]: { cursors, typeCursor, data, hasMore } }
  const wasRestoredRef = useRef(false);
  const searchDebounceRef = useRef(null);
  const searchCounterRef = useRef(0);
  const searchRateLimitRef = useRef([]);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [typeCount, setTypeCount] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLastDocs, setSearchLastDocs] = useState({});
  const searchPageCacheRef = useRef({});
  const formsPerPage = 10;

  useEffect(() => {
    if (!userProfile) return;

    loadTotalCount();

    if (_dashRestore) {
      // Restore the exact page the user was on before viewing a report
      setCurrentPage(_dashRestore.page);
      setFilterType(_dashRestore.filter);
      setLatestForms(_dashRestore.forms);
      setHasMore(_dashRestore.hasMore);
      setCursors(_dashRestore.cursors || {});
      setTypeCursor(_dashRestore.typeCursor || null);
      setTypeCount(_dashRestore.typeCount || 0);
      setTotalCount(_dashRestore.totalCount || 0);
      // Restore the full page cache so Prev/Next navigation works on all cached pages
      pageCacheRef.current = _dashRestore.pageCache
        ? { ..._dashRestore.pageCache }
        : {
            [_dashRestore.page]: {
              data: _dashRestore.forms,
              cursors: _dashRestore.cursors || {},
              typeCursor: _dashRestore.typeCursor || null,
              hasMore: _dashRestore.hasMore,
            },
          };
      setLoading(false);
      wasRestoredRef.current = true;
    } else {
      loadDashboardData(true);
    }
  }, [userProfile?.uid]);

  const loadDashboardData = async (
    resetPage = false,
    overrideFilter = null,
    cursorOverride = null,
    targetPage = null,
    silent = false,
  ) => {
    if (!userProfile) return;

    // Check page cache first (targetPage is set by pagination handlers)
    if (targetPage && pageCacheRef.current[targetPage]) {
      const cached = pageCacheRef.current[targetPage];
      setLatestForms(cached.data);
      setCursors(cached.cursors);
      setTypeCursor(cached.typeCursor);
      setHasMore(cached.hasMore);
      setCurrentPage(targetPage);
      return;
    }

    try {
      if (!silent) setLoading(true);

      const isDemo = isDemoUser(userProfile);
      const activeFilter =
        overrideFilter !== null ? overrideFilter : filterType;

      let rawForms;
      let newCursors = {};
      let newTypeCursor = null;
      let newHasMore = true;

      if (activeFilter === "all") {
        const effectiveCursors = cursorOverride
          ? cursorOverride.cursors
          : resetPage
            ? {}
            : cursors;
        const result = await staffService.getAllFormsPaginated(
          formsPerPage,
          effectiveCursors,
          schemeScope,
        );
        rawForms = result.forms;
        newCursors = result.cursors;
        newHasMore = result.hasMore;
        setCursors(newCursors);
        setHasMore(newHasMore);
      } else {
        const effectiveTypeCursor = cursorOverride
          ? cursorOverride.typeCursor
          : resetPage
            ? null
            : typeCursor;
        const result = await staffService.getFormsByTypePaginated(
          activeFilter,
          formsPerPage,
          effectiveTypeCursor,
          schemeScope,
        );
        rawForms = result.forms;
        newTypeCursor = result.lastDoc;
        newHasMore = result.hasMore;
        setTypeCursor(newTypeCursor);
        setHasMore(newHasMore);
      }

      // Filter forms based on demo status
      let filteredForms = rawForms;
      if (isDemo) {
        filteredForms = rawForms.filter((form) => {
          if (
            form.schemeIds &&
            Array.isArray(form.schemeIds) &&
            form.schemeIds.length > 0
          ) {
            return form.schemeIds.every((id) => id === DEMO_SCHEME_ID);
          }
          if (form.schemeId) return form.schemeId === DEMO_SCHEME_ID;
          const schemeId = form.scheme?.split(" ")[0];
          return schemeId === DEMO_SCHEME_ID;
        });
      } else {
        filteredForms = rawForms.filter((form) => {
          if (
            form.schemeIds &&
            Array.isArray(form.schemeIds) &&
            form.schemeIds.length > 0
          ) {
            return !form.schemeIds.every((id) => id === DEMO_SCHEME_ID);
          }
          if (form.schemeId) return form.schemeId !== DEMO_SCHEME_ID;
          const schemeId = form.scheme?.split(" ")[0];
          return schemeId !== DEMO_SCHEME_ID;
        });
      }

      setLatestForms(filteredForms);

      // Cache this page's data
      const pageNum = targetPage || (resetPage ? 1 : currentPage);
      pageCacheRef.current[pageNum] = {
        data: filteredForms,
        cursors: newCursors,
        typeCursor: newTypeCursor,
        hasMore: newHasMore,
      };

      if (resetPage) setCurrentPage(1);
    } catch (error) {
      console.error("Failed to load reports:", error);
      toast.error("Failed to load forms");
    } finally {
      setLoading(false);
    }
  };

  const loadTotalCount = async () => {
    try {
      const count = await staffService.getAllFormsCount(schemeScope);
      setTotalCount(count);
    } catch (error) {
      console.warn("Could not load total count:", error);
    }
  };

  const clearRestoreState = () => {
    _dashRestore = null;
  };

  const runSearch = async (term, page = 1, lastDocs = {}) => {
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
      const { results, lastDocs: newLastDocs, hasMore } =
        await staffService.searchFormsPaginated(
          term.trim(),
          10,
          lastDocs,
          null,
          schemeScope,
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
    const prevPage = searchPage - 1;
    const cached = searchPageCacheRef.current[prevPage];
    if (cached) {
      setSearchResults(cached.results);
      setSearchPage(prevPage);
      setSearchHasMore(cached.hasMore);
      setSearchLastDocs(cached.lastDocs);
    }
  };

  const handleFilterChange = async (newType) => {
    clearRestoreState();
    setFilterType(newType);
    setTypeCursor(null);
    pageCacheRef.current = {};
    setCurrentPage(1);
    loadDashboardData(true, newType);
    if (newType !== "all") {
      try {
        const count = await staffService.getFormCountForType(newType, schemeScope);
        setTypeCount(count);
      } catch {
        setTypeCount(0);
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    // If it's already a string (form.date), return as-is or format it
    if (typeof dateString === "string") {
      return dateString;
    }
    // If it's a timestamp, convert it
    const date = dateString.toDate();
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const getFormTypeIcon = (type) => {
    switch (type) {
      case "Incident Report":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "Cabin H&S Check":
        return <ShieldCheck className="w-5 h-5 text-green-500" />;
      case "Vehicle Daily Check":
        return <Car className="w-5 h-5 text-amber-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getFormTypeBadge = (type) => {
    const badges = {
      "Incident Report": "badge-warning",
      "Cabin H&S Check": "badge-success",
      "Vehicle Daily Check": "badge-warning",
    };
    return badges[type] || "badge-ghost";
  };

  // Get scheme(s) from form - handles different form structures
  const getFormScheme = (form) => {
    return form.scheme || "N/A";
  };

  // Get the appropriate date from form
  const getFormDate = (form) => {
    // For other forms - use form.date if available, otherwise createdAt
    if (form.date) {
      return form.date;
    }
    // Fallback to createdAt
    if (form.createdAt) {
      return formatDate(form.createdAt);
    }
    return "N/A";
  };

  // Get the appropriate time from form
  const getFormTime = (form) => {
    // For Incident Reports (Job Sheets) - use time of arrival
    if (form.type === "Incident Report" && form.timeOfArrival) {
      return form.timeOfArrival;
    }
    // For other forms - use form.time if available, otherwise createdAt time
    if (form.time) {
      return form.time;
    }
    // Fallback to createdAt time
    if (form.createdAt) {
      const date = form.createdAt.toDate
        ? form.createdAt.toDate()
        : new Date(form.createdAt);
      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "N/A";
  };

  const isSearchMode = searchTerm.trim() !== "";

  // Type filter is handled server-side; text search uses Firestore query
  const filteredForms = latestForms.filter((form) => {
    const formTypeMap = {
      "Incident Report": "incident",
      "Cabin H&S Check": "cabin-safety",
      "Vehicle Daily Check": "vehicle-check",
    };
    return filterType === "all" || formTypeMap[form.type] === filterType;
  });

  // Use Firestore search results when searching, otherwise use paginated page data
  const currentForms = isSearchMode ? searchResults : filteredForms;
  const activeCount = filterType === "all" ? totalCount : typeCount;
  const totalPages = Math.ceil(activeCount / formsPerPage);

  // Pagination handlers
  const handleNextPage = () => {
    clearRestoreState();
    if (hasMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      // loadDashboardData will check cache first, fetch only if not cached
      loadDashboardData(false, null, null, nextPage);
    }
  };

  const handlePrevPage = () => {
    clearRestoreState();
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      loadDashboardData(false, null, null, prevPage);
    }
  };

  const handleViewForm = (form) => {
    _dashRestore = {
      page: currentPage,
      filter: filterType,
      forms: latestForms,
      hasMore,
      cursors,
      typeCursor,
      typeCount,
      totalCount,
      pageCache: { ...pageCacheRef.current },
    };
    if (form.type === "Incident Report") {
      navigate(`${basePath}/reports/incident/${form.id}`);
    } else if (form.type === "Cabin H&S Check") {
      navigate(`${basePath}/reports/cabin-safety-check/${form.id}`);
    } else if (form.type === "Vehicle Daily Check") {
      navigate(`${basePath}/reports/vehicle-daily-check/${form.id}`);
    }
  };

  const handleEditForm = (form) => {
    _dashRestore = {
      page: currentPage,
      filter: filterType,
      forms: latestForms,
      hasMore,
      cursors,
      typeCursor,
      typeCount,
      totalCount,
      pageCache: { ...pageCacheRef.current },
    };
    if (form.type === "Incident Report") {
      navigate(`${basePath}/forms/incident-report?edit=${form.id}`);
    } else if (form.type === "Cabin H&S Check") {
      navigate(`${basePath}/forms/cabin-safety-check?edit=${form.id}`);
    } else if (form.type === "Vehicle Daily Check") {
      navigate(`${basePath}/forms/vehicle-daily-check?edit=${form.id}`);
    }
  };

  const handleDownloadForm = async (form) => {
    try {
      let reportType;
      if (form.type === "Incident Report") {
        reportType = "incident";
      } else if (form.type === "Cabin H&S Check") {
        reportType = "cabin-safety";
      } else if (form.type === "Vehicle Daily Check") {
        reportType = "vehicle-check";
      }

      await generateReportPDF(form, reportType, null);
      toast.success(`Downloaded ${form.type} as PDF`);
    } catch (error) {
      console.error("Failed to download PDF:", error);
      toast.error("Failed to download PDF");
    }
  };

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Reports</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-brand-500"></span>
          </div>
        ) : (
          <>
            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5 z-10 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by reference ID or staff name..."
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      if (searchDebounceRef.current)
                        clearTimeout(searchDebounceRef.current);
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
                        loadDashboardData(true, null, null, null, true);
                        return;
                      }
                      searchDebounceRef.current = setTimeout(() => {
                        searchPageCacheRef.current = {};
                        runSearch(value, 1, {});
                      }, 150);
                    }}
                    className="input input-bordered w-full pl-10 bg-white border-gray-300"
                  />
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-gray-500" />
                  <select
                    value={filterType}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    className="select select-bordered bg-white border-gray-300"
                  >
                    <option value="all">All Types</option>
                    <option value="incident">Job Sheets</option>
                    <option value="cabin-safety">Cabin H&S Checks</option>
                    <option value="vehicle-check">Vehicle Daily Checks</option>
                  </select>
                </div>
              </div>
            </div>

            {/* All Forms Table - Full Width */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead className="bg-brand-500">
                    <tr>
                      <th className="text-left text-white">Type</th>
                      <th className="text-left text-white">Reference ID</th>
                      <th className="text-left text-white">Created By</th>
                      <th className="text-left text-white">Scheme</th>
                      <th className="text-left text-white">Date & Time</th>
                      <th className="text-center text-white"> Status </th>
                      <th className="text-center text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchLoading ? (
                      <tr>
                        <td colSpan="7" className="text-center py-12">
                          <span className="loading loading-spinner loading-lg text-brand-500"></span>
                        </td>
                      </tr>
                    ) : currentForms.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-12">
                          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">
                            No forms found
                          </p>
                          <p className="text-gray-400 text-sm mt-2">
                            Try adjusting your search or filter criteria
                          </p>
                        </td>
                      </tr>
                    ) : (
                      currentForms.map((form) => (
                        <tr key={form.id} className="hover:bg-gray-50">
                          <td>
                            <div className="flex items-center gap-2">
                              {getFormTypeIcon(form.type)}
                              <span
                                className={`badge ${getFormTypeBadge(form.type)} badge-sm`}
                              >
                                {form.type.toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td className="font-mono text-sm font-semibold">
                            <div>
                              {form.referenceId || form.id.slice(0, 12)}
                            </div>
                          </td>
                          <td className="text-sm">
                            <div>
                              <div className="text-gray-800">
                                {form.submittedBy?.name ||
                                  `${form.firstName || ""} ${form.lastName || ""}`.trim() ||
                                  "N/A"}
                              </div>
                              {form.lastEditedBy && (
                                <div className="text-xs text-blue-600 mt-1">
                                  Edited by:{" "}
                                  {form.lastEditedBy?.name || "Unknown"}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-sm text-gray-600 max-w-xs truncate">
                            {getFormScheme(form)}
                          </td>
                          <td className="text-sm">
                            <div className="text-gray-800 font-medium">
                              {getFormDate(form)}
                            </div>
                            <div className="text-gray-400">
                              {getFormTime(form)}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-2 font-semibold">
                              {form.type === "Incident Report" &&
                                form.status === "live" && (
                                  <div className="badge badge-error badge-soft">
                                    <Radio className="w-4 h-4 text-red-500" />
                                    Live
                                  </div>
                                )}
                              {form.type === "Incident Report" &&
                                form.status === "completed" && (
                                  <div className="badge badge-success badge-soft">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    Completed
                                  </div>
                                )}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-2">
                              {form.type === "Incident Report" &&
                              form.status === "live" ? (
                                <button
                                  onClick={() => handleEditForm(form)}
                                  className="btn btn-sm btn-ghost text-red-500 hover:text-red-800"
                                  title="Edit"
                                >
                                  <FilePlus2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleEditForm(form)}
                                  className="btn btn-sm btn-ghost text-green-600 hover:text-green-800"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleViewForm(form)}
                                className="btn btn-sm btn-ghost text-blue-600 hover:text-blue-800"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDownloadForm(form)}
                                className="btn btn-sm btn-ghost text-purple-600 hover:text-purple-800"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
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
              {!isSearchMode && (currentPage > 1 || hasMore) && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-gray-600">
                    Page {currentPage}
                    {totalPages > 1 ? ` of ${totalPages}` : ""}
                    {activeCount > 0 ? ` (${activeCount} total forms)` : ""}
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
                      disabled={!hasMore}
                      className="btn btn-sm btn-outline"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </StaffSidebarLayout>
  );
};

export default StaffReportsListPage;
