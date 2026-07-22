import { useAuth } from "../hooks/useAuth";
import StaffSidebarLayout from "../components/layout/StaffSidebarLayout";
import ClientSidebarLayout from "../components/layout/ClientSidebarLayout";
import AdminSidebarLayout from "../components/layout/AdminSidebarLayout";
import comingSoonSvg from "../assets/comingsoon.svg";

const layouts = {
  admin: AdminSidebarLayout,
  staff: StaffSidebarLayout,
  client: ClientSidebarLayout,
};

const roleBasePaths = {
  admin: "/dashboard/admin",
  staff: "/dashboard/staff",
  client: "/dashboard/client",
};

const HelpPage = () => {
  const { userProfile } = useAuth();
  const role = userProfile?.role || "staff";
  const Layout = layouts[role] || StaffSidebarLayout;
  const basePath = roleBasePaths[role] || "/dashboard/staff";

  return (
    <Layout basePath={basePath}>
      <ComingSoon />
    </Layout>
  );
};

const ComingSoon = () => (
  <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
    <img src={comingSoonSvg} alt="Coming soon" className="w-80 h-auto mb-8" />
    <h1 className="text-4xl font-extrabold text-[#1e3a5f] mb-3 tracking-tight">
      We Are Coding
    </h1>
    <p className="text-gray-400 text-lg">Coming soon!</p>
  </div>
);

export default HelpPage;
