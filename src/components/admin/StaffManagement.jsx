import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { userAdminService } from "../../services/userAdminService";
import { useAuth } from "../../hooks/useAuth";
import { Users, RefreshCw, User, Archive, ArchiveRestore, Mail, Shield, ChevronLeft, ChevronRight } from "lucide-react";

const StaffManagement = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all"); // all, active, archived
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  useEffect(() => {
    loadUsers(1);
  }, []);

  const loadUsers = async (page) => {
    setLoading(true);
    try {
      const result = await userAdminService.getUsersByRolePaginated('staff', page, usersPerPage);
      setUsers(result.users);
      setHasMore(result.hasMore);
      setTotalCount(result.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error("Failed to load staff users");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveUser = async (user) => {
    if (!confirm(`Archive user ${user.displayName}? They will not be able to log in.`)) {
      return;
    }

    setLoading(true);
    try {
      await userAdminService.archiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} archived successfully`);
      loadUsers(currentPage);
    } catch (error) {
      console.error('Failed to archive user:', error);
      toast.error(error.message || "Failed to archive user");
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchiveUser = async (user) => {
    if (!confirm(`Unarchive user ${user.displayName}? They will be able to log in again.`)) {
      return;
    }

    setLoading(true);
    try {
      await userAdminService.unarchiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} unarchived successfully`);
      loadUsers(currentPage);
    } catch (error) {
      console.error('Failed to unarchive user:', error);
      toast.error(error.message || "Failed to unarchive user");
    } finally {
      setLoading(false);
    }
  };

  // Filter users based on status (client-side filtering on current page)
  const filteredUsers = users.filter(user => {
    if (filterStatus === "active") return !user.isArchived;
    if (filterStatus === "archived") return user.isArchived;
    return true; // all
  });

  const stats = {
    total: totalCount, // Server-side total count
    active: users.filter(u => !u.isArchived).length,
    archived: users.filter(u => u.isArchived).length,
  };

  // Pagination handlers
  const totalPages = Math.ceil(totalCount / usersPerPage);

  const handleNextPage = () => {
    if (hasMore) loadUsers(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) loadUsers(currentPage - 1);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">
            Staff Management
          </h3>
          <p className="text-gray-600 mt-1">
            Manage staff user accounts and access
          </p>
        </div>
        <button
          onClick={() => loadUsers(currentPage)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Total Staff</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Active (Current Page)</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Archived (Current Page)</p>
          <p className="text-2xl font-bold text-gray-600">{stats.archived}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === "all"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setFilterStatus("active")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === "active"
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setFilterStatus("archived")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === "archived"
                  ? "bg-gray-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Archived ({stats.archived})
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                      <p className="text-gray-500">Loading staff users...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <User className="w-12 h-12 text-gray-300 mb-2" />
                      <p className="text-gray-500">
                        {filterStatus === "archived"
                          ? "No archived staff users"
                          : filterStatus === "active"
                          ? "No active staff users"
                          : "No staff users found"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.uid} className={`hover:bg-gray-50 ${user.isArchived ? 'bg-gray-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {user.displayName}
                          </p>
                          {user.isArchived && (
                            <p className="text-xs text-gray-500">
                              Archived {user.archivedAt ? new Date(user.archivedAt.seconds ? user.archivedAt.seconds * 1000 : user.archivedAt).toLocaleDateString() : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-700 capitalize">
                          {user.role}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.isArchived ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {user.isArchived ? (
                          <button
                            onClick={() => handleUnarchiveUser(user)}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors disabled:opacity-50"
                            title="Unarchive user"
                          >
                            <ArchiveRestore className="w-4 h-4" />
                            Unarchive
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchiveUser(user)}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm transition-colors disabled:opacity-50"
                            title="Archive user"
                          >
                            <Archive className="w-4 h-4" />
                            Archive
                          </button>
                        )}
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
              Showing page {currentPage} of {totalPages} ({totalCount} total staff)
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
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={!hasMore || currentPage === totalPages}
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

export default StaffManagement;
