import { useState, useEffect } from "react";
import { userAdminService } from "../../services/userAdminService";
import { RefreshCw, LogIn, ChevronLeft, ChevronRight, Shield, Clock } from "lucide-react";

const ROLE_BADGE = {
  admin:  "bg-purple-100 text-purple-700",
  staff:  "bg-blue-100 text-blue-700",
  client: "bg-teal-100 text-teal-700",
};

const formatDateTime = (ts) => {
  if (!ts) return "—";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

const LOGS_PER_PAGE = 10;

const LoginLogs = () => {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore]     = useState(true);

  const totalPages = Math.ceil(totalCount / LOGS_PER_PAGE);

  useEffect(() => {
    loadPage(1);
    loadCount();
  }, []);

  const loadCount = async () => {
    try {
      const count = await userAdminService.getLoginLogsCount();
      setTotalCount(count);
    } catch (err) {
      console.warn("Could not load login log count:", err);
    }
  };

  const loadPage = async (page) => {
    setLoading(true);
    try {
      const result = await userAdminService.getLoginLogsPaginated(page, LOGS_PER_PAGE);
      setLogs(result.logs);
      setHasMore(result.hasMore);
      setCurrentPage(page);
    } catch (err) {
      console.error("Failed to load login logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (hasMore && currentPage < totalPages) {
      loadPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      loadPage(currentPage - 1);
    }
  };

  const handleRefresh = () => {
    loadPage(1);
    loadCount();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">Login Audit Logs</h3>
          <p className="text-gray-600 mt-1">
            Who signed in and when — auto-deleted after 15 days
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Count card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Total Log Entries</p>
          <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 col-span-2">
          <p className="text-sm text-gray-500 mb-1">Retention Policy</p>
          <p className="text-sm text-gray-700 mt-1">
            Logs are automatically deleted after <span className="font-semibold">15 days</span> via a scheduled cleanup job on the <code className="bg-gray-100 px-1 rounded">expire_at</code> column.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Logged In At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Loading logs…</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <LogIn className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No login records yet</p>
                    <p className="text-gray-400 text-sm mt-1">Entries appear here after users sign in</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                          <LogIn className="w-4 h-4 text-teal-600" />
                        </div>
                        <span className="font-medium text-gray-800">{log.displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{log.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[log.role] || "bg-gray-100 text-gray-700"}`}>
                        <Shield className="w-3 h-3" />
                        {log.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatDateTime(log.loginAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(log.expireAt)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} ({totalCount} total entries)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1 || loading}
                className="btn btn-sm btn-outline"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={!hasMore || currentPage === totalPages || loading}
                className="btn btn-sm btn-outline"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginLogs;
