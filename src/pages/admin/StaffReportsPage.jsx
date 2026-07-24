import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { staffService } from "../../services/staffService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { SCHEMES, DEMO_SCHEME_ID } from "../../utils/schemes";
import {
  FileText,
  Camera,
  AlertTriangle,
  Eye,
  Download,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ShieldCheck,
  Car,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { generateReportPDF } from "../../utils/pdfGenerator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { countDefectsByItem } from "../../utils/vehicleCheckStats";

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
  const [formCounts, setFormCounts] = useState({ cctvCheckTotal: 0, incidentReportTotal: 0, assetDamageTotal: 0, cabinSafetyTotal: 0, vehicleCheckTotal: 0 });
  const [vehicleCheckDefects, setVehicleCheckDefects] = useState([]);
  const reportsPerPage = 10;

  // Maps admin display filter values → staffService type keys
  const adminTypeToServiceType = {
    'CCTV Check':      'cctv-check',
    'Incident Report': 'incident',
    'Asset Damage':    'asset-damage',
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
    loadFormCounts();
  }, []);

  useEffect(() => {
    // Independent of the paginated `reports` list (which only ever holds one
    // page of 10) — the chart needs every vehicle check, not just the
    // current page, so it doesn't shrink/flicker as the admin paginates.
    staffService.getVehicleDailyChecks(null).then((allChecks) => {
      setVehicleCheckDefects(countDefectsByItem(allChecks));
    });
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const clearRestoreState = () => { _staffReportsRestore = null; };

  const typeToCollectionKey = {
    'Incident Report': ['incident'],
    'Asset Damage':    ['assetDamage'],
    'CCTV Check':      ['cctv'],
    'Cabin H&S Check': ['cabinSafety'],
    'Vehicle Daily Check': ['vehicleCheck'],
  };

  const mapSearchResults = (results) => {
    const typeMap = {
      'Incident Report':  { type: 'Incident Report', icon: FileText,      color: 'bg-teal-100 text-teal-600'    },
      'Asset Damage':     { type: 'Asset Damage',    icon: AlertTriangle, color: 'bg-orange-100 text-orange-600' },
      'CCTV Check Sheet': { type: 'CCTV Check',      icon: Camera,        color: 'bg-purple-100 text-purple-600' },
      'Cabin H&S Check':  { type: 'Cabin H&S Check', icon: ShieldCheck,   color: 'bg-green-100 text-green-600'  },
      'Vehicle Daily Check': { type: 'Vehicle Daily Check', icon: Car,    color: 'bg-amber-100 text-amber-600'  },
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
      const schemeId = activeScheme !== 'all' ? activeScheme : null;
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

        if (f.type === 'CCTV Check Sheet') {
          type = "CCTV Check";
          icon = Camera;
          color = "bg-purple-100 text-purple-600";
        } else if (f.type === 'Incident Report') {
          type = "Incident Report";
          icon = FileText;
          color = "bg-teal-100 text-teal-600";
        } else if (f.type === 'Asset Damage') {
          type = "Asset Damage";
          icon = AlertTriangle;
          color = "bg-orange-100 text-orange-600";
        } else if (f.type === 'Cabin H&S Check') {
          type = "Cabin H&S Check";
          icon = ShieldCheck;
          color = "bg-green-100 text-green-600";
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

  const loadFormCounts = async () => {
    try {
      const counts = await staffService.getAllFormsCountByType();
      setFormCounts(counts);
    } catch (error) {
      console.warn('Could not load form counts:', error);
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
    if (report.type === "CCTV Check") {
      navigate(`/dashboard/admin/staff-reports/cctv/${report.id}`);
    } else if (report.type === "Incident Report") {
      navigate(`/dashboard/admin/staff-reports/incident/${report.id}`);
    } else if (report.type === "Asset Damage") {
      navigate(`/dashboard/admin/staff-reports/asset/${report.id}`);
    } else if (report.type === "Cabin H&S Check") {
      navigate(`/dashboard/admin/staff-reports/cabin-safety/${report.id}`);
    } else if (report.type === "Vehicle Daily Check") {
      navigate(`/dashboard/admin/staff-reports/vehicle-check/${report.id}`);
    }
  };

  const handleDownloadPDF = async (report) => {
    try {
      // Map display type to PDF generator type
      const typeMap = {
        "CCTV Check": "cctv-check",
        "Incident Report": "incident",
        "Asset Damage": "asset-damage",
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
      case "Incident Report":
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case "CCTV Check":
        return <Eye className="w-5 h-5 text-green-500" />;
      case "Asset Damage":
        return <FileText className="w-5 h-5 text-red-500" />;
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
      "Asset Damage": "badge-error",
      "CCTV Check": "badge-success",
      "Cabin H&S Check": "badge-success",
      "Vehicle Daily Check": "badge-warning",
    };
    return badges[type] || "badge-ghost";
  };

  // Get scheme(s) from form - handles different form structures
  const getFormScheme = (report) => {
    // For CCTV Check - covers all schemes
    if (report.type === "CCTV Check") {
      return "All Schemes";
    }
    // For Incident Report and Asset Damage - single scheme field
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
    // For Incident Reports - always use timeSpotted
    if (report.type === "Incident Report" && report.timeSpotted) {
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
        "CCTV Check": "cctvCheckForms",
        "Incident Report": "incidentReports",
        "Asset Damage": "assetDamageReports",
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

  // Statistics - all counts from aggregation queries (no per-page counting)
  const stats = {
    total: totalCount,
    cctvCheck: formCounts.cctvCheckTotal,
    incident: formCounts.incidentReportTotal,
    assetDamage: formCounts.assetDamageTotal,
    cabinSafety: formCounts.cabinSafetyTotal,
    vehicleCheck: formCounts.vehicleCheckTotal,
  };

  return (
    <AdminSidebarLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Staff Reports</h1>
          <p className="text-gray-600">View and manage all submitted forms from staff members</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Reports</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{stats.total}</p>
              </div>
              <div className="bg-gray-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">CCTV Checks</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{stats.cctvCheck}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <Camera className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Incidents</p>
                <p className="text-3xl font-bold text-teal-600 mt-1">{stats.incident}</p>
              </div>
              <div className="bg-teal-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-teal-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Asset Damage</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{stats.assetDamage}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Cabin H&S Checks</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.cabinSafety}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <ShieldCheck className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Vehicle Checks</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats.vehicleCheck}</p>
              </div>
              <div className="bg-amber-100 p-3 rounded-lg">
                <Car className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Check Defect Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h5 className="text-lg font-semibold text-gray-800 mb-4">
            Defect Frequency by Check Item
          </h5>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vehicleCheckDefects}>
              <CartesianGrid strokeDasharray="3 3" stroke="#17af93" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 13 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #17af93", borderRadius: "8px" }}
                labelStyle={{ fontWeight: "bold" }}
              />
              <Bar dataKey="count" name="Defects" fill="#17af93" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
              <option value="CCTV Check">CCTV Check</option>
              <option value="Incident Report">Incident Report</option>
              <option value="Asset Damage">Asset Damage</option>
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
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {loading || searchLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="loading loading-spinner loading-lg text-teal-500"></div>
            </div>
          ) : currentReports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No reports found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead className="bg-teal-500">
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
                            {getFormTypeIcon(report.type)}
                            <span className={`badge ${getFormTypeBadge(report.type)} badge-sm`}>
                              {(report.type || '').toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono text-sm font-semibold">
                          <div>{report.referenceId || report.id.slice(0, 12)}</div>
                          {report.type === "Incident Report" && report.incursion === "YES" && (
                            <span className="badge badge-error badge-xs mt-1">Incursion</span>
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
