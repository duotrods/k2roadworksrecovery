import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { firestoreService } from "../../services/firestoreService";
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
  CameraOff,
  LayoutGrid,
  Users,
} from "lucide-react";

// Filter keys used by this page. "client" queries role == 'client' directly;
// "cctv-managers" queries clients with canManageCCTVFaults == true (the
// migrated cohort of the removed 'cctvfaultoperator' role).
const ROLE_CONFIG = {
  client: { label: "Client", color: "teal", icon: User },
  "cctv-managers": { label: "CCTV Fault Manager", color: "pink", icon: CameraOff },
};

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
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // --- Scheme Overview tab state ---
  const [overviewUsers, setOverviewUsers] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    loadUsers(true, roleFilter);
    loadTotalCount(roleFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUsers = async (resetPage = false, role = roleFilter) => {
    setLoading(true);
    try {
      const result =
        role === "cctv-managers"
          ? await firestoreService.getCCTVFaultManagersPaginated(
              usersPerPage,
              resetPage ? null : lastDoc
            )
          : await firestoreService.getAllUsersPaginated(
              usersPerPage,
              resetPage ? null : lastDoc,
              role
            );
      setUsers(result.users);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      if (resetPage) setCurrentPage(1);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadTotalCount = async (role = roleFilter) => {
    try {
      const counts = await firestoreService.getUsersCountByRole();
      setTotalCount(
        role === "cctv-managers" ? counts.cctvManagers : counts[role] ?? 0
      );
    } catch (error) {
      console.warn("Could not load total count:", error);
    }
  };

  const handleRoleFilterChange = (role) => {
    setRoleFilter(role);
    setLastDoc(null);
    loadUsers(true, role);
    loadTotalCount(role);
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const [clientResult, cctvManagersResult] = await Promise.all([
        firestoreService.getAllUsersPaginated(100, null, "client"),
        firestoreService.getCCTVFaultManagersPaginated(100, null),
      ]);
      setOverviewUsers([...clientResult.users, ...cctvManagersResult.users]);
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
    if (tab === "cctv") {
      handleRoleFilterChange("cctv-managers");
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
      await firestoreService.assignSchemeToUser(
        selectedUser.uid,
        formData.schemeId,
        formData.schemeName,
        userProfile.uid
      );
      toast.success(`Scheme ${formData.schemeId} assigned to ${selectedUser.displayName}`);
      setFormData({ schemeId: "", schemeName: "" });
      setShowAssignModal(false);
      setSelectedUser(null);
      loadUsers(true);
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
      await firestoreService.removeSchemeFromUser(user.uid, schemeId, userProfile.uid);
      toast.success(`Scheme ${schemeId} removed from ${user.displayName}`);
      loadUsers(true);
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
      await firestoreService.archiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} archived successfully`);
      loadUsers(true);
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
      await firestoreService.unarchiveUser(user.uid, userProfile.uid);
      toast.success(`User ${user.displayName} unarchived successfully`);
      loadUsers(true);
    } catch (error) {
      console.error("Failed to unarchive user:", error);
      toast.error(error.message || "Failed to unarchive user");
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / usersPerPage);

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage((prev) => prev + 1);
      loadUsers(false);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
      loadUsers(true);
    }
  };

  // Group overview users by scheme for the Scheme Overview tab.
  // De-dupe by uid: a canManageCCTVFaults client appears in both the plain
  // "client" query and the "cctv-managers" query that feed overviewUsers.
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
      clients: uniqueUsersInScheme.filter(
        (u) => u.role === "client" && !u.canManageCCTVFaults
      ),
      cctvManagers: uniqueUsersInScheme.filter(
        (u) => u.role === "client" && u.canManageCCTVFaults
      ),
    };
  }).filter((s) => s.clients.length + s.cctvManagers.length > 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">Scheme Assignment</h3>
          <p className="text-gray-600 mt-1">Manage scheme access for users</p>
        </div>
        <button
          onClick={activeTab === "assignments" ? () => loadUsers(true) : loadOverview}
          disabled={loading || overviewLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" />
          Client Assignments
        </button>
        <button
          onClick={() => handleTabChange("cctv")}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "cctv"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <CameraOff className="w-4 h-4" />
          CCTV Fault Manager Assignments
        </button>
        <button
          onClick={() => handleTabChange("overview")}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          Scheme Overview
        </button>
      </div>

      {/* ── CLIENT ASSIGNMENTS TAB ── */}
      {(activeTab === "assignments" || activeTab === "cctv") && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500 mb-1">
                {roleFilter === "cctv-managers" ? "Total CCTV Fault Managers" : "Total Clients"}
              </p>
              <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500 mb-1">Multi-Scheme Users (Current Page)</p>
              <p className="text-2xl font-bold text-teal-600">
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Schemes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Scheme</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                          <p className="text-gray-500">Loading users...</p>
                        </div>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <User className="w-12 h-12 text-gray-300 mb-2" />
                          <p className="text-gray-500">No users found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
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
                                  className="flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded text-sm"
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
                                className="flex items-center gap-1 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded text-sm transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                Assign
                              </button>
                            )}
                            {user.isArchived ? (
                              <button
                                onClick={() => handleUnarchiveUser(user)}
                                disabled={loading}
                                className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                                Unarchive
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchiveUser(user)}
                                disabled={loading}
                                className="flex items-center gap-1 px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                              >
                                <Archive className="w-4 h-4" />
                                Archive
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-gray-600">
                  Showing page {currentPage} of {totalPages} ({totalCount} total {
                    roleFilter === "cctv-managers" ? "CCTV fault managers" : "clients"
                  })
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
              {schemeOverview.map(({ scheme, clients, cctvManagers }) => (
                <div key={scheme.id} className="bg-white rounded-lg shadow overflow-hidden">
                  {/* Scheme Header */}
                  <div className="bg-teal-600 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-teal-200" />
                      <div>
                        <p className="font-bold text-white text-lg leading-tight">{scheme.id}</p>
                        <p className="text-teal-100 text-sm">{scheme.shortName} · {scheme.contractor}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-teal-100">
                      <span>{clients.length} client{clients.length !== 1 ? "s" : ""}</span>
                      <span>{cctvManagers.length} CCTV fault manager{cctvManagers.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Users by role */}
                  <div className="divide-y divide-gray-100">
                    {[
                      { role: "client", users: clients, label: "Clients", Icon: User, badgeClass: "bg-teal-100 text-teal-700" },
                      { role: "cctv-managers", users: cctvManagers, label: "CCTV Fault Managers", Icon: CameraOff, badgeClass: "bg-pink-100 text-pink-700" },
                    ].map(({ role, users: roleUsers, label, Icon, badgeClass }) => (
                      roleUsers.length > 0 && (
                        <div key={role} className="px-5 py-3">
                          <p className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            <Icon className="w-3 h-3" />
                            {label}
                          </p>
                          <div className="space-y-1.5">
                            {roleUsers.map((u) => (
                              <div key={u.uid} className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{u.displayName}</p>
                                  <p className="text-xs text-gray-500">{u.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {u.isArchived && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Archived</span>
                                  )}
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
                                    {u.company || ROLE_CONFIG[role]?.label || role}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
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
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors flex items-center gap-2"
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
