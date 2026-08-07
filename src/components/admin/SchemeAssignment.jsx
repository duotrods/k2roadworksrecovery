import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { userAdminService } from "../../services/userAdminService";
import { useAuth } from "../../hooks/useAuth";
import { SCHEMES } from "../../utils/schemes";
import {
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  User,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Users,
  MoreVertical,
} from "lucide-react";

const SchemeAssignment = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("assignments");

  // --- Client Assignments tab state ---
  const [roleFilter, setRoleFilter] = useState("client");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({ schemeId: "", schemeName: "" });
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // --- Scheme Overview tab state ---
  const [overviewUsers, setOverviewUsers] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    loadUsers(1, roleFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUsers = async (page, role = roleFilter) => {
    setLoading(true);
    try {
      const result = await userAdminService.getUsersByRolePaginated(role, page, usersPerPage);
      setUsers(result.users);
      setHasMore(result.hasMore);
      setTotalCount(result.total);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleFilterChange = (role) => {
    setRoleFilter(role);
    loadUsers(1, role);
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const clientResult = await userAdminService.getUsersByRolePaginated("client", 1, 100);
      setOverviewUsers(clientResult.users);
    } catch (error) {
      console.error("Failed to load scheme overview:", error);
      toast.error("Failed to load scheme overview");
    } finally {
      setOverviewLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "overview" && overviewUsers.length === 0) {
      loadOverview();
    }
    if (tab === "assignments") {
      handleRoleFilterChange("client");
    }
  };

  const handleAssignScheme = async (e) => {
    e.preventDefault();
    if (!formData.schemeId || !formData.schemeName) {
      toast.error("Please select a scheme");
      return;
    }
    if (!selectedUser) {
      toast.error("No user selected");
      return;
    }
    setLoading(true);
    try {
      await userAdminService.assignSchemeToUser(
        selectedUser.uid,
        formData.schemeId,
        formData.schemeName,
        userProfile.uid
      );
      toast.success(`Scheme ${formData.schemeId} assigned to ${selectedUser.displayName}`);
      setFormData({ schemeId: "", schemeName: "" });
      setShowAssignModal(false);
      setSelectedUser(null);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Failed to assign scheme:", error);
      if (error.code === "firestore/already-exists") {
        toast.error("Scheme already assigned to this user");
      } else {
        toast.error(error.message || "Failed to assign scheme");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveScheme = async (user, schemeId) => {
    if (!confirm(`Remove scheme ${schemeId} from ${user.displayName}?`)) return;
    setLoading(true);
    try {
      await userAdminService.removeSchemeFromUser(user.uid, schemeId, userProfile.uid);
      toast.success(`Scheme ${schemeId} removed from ${user.displayName}`);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Failed to remove scheme:", error);
      if (error.code === "firestore/invalid-operation") {
        toast.error("Cannot remove the only scheme from a user");
      } else {
        toast.error(error.message || "Failed to remove scheme");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSchemeSelect = (e) => {
    const selectedScheme = SCHEMES.find((s) => s.id === e.target.value);
    if (selectedScheme) {
      setFormData({ schemeId: selectedScheme.id, schemeName: selectedScheme.fullName });
    }
  };

  const openAssignModal = (user) => {
    setSelectedUser(user);
    setFormData({ schemeId: "", schemeName: "" });
    setShowAssignModal(true);
  };

  const handleArchiveUser = async (user) => {
    if (!confirm(`Archive user ${user.displayName}? They will not be able to log in.`)) return;
    setLoading(true);
    try {
      await userAdminService.archiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} archived successfully`);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Failed to archive user:", error);
      toast.error(error.message || "Failed to archive user");
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchiveUser = async (user) => {
    if (!confirm(`Unarchive user ${user.displayName}? They will be able to log in again.`)) return;
    setLoading(true);
    try {
      await userAdminService.unarchiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} unarchived successfully`);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Failed to unarchive user:", error);
      toast.error(error.message || "Failed to unarchive user");
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / usersPerPage);

  const handleNextPage = () => {
    if (hasMore) loadUsers(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) loadUsers(currentPage - 1);
  };

  // Group overview users by scheme for the Scheme Overview tab.
  const schemeOverview = SCHEMES.map((scheme) => {
    const usersInScheme = overviewUsers.filter(
      (u) =>
        (u.schemeIds && u.schemeIds.includes(scheme.id)) ||
        u.schemeId === scheme.id
    );
    const uniqueUsersInScheme = Array.from(
      new Map(usersInScheme.map((u) => [u.uid, u])).values()
    );
    return {
      scheme,
      clients: uniqueUsersInScheme.filter((u) => u.role === "client"),
    };
  }).filter((s) => s.clients.length > 0);

  return (
    <div className="max-w-8xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Scheme Assignment</h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">Manage scheme access for users</p>
        </div>
        <button
          onClick={activeTab === "assignments" ? () => loadUsers(currentPage) : loadOverview}
          disabled={loading || overviewLoading}
          className="btn gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading || overviewLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => handleTabChange("assignments")}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "assignments"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" />
          Client Assignments
        </button>
        <button
          onClick={() => handleTabChange("overview")}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          Scheme Overview
        </button>
      </div>

      {/* ── CLIENT ASSIGNMENTS TAB ── */}
      {activeTab === "assignments" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500 mb-1">Total Clients</p>
              <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500 mb-1">Multi-Scheme Users (Current Page)</p>
              <p className="text-2xl font-bold text-brand-600">
                {users.filter((u) => u.schemeIds?.length > 1).length}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500 mb-1">Assignments (Current Page)</p>
              <p className="text-2xl font-bold text-blue-600">
                {users.reduce((total, u) => total + (u.schemeIds?.length || 0), 0)}
              </p>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg shadow sm:overflow-hidden">
            {loading && users.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                  <p className="text-gray-500">Loading users...</p>
                </div>
              </div>
            ) : users.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="flex flex-col items-center justify-center">
                  <User className="w-12 h-12 text-gray-300 mb-2" />
                  <p className="text-gray-500">No users found</p>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-brand-500 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Company</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Assigned Schemes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Active Scheme</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => {
                        // Normalise: CCTV operators from signup only have schemeId (singular)
                        const effectiveSchemeIds =
                          user.schemeIds?.length > 0
                            ? user.schemeIds
                            : user.schemeId
                            ? [user.schemeId]
                            : [];
                        return (
                        <tr key={user.uid} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-800">{user.displayName}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-800">{user.company || "N/A"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              {effectiveSchemeIds.length > 0 ? (
                                effectiveSchemeIds.map((sid) => (
                                  <div
                                    key={sid}
                                    className="flex items-center gap-1 px-2 py-1 bg-brand-50 text-brand-700 rounded text-sm"
                                  >
                                    <Building2 className="w-3 h-3" />
                                    <span>{user.schemeNames?.[sid] || sid}</span>
                                    {effectiveSchemeIds.length > 1 && user.schemeIds?.includes(sid) && (
                                      <button
                                        onClick={() => handleRemoveScheme(user, sid)}
                                        disabled={loading}
                                        className="ml-1 hover:text-red-600 transition-colors"
                                        title="Remove scheme"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <span className="text-gray-400 text-sm">No schemes</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 text-sm">
                              <Building2 className="w-4 h-4 text-blue-500" />
                              <span className="font-medium text-blue-700">
                                {user.activeSchemeId || user.schemeId || "None"}
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
                              {!user.isArchived && (
                                <button
                                  onClick={() => openAssignModal(user)}
                                  disabled={loading}
                                  className="flex items-center gap-1 px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded text-sm transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  Assign
                                </button>
                              )}
                              {user.isArchived && (
                                <button
                                  onClick={() => handleUnarchiveUser(user)}
                                  disabled={loading}
                                  className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                                >
                                  <ArchiveRestore className="w-4 h-4" />
                                  Unarchive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: one card per user instead of a side-scrolling table */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {users.map((user) => {
                    const effectiveSchemeIds =
                      user.schemeIds?.length > 0
                        ? user.schemeIds
                        : user.schemeId
                        ? [user.schemeId]
                        : [];
                    return (
                      <div key={user.uid} className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-800 truncate">{user.displayName}</p>
                              {user.isArchived ? (
                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                                  <Archive className="w-3 h-3" />
                                  Archived
                                </span>
                              ) : (
                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                  <Building2 className="w-3 h-3" />
                                  Active: {user.activeSchemeId || user.schemeId || "None"}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 truncate mt-0.5">{user.email}</p>
                            {user.company && (
                              <p className="text-xs text-gray-400 mt-0.5">{user.company}</p>
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
                              className="dropdown-content menu bg-white rounded-lg border border-gray-200 shadow-lg z-20 w-48 p-2"
                            >
                              {!user.isArchived && (
                                <li>
                                  <button
                                    onClick={() => {
                                      document.activeElement?.blur();
                                      openAssignModal(user);
                                    }}
                                    disabled={loading}
                                    className="text-brand-600"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Assign Scheme
                                  </button>
                                </li>
                              )}
                              {user.isArchived ? (
                                <li>
                                  <button
                                    onClick={() => {
                                      document.activeElement?.blur();
                                      handleUnarchiveUser(user);
                                    }}
                                    disabled={loading}
                                    className="text-blue-600"
                                  >
                                    <ArchiveRestore className="w-4 h-4" />
                                    Unarchive
                                  </button>
                                </li>
                              ) : (
                                <li>
                                  <button
                                    onClick={() => {
                                      document.activeElement?.blur();
                                      handleArchiveUser(user);
                                    }}
                                    disabled={loading}
                                    className="text-gray-700"
                                  >
                                    <Archive className="w-4 h-4" />
                                    Archive
                                  </button>
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Assigned Schemes</p>
                          <div className="flex flex-wrap gap-2">
                            {effectiveSchemeIds.length > 0 ? (
                              effectiveSchemeIds.map((sid) => (
                                <div
                                  key={sid}
                                  className="flex items-center gap-1 px-2 py-1 bg-brand-50 text-brand-700 rounded text-sm"
                                >
                                  <Building2 className="w-3 h-3" />
                                  <span>{user.schemeNames?.[sid] || sid}</span>
                                  {effectiveSchemeIds.length > 1 && user.schemeIds?.includes(sid) && (
                                    <button
                                      onClick={() => handleRemoveScheme(user, sid)}
                                      disabled={loading}
                                      className="ml-1 hover:text-red-600 transition-colors"
                                      title="Remove scheme"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400 text-sm">No schemes</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-gray-600">
                  Showing page {currentPage} of {totalPages} ({totalCount} total clients)
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
        </>
      )}

      {/* ── SCHEME OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div>
          {overviewLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
              <p className="text-gray-500">Loading scheme overview...</p>
            </div>
          ) : schemeOverview.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Building2 className="w-12 h-12 text-gray-300 mb-2" />
              <p className="text-gray-500">No users assigned to any scheme yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {schemeOverview.map(({ scheme, clients }) => (
                <div key={scheme.id} className="bg-white rounded-lg shadow overflow-hidden">
                  {/* Scheme Header */}
                  <div className="bg-brand-600 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-brand-200" />
                      <div>
                        <p className="font-bold text-white text-lg leading-tight">{scheme.id}</p>
                        <p className="text-brand-100 text-sm">{scheme.shortName} · {scheme.contractor}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-brand-100">
                      <span>{clients.length} client{clients.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Clients */}
                  <div className="divide-y divide-gray-100">
                    <div className="px-5 py-3">
                      <p className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        <User className="w-3 h-3" />
                        Clients
                      </p>
                      <div className="space-y-1.5">
                        {clients.map((u) => (
                          <div key={u.uid} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{u.displayName}</p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {u.isArchived && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Archived</span>
                              )}
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-100 text-brand-700">
                                {u.company || "Client"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assign Scheme Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              Assign Scheme to {selectedUser?.displayName}
            </h3>
            <form onSubmit={handleAssignScheme}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Scheme
                </label>
                <select
                  value={formData.schemeId}
                  onChange={handleSchemeSelect}
                  className="select select-bordered w-full bg-white border-gray-300"
                  required
                >
                  <option value="">Choose a scheme...</option>
                  {SCHEMES.map((scheme) => (
                    <option
                      key={scheme.id}
                      value={scheme.id}
                      disabled={selectedUser?.schemeIds?.includes(scheme.id)}
                    >
                      {scheme.fullName}{selectedUser?.schemeIds?.includes(scheme.id) ? " (Already assigned)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowAssignModal(false); setSelectedUser(null); }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Assign Scheme
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemeAssignment;
