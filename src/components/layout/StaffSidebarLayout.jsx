import { useState, useEffect } from "react";
import LogoutConfirmModal from "./LogoutConfirmModal";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/authService";
import { staffService } from "../../services/staffService";
import {
  LayoutDashboard,
  LogOut,
  HelpCircle,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  FolderOpen,
} from "lucide-react";
import headerLogo from "../../assets/headerlogo.svg";
import k2logo from "../../assets/k2logo.svg";
import logomark from "../../assets/Logomark.svg";
import k2icon from "../../assets/k2iconlogo.svg";
import { isDemoUser } from "../../utils/schemes";
import { getStaffBasePath } from "../../utils/constants";

const StaffSidebarLayoutInner = ({ children, basePath = '/dashboard/staff' }) => {
  const { userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [formsOpen, setFormsOpen] = useState(() =>
    location.pathname.includes('/forms')
  );
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = async (note) => {
    // Log handover note BEFORE signOut (userProfile becomes null after)
    if (note) {
      await staffService.logActivity({
        description: note,
        staffId: userProfile?.uid,
        staffName: userProfile?.displayName || "Staff",
        type: "logout_note",
        staffGroup: "internal",
      });
    }
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
    // Reports moved into the dashboard itself (see NewStaffDashboard/
    // ReportsList) — the standalone /reports list page/route was removed.
    // The old "Live Incidents" board (LiveOperatorDashboard) was removed
    // entirely — it had no nav link and was reachable only by direct URL.
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleSignOut}
          onCancel={() => setShowLogoutModal(false)}
          noteEnabled={true}
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
              <img src={k2logo} alt="K2 Recovery" className="h-14 mt-2" />
            </Link>
          ) : (
            <Link to={basePath} className="flex items-center justify-center">
              <img src={k2icon} alt="K2" className="h-8 w-8 object-contain" />
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

        {/* Navigation */}
        <nav className="flex-1 px-2 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <div key={item.name}>
              {item.hasSubmenu ? (
                <>
                  {collapsed ? (
                    /* When collapsed, Forms shows as a plain icon link to first submenu item */
                    <Link
                      to={item.submenu[0].path}
                      title="Forms"
                      className={`flex items-center text-[14px] justify-center px-3 py-3 rounded-lg transition-colors ${
                        isActive(item.path, item.exact)
                          ? "bg-brand-500 text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => setFormsOpen(!formsOpen)}
                        className={`w-full flex items-center text-[14px] justify-between px-3 py-3 rounded-lg transition-colors ${
                          isActive(item.path, item.exact)
                            ? "bg-brand-500 text-white"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${formsOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {formsOpen && (
                        <div className="ml-4 mt-2 space-y-1">
                          {item.submenu.map((subItem) => (
                            <Link
                              key={subItem.path}
                              to={subItem.path}
                              className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                                location.pathname === subItem.path
                                  ? "bg-brand-50 text-brand-600 font-medium"
                                  : "text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              {subItem.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <Link
                  to={item.path}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    isActive(item.path, item.exact)
                      ? "bg-brand-500 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span className="font-medium flex-1">{item.name}</span>}
                  {/* Live count badge */}
                  {item.liveCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full shrink-0">
                      {item.liveCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          ))}
        </nav>

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
                {userProfile?.displayName?.charAt(0) || "S"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {userProfile?.displayName}
                </p>
                <p className="text-xs text-gray-500">Staff Member</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center mb-2 py-1">
              <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center text-white font-semibold shrink-0">
                {userProfile?.displayName?.charAt(0) || "S"}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/help')}
            title={collapsed ? 'Help' : undefined}
            className={`w-full flex items-center text-[14px] gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="font-medium">Help</span>}
          </button>
          <button
            onClick={() => setShowLogoutModal(true)}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center text-[14px] gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
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
          <img src={k2logo} alt="Lens by Chellan" className="h-7" />
        </div>
        <main className="flex-1 overflow-y-auto bg-gray-50 px-5 py-5 md:px-10 md:py-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

const StaffSidebarLayout = ({ children, basePath: basePathProp }) => {
  const { role } = useAuth();
  // Derive the base path from role when not explicitly provided, so pages that
  // render this layout without a basePath (e.g. StaffDocumentsPage) still link
  // to the staff dashboard routes.
  const basePath = basePathProp ?? getStaffBasePath(role);
  return <StaffSidebarLayoutInner basePath={basePath}>{children}</StaffSidebarLayoutInner>;
};

export default StaffSidebarLayout;
