import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/authService";
import {
  LayoutDashboard,
  FileText,
  Video,
  LogOut,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  MonitorCheck,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import headerLogo from "../../assets/headerlogo.svg";
import logomark from "../../assets/Logomark.svg";
import SchemeSwitcher from "../client/SchemeSwitcher";
import { isDemoUser } from "../../utils/schemes";
import { DASHBOARD_ROUTES } from "../../utils/constants";
import LogoutConfirmModal from "./LogoutConfirmModal";

const ClientSidebarLayout = ({ children, basePath: basePathProp }) => {
  const { userProfile, role } = useAuth();
  const basePath = basePathProp ?? DASHBOARD_ROUTES[role] ?? "/dashboard/client";
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    await authService.signOut();
    navigate("/");
  };

  const isActive = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navItems = [
    {
      name: "Dashboard",
      path: basePath,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      name: "Reports",
      path: `${basePath}/reports`,
      icon: FileText,
    },
    {
      name: "CCTV Recordings",
      path: `${basePath}/cctv-recordings`,
      icon: Video,
    },
    {
      name: "CCTV Uptime",
      path: `${basePath}/cctv-uptime`,
      icon: MonitorCheck,
    },
    {
      name: "Documents",
      path: `${basePath}/documents`,
      icon: FolderOpen,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleSignOut}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-white shadow-lg flex flex-col transition-all duration-300 shrink-0 fixed inset-y-0 left-0 z-50 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:z-auto`}>
        {/* Logo */}
        <div className="p-4 border-b flex items-center justify-center">
          {!collapsed ? (
            <Link to={basePath} className="flex items-center">
              <img src={headerLogo} alt="Lens by Chellan" className="h-8" />
            </Link>
          ) : (
            <Link to={basePath} className="flex items-center justify-center">
              <img src={logomark} alt="L" className="h-8 w-8 object-contain" />
            </Link>
          )}
        </div>

        {/* Demo Mode Badge */}
        {!collapsed && isDemoUser(userProfile) && (
          <div className="mx-4 mt-4 px-3 py-2 bg-amber-100 border border-amber-300 rounded-lg">
            <p className="text-xs font-bold text-amber-800 text-center uppercase tracking-wide">
              Demo Mode
            </p>
          </div>
        )}

        {/* Scheme Info */}
        {!collapsed && (
          <div className="px-6 py-4 bg-brand-50 border-b">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {userProfile?.schemeIds?.length > 1 ? "Active Scheme" : "Your Scheme"}
            </p>
            <p className="text-lg font-bold text-brand-700">
              {userProfile?.schemeNames?.[userProfile?.activeSchemeId] ||
               userProfile?.activeSchemeName ||
               userProfile?.schemeName ||
               "Loading..."}
            </p>
            <p className="text-xs text-gray-400">
              {userProfile?.activeSchemeId || userProfile?.schemeId || ""}
            </p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              title={collapsed ? item.name : undefined}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                isActive(item.path, item.exact)
                  ? "bg-brand-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="font-medium">{item.name}</span>}
            </Link>
          ))}

          {/* Coming soon items */}
          {[
            { name: "Lense Assist", icon: Sparkles },
          ].map((item) => (
            <div
              key={item.name}
              title={collapsed ? `${item.name} — Coming soon` : undefined}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-gray-400 cursor-default select-none ${collapsed ? 'justify-center' : ''}`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="font-medium flex-1">{item.name}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                    Soon
                  </span>
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Scheme Switcher - only when expanded */}
        {!collapsed && (
          <div className="px-4 py-2">
            <SchemeSwitcher />
          </div>
        )}

        {/* Collapse toggle */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            {!collapsed && <span className="text-sm">Collapse</span>}
          </button>
        </div>

        {/* User Profile & Logout */}
        <div className="border-t px-2 py-4">
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-3 mb-2">
              <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center text-white font-semibold shrink-0">
                {userProfile?.displayName?.charAt(0) || "C"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {userProfile?.displayName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {userProfile?.company}
                </p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center mb-2 py-1">
              <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center text-white font-semibold shrink-0">
                {userProfile?.displayName?.charAt(0) || "C"}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/help')}
            title={collapsed ? 'Help' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <HelpCircle className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="font-medium">Help</span>}
          </button>
          <button
            onClick={() => setShowLogoutModal(true)}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden bg-white border-b px-5 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="p-1 rounded-lg hover:bg-gray-100">
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          <img src={headerLogo} alt="Lens by Chellan" className="h-7" />
        </div>
        <main id="client-main-scroll" className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5 md:px-10 md:py-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default ClientSidebarLayout;
