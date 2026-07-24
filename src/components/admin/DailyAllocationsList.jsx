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
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-800">
              Daily Allocations
            </h3>
            <p className="text-gray-600 mt-1">
              Weekly roster of operator allocations by scheme
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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

        <div className="mb-4">
          <select
            value={schemeFilter}
            onChange={handleSchemeFilterChange}
            className="select select-bordered bg-white border-gray-300 rounded-lg hover:bg-gray-100"
          >
            <option value="all">All Schemes</option>
            {REAL_SCHEMES.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scheme
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Week Ending
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && allocations.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                        <p className="text-gray-500">Loading allocations...</p>
                      </div>
                    </td>
                  </tr>
                ) : allocations.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <CalendarDays className="w-12 h-12 text-gray-300 mb-2" />
                        <p className="text-gray-500">
                          No daily allocations found
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  allocations.map((allocation) => (
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
                        <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
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
                  ))
                )}
              </tbody>
            </table>
          </div>

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
