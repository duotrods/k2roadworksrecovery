import ClientSidebarLayout from "../../components/layout/ClientSidebarLayout";
import comingSoonSvg from "../../assets/comingsoon.svg";

const ComingSoon = () => (
  <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
    <img src={comingSoonSvg} alt="Coming soon" className="w-64 sm:w-80 max-w-full h-auto mb-8" />
    <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1e3a5f] mb-3 tracking-tight">
      We Are Coding
    </h1>
    <p className="text-gray-400 text-lg">Coming soon!</p>
  </div>
);

const DocumentsPage = () => (
  <ClientSidebarLayout>
    <ComingSoon />
  </ClientSidebarLayout>
);

export default DocumentsPage;
