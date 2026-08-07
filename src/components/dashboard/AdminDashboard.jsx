import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { userAdminService } from '../../services/userAdminService';
import { useAuth } from '../../hooks/useAuth';
import { Key, Users, UserCog, Trash2, Archive, ArchiveRestore, Filter, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
import LoginLogs from '../admin/LoginLogs';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserShield, faUserGear, faUser, faCircleCheck, faClock } from '@fortawesome/free-solid-svg-icons';

const ROLE_FILTERS = [
  { key: 'all', label: 'All roles' },
  { key: 'admin', label: 'Admin' },
  { key: 'staff', label: 'Staff' },
  { key: 'client', label: 'Client' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All statuses' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
];

const ROLE_BADGE = {
  admin:  "bg-purple-100 text-purple-700",
  staff:  "bg-blue-100 text-blue-700",
  client: "bg-teal-100 text-teal-700",
};

const ROLE_ICON = {
  admin:  faUserShield,
  staff:  faUserGear,
  client: faUser,
};

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [promoteModal, setPromoteModal] = useState({ isOpen: false, user: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [roleCounts, setRoleCounts] = useState({ total: 0, staff: 0, client: 0 });
  const usersPerPage = 10;
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, roleFilter, statusFilter]);

  useEffect(() => {
    loadRoleCounts();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { users: paginatedUsers, total, hasMore: more } =
        roleFilter === 'all'
          ? await userAdminService.getUsersPaginated(currentPage, usersPerPage, statusFilter)
          : await userAdminService.getUsersByRolePaginated(roleFilter, currentPage, usersPerPage, statusFilter);

      setUsers(paginatedUsers);
      setTotalUsers(total);
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRoleCounts = async () => {
    try {
      const counts = await userAdminService.getUsersCountByRole();
      setRoleCounts(counts);
    } catch (error) {
      console.warn('Could not load role counts:', error);
    }
  };

  const handleRoleFilterChange = (role) => {
    setCurrentPage(1);
    setRoleFilter(role);
  };

  const handleStatusFilterChange = (status) => {
    setCurrentPage(1);
    setStatusFilter(status);
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!promoteModal.user) return;

    try {
      setActionLoading(true);
      await userAdminService.promoteToAdmin(promoteModal.user.uid, userProfile.uid);
      toast.success(`${promoteModal.user.displayName} has been promoted to admin`);
      setPromoteModal({ isOpen: false, user: null });
      await loadUsers(); // Reload users to reflect changes
    } catch (error) {
      console.error('Failed to promote user:', error);
      toast.error(error.message || 'Failed to promote user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModal.user) return;

    try {
      setActionLoading(true);
      await userAdminService.deleteUserAccount(deleteModal.user.uid);
      toast.success(`${deleteModal.user.displayName} has been deleted from the system`);
      setDeleteModal({ isOpen: false, user: null });
      await loadUsers(); // Reload users to reflect changes
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(error.message || 'Failed to delete user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveUser = async (user) => {
    if (!confirm(`Archive ${user.displayName}? They will not be able to log in.`)) {
      return;
    }

    try {
      setActionLoading(true);
      await userAdminService.archiveUser(user.uid, userProfile.uid);
      toast.success(`${user.displayName} has been archived`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to archive user:', error);
      toast.error(error.message || 'Failed to archive user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnarchiveUser = async (user) => {
    if (!confirm(`Unarchive ${user.displayName}? They will be able to log in again.`)) {
      return;
    }

    try {
      setActionLoading(true);
      await userAdminService.unarchiveUser(user.uid, userProfile.uid);
      toast.success(`${user.displayName} has been unarchived`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to unarchive user:', error);
      toast.error(error.message || 'Failed to unarchive user');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  const roleBadgeClass = (role) =>
    role === 'admin' ? 'badge-error' : role === 'staff' ? 'badge-warning' : 'badge-info';

  const renderStatus = (user) =>
    user.isArchived ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
        <Archive className="w-3 h-3" />
        <span className="hidden sm:inline">Archived</span>
      </span>
    ) : user.emailVerified ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-500 rounded-full text-xs font-medium">
        <FontAwesomeIcon icon={faCircleCheck} className="w-3 h-3" />
        <span className="hidden sm:inline">Verified</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
        <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
        <span className="hidden sm:inline">Pending</span>
      </span>
    );

  const renderUserActions = (user) => {
    if (user.role === 'admin' || user.uid === userProfile?.uid) {
      return <span className="text-xs text-gray-400">-</span>;
    }
    return (
      <>
        {user.isArchived ? (
          <button
            onClick={() => handleUnarchiveUser(user)}
            disabled={actionLoading}
            className="btn btn-sm btn-ghost text-blue-600 hover:text-blue-800 disabled:opacity-50"
            title="Unarchive user"
          >
            <ArchiveRestore className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => handleArchiveUser(user)}
            disabled={actionLoading}
            className="btn btn-sm btn-ghost text-gray-600 hover:text-gray-800 disabled:opacity-50"
            title="Archive user"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setDeleteModal({ isOpen: true, user })}
          className="btn btn-sm btn-ghost text-red-600 hover:text-red-800"
          title="Delete user"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </>
    );
  };

  const renderMobileActionsMenu = (user) => {
    if (user.role === 'admin' || user.uid === userProfile?.uid) {
      return null;
    }
    return (
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
          {user.isArchived ? (
            <li>
              <button
                onClick={() => {
                  document.activeElement?.blur();
                  handleUnarchiveUser(user);
                }}
                disabled={actionLoading}
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
                disabled={actionLoading}
                className="text-gray-700"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            </li>
          )}
          <li>
            <button
              onClick={() => {
                document.activeElement?.blur();
                setDeleteModal({ isOpen: true, user });
              }}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </li>
        </ul>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">Welcome back, {userProfile?.displayName}!</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate('/dashboard/admin/otp-management')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
          >
            <Key className="w-4 h-4" />
            Manage Access Codes
          </button>
          <button
            onClick={() => navigate('/dashboard/admin/scheme-assignment')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <Users className="w-4 h-4" />
            Assign Schemes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6">
          <h6 className="text-gray-600 mb-2">Total Users</h6>
          <p className="text-3xl font-bold text-brand-500">{roleCounts.total}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h6 className="text-gray-600 mb-2">Staff Members</h6>
          <p className="text-3xl font-bold text-brand-500">{roleCounts.staff}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h6 className="text-gray-600 mb-2">Clients</h6>
          <p className="text-3xl font-bold text-brand-500">{roleCounts.client}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow overflow-hidden">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3>User Management</h3>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto sm:min-w-44">
              <Filter className="w-5 h-5 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                className="select text-gray-600 pl-10 bg-white border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              >
                {ROLE_FILTERS.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="relative w-full sm:w-auto sm:min-w-44">
              <Archive className="w-5 h-5 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="select text-gray-600 pl-10 bg-white border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              >
                {STATUS_FILTERS.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-14 text-center">
            <span className="loading loading-spinner text-brand-500"></span>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found for this filter</p>
          </div>
        ) : (
          <>
            {/* Desktop: table */}
            <div className='bg-white rounded-lg shadow overflow-hidden'> 
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-brand-500 ">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.uid} className={`hover:bg-gray-50 ${user.isArchived ? 'bg-gray-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">{user.displayName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[user.role] || "bg-gray-100 text-gray-700"}`}>
                          <FontAwesomeIcon icon={ROLE_ICON[user.role] || faUser} className="w-3 h-3" />
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.company || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{renderStatus(user)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {renderUserActions(user)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            </div>
            

            {/* Mobile: one card per user instead of a side-scrolling table */}
            <div className="sm:hidden p-3 space-y-3">
              {users.map(user => ( 
                <div
                  key={user.uid}
                  className={`border border-gray-200 rounded-xl p-4 shadow-sm ${user.isArchived ? 'bg-gray-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h3 className="font-semibold text-gray-800">{user.displayName}</h3>
                      {renderStatus(user)}
                    </div>
                    {renderMobileActionsMenu(user)}
                  </div>
                  <p className="text-sm text-gray-600 font-semibold break-all">{user.email}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm text-gray-700">
                    <div>
                      <span className="text-gray-400">Company:</span> {user.company || '-'}
                    </div>

                     <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[user.role] || "bg-gray-100 text-gray-700"}`}>
                          <FontAwesomeIcon icon={ROLE_ICON[user.role] || faUser} className="w-3 h-3" />
                          {user.role}
                        </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {!loading && users.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t">
            <p className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} ({totalUsers} total users)
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

      {/* Login Logs — shown directly under the User Management table */}
      <div className="mt-8 bg-white rounded-xl shadow overflow-hidden">
        <LoginLogs/>
      </div>

      {/* Promote to Admin Modal */}
      {promoteModal.isOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Promote to Admin</h3>
            <p className="py-4">
              Are you sure you want to promote <strong>{promoteModal.user?.displayName}</strong> to admin?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              This user will have full administrative privileges including managing users, access codes, and scheme assignments.
            </p>
            <div className="modal-action">
              <button
                onClick={() => setPromoteModal({ isOpen: false, user: null })}
                className="btn"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handlePromoteToAdmin}
                className="btn btn-info text-white"
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Promoting...
                  </>
                ) : (
                  <>
                    <UserCog className="w-4 h-4" />
                    Promote to Admin
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteModal.isOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4 text-red-600">Delete User</h3>
            <p className="py-4">
              Are you sure you want to delete <strong>{deleteModal.user?.displayName}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">⚠️ Warning: This action cannot be undone!</p>
              <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                <li>User account will be permanently deleted</li>
                <li>All user data will be removed from the system</li>
                <li>User will lose access immediately</li>
              </ul>
            </div>
            <div className="modal-action">
              <button
                onClick={() => setDeleteModal({ isOpen: false, user: null })}
                className="btn"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="btn btn-error text-white"
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
