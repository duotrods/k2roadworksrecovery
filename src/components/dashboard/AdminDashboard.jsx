import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { userAdminService } from '../../services/userAdminService';
import { useAuth } from '../../hooks/useAuth';
import { Key, Users, UserCog, Trash2, LayoutDashboard, LogIn } from 'lucide-react';
import StaffManagement from '../admin/StaffManagement';
import LoginLogs from '../admin/LoginLogs';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'staff', label: 'Staff', icon: Users },
  { key: 'logs', label: 'Login Logs', icon: LogIn },
];

const AdminDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((t) => t.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';
  const setActiveTab = (key) => setSearchParams(key === 'overview' ? {} : { tab: key });

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [promoteModal, setPromoteModal] = useState({ isOpen: false, user: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [roleCounts, setRoleCounts] = useState({ total: 0, staff: 0, client: 0 });
  const usersPerPage = 10;
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
    loadRoleCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { users: paginatedUsers, total, hasMore: more } =
        await userAdminService.getUsersPaginated(currentPage, usersPerPage);

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

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === key
                  ? 'border-brand-500 text-brand-600 bg-brand-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'staff' ? (
        <StaffManagement />
      ) : activeTab === 'logs' ? (
        <LoginLogs />
      ) : (
      <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2>Admin Dashboard</h2>
          <p className="text-gray-600">Welcome back, {userProfile?.displayName}!</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/dashboard/admin/otp-management')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
          >
            <Key className="w-4 h-4" />
            Manage Access Codes
          </button>
          <button
            onClick={() => navigate('/dashboard/admin/scheme-assignment')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
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

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-5">
          <h5>User Management</h5>
        </div>

        {loading ? (
          <div className="p-14 text-center">
            <span className="loading loading-spinner text-brand-500"></span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-brand-500">
                  <th className="text-xs text-white uppercase">Name</th>
                  <th className="text-xs text-white uppercase">Email</th>
                  <th className="text-xs text-white uppercase">Role</th>
                  <th className="text-xs text-white uppercase">Company</th>
                  <th className="text-xs text-white uppercase">Status</th>
                  <th className="text-xs text-white uppercase text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.uid}>
                    <td>{user.displayName}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`badge ${
                        user.role === 'admin' ? 'badge-error' :
                        user.role === 'staff' ? 'badge-warning' : 'badge-info'
                      }`}>
                        {user.role}
                      </span> 
                    </td>
                    <td>{user.company || '-'}</td>
                    <td>
                      {user.emailVerified ? (
                        <span className="text-success">Verified</span>
                      ) : (
                        <span className="text-warning">Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        {/* Only show promote button for staff users */}
                        {/* {user.role === 'staff' && user.uid !== userProfile?.uid && (
                          <button
                            onClick={() => setPromoteModal({ isOpen: true, user })}
                            className="btn btn-sm btn-info text-white"
                            title="Promote to Admin"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>
                        )} */}
                        {/* Show delete button for non-admin users (staff and client) */}
                        {user.role !== 'admin' && user.uid !== userProfile?.uid && (
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, user })}
                            className="btn btn-sm btn-error text-white"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* Show nothing if it's current user or admin */}
                        {(user.uid === userProfile?.uid || (user.role === 'admin' && user.uid !== userProfile?.uid)) && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && users.length > 0 && (
          <div className="p-4 mt-6 border-t border-gray-300 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing page {currentPage} of {totalPages} ({totalUsers} total users)
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasMore}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  !hasMore
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 text-white'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
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
      </>
      )}
    </div>
  );
};

export default AdminDashboard;
