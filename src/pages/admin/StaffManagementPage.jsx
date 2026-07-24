import { useState } from 'react';
import AdminSidebarLayout from '../../components/layout/AdminSidebarLayout';
import StaffManagement from '../../components/admin/StaffManagement';
import LoginLogs from '../../components/admin/LoginLogs';
import { Users, LogIn } from 'lucide-react';

const TABS = [
  { key: 'staff', label: 'Staff Management', icon: Users },
  { key: 'logs',  label: 'Login Logs',        icon: LogIn  },
];

const StaffManagementPage = () => {
  const [activeTab, setActiveTab] = useState('staff');

  return (
    <AdminSidebarLayout>
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4">
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

      {activeTab === 'staff' ? <StaffManagement /> : <LoginLogs />}
    </AdminSidebarLayout>
  );
};

export default StaffManagementPage;
