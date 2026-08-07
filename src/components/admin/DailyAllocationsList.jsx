import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  CalendarDays,
  Filter,
} from "lucide-react";
import { staffService } from "../../services/staffService";
import { SCHEMES } from "../../utils/schemes";

const REAL_SCHEMES = SCHEMES.filter((s) => !s.isDemo);
const PAGE_SIZE = 10;

const DailyAllocationsList = () => {
  const navigate = useNavigate();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schemeFilter, setSchemeFilter] = useState("all");
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // cursorStack[i] is the "start after" cursor for page i+1 (cursorStack[0] is always null)
  const [cursorStack, setCursorStack] = useState([null]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadPage(1, [null]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeFilter]);

  const loadPage = async (page, stack) => {
    setLoading(true);
    try {
      const cursor = stack[page - 1] ?? null;
      const schemeIds = schemeFilter === "all" ? null : [schemeFilter];
      const result = await staffService.fetchPaginatedFormsAny(
        "dailyAllocations",
        PAGE_SIZE,
        cursor,
        schemeIds,
      );
      setAllocations(result.docs);
      setHasMore(result.hasMore);
      setCurrentPage(page);
      if (result.lastDoc && stack.length === page) {
        setCursorStack([...stack, result.lastDoc]);
      } else {
        setCursorStack(stack);
      }
    } catch (error) {
      console.error("Failed to load daily allocations:", error);
      toast.error("Failed to load daily allocations");
    } finally {
      setLoading(false);
    }
  };

  const handleSchemeFilterChange = (e) => setSchemeFilter(e.target.value);

  const handleNextPage = () => {
    if (hasMore) loadPage(currentPage + 1, cursorStack);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) loadPage(currentPage - 1, cursorStack);
  };

  const handleRefresh = () => loadPage(1, [null]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await staffService.deleteDailyAllocation(deleteTarget.id);
      toast.success("Daily allocation deleted");
      setAllocations((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete daily allocation:", error);
      toast.error("Failed to delete daily allocation");
    }
  };

  return (
    <div className="max-w-8xl mx-auto">
      <div className="mb-6">
        <div>
          <h1 className="font-semibold text-gray-800 mb-2">
            Daily Allocations
          </h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">
            Weekly roster of operator allocations by scheme
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-auto max-w-md">
            <Filter className="w-5 h-5 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <select
            value={schemeFilter}
            onChange={handleSchemeFilterChange}
            className="select text-gray-600 pl-10 bg-white border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="all">All Schemes</option>
            {REAL_SCHEMES.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.fullName}
              </option>
            ))}
          </select>
          </div>
          
          <div className="flex justify-between w-full sm:w-auto gap-4">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-300 rounded-lg transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={() => navigate("/dashboard/admin/daily-allocations/new")}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Allocation
            </button>
          </div>
        </div>

      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && allocations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
              <p className="text-gray-500">Loading allocations...</p>
            </div>
          </div>
        ) : allocations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="flex flex-col items-center justify-center">
              <CalendarDays className="w-12 h-12 text-gray-300 mb-2" />
              <p className="text-gray-500">No daily allocations found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-brand-500 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Scheme
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Week Ending
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Rows
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Submitted By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allocations.map((allocation) => (
                    <tr
                      key={allocation.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        navigate(
                          `/dashboard/admin/daily-allocations/${allocation.id}`,
                        )
                      }
                    >
                      <td className="px-6 py-4">
                        <code className="text-sm font-mono font-semibold px-2 py-1 rounded">
                          {allocation.referenceId}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-gray-800">
                        {allocation.schemeName || allocation.schemeId}
                      </td>
                      <td className="px-6 py-4 text-gray-800">
                        {allocation.weekEnding}
                      </td>
                      <td className="px-6 py-4 text-gray-800">
                        {allocation.rows?.length || 0}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {allocation.submittedBy?.name || "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="flex items-center gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              navigate(
                                `/dashboard/admin/daily-allocations/${allocation.id}`,
                              )
                            }
                            className="text-brand-600 hover:text-brand-700"
                            title="View / Edit"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(allocation)}
                            className="text-red-500 hover:text-red-700"
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

            {/* Mobile: compact cards instead of a side-scrolling table */}
            <div className="sm:hidden divide-y divide-gray-100">
              {allocations.map((allocation) => (
                <div
                  key={allocation.id}
                  className="p-4 active:bg-gray-50 cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/dashboard/admin/daily-allocations/${allocation.id}`,
                    )
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-xs font-mono text-white bg-brand-600 px-2 py-1 rounded">
                      {allocation.referenceId}
                    </code>
                    <div
                      className="flex items-center gap-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          navigate(
                            `/dashboard/admin/daily-allocations/${allocation.id}`,
                          )
                        }
                        className="text-brand-600"
                        title="View / Edit"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(allocation)}
                        className="text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="font-semibold text-brand-500">
                    {allocation.schemeName || allocation.schemeId}
                  </p>
                  <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                    <span>Week ending {allocation.weekEnding}</span>
                    <span>{allocation.rows?.length || 0} rows</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {allocation.submittedBy?.name || "N/A"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {(currentPage > 1 || hasMore) && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-600">Page {currentPage}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="btn btn-sm btn-outline"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
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

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Delete Daily Allocation?
            </h3>
            <p className="text-gray-600 mb-6">
              This will permanently delete allocation{" "}
              {deleteTarget.referenceId} for{" "}
              {deleteTarget.schemeName || deleteTarget.schemeId}, week ending{" "}
              {deleteTarget.weekEnding}. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyAllocationsList;
