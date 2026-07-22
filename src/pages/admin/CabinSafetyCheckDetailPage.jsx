import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Download } from "lucide-react";
import { staffService } from "../../services/staffService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";
import chellanlogo from "../../assets/chellanpng.png";

const CabinSafetyCheckDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const backPath = location.state?.from || "/dashboard/admin/staff-reports";
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const foundReport = await staffService.getCabinHealthSafetyCheckById(id);

      if (foundReport) {
        setReport(foundReport);
      } else {
        toast.error("Report not found");
        navigate(backPath);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load report");
      navigate(backPath);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateReportPDF(report, "cabin-safety");
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <AdminSidebarLayout>
        <div className="flex justify-center items-center h-96">
          <span className="loading loading-spinner loading-lg text-brand-500"></span>
        </div>
      </AdminSidebarLayout>
    );
  }

  if (!report) {
    return null;
  }

  const sections = [
    ...new Set((report.checklist || []).map((row) => row.section)),
  ];

  return (
    <AdminSidebarLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(backPath)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">
                Cabin Health & Safety Check Details
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Reference: {report.referenceId || "N/A"}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadPDF}
            className="btn bg-blue-500 text-white hover:bg-blue-600 border-none"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-xl shadow-md p-8">
          {/* Logo */}
          <div className="flex justify-center items-center mb-8">
            <img
              src={chellanlogo}
              alt="Company Logo"
              className="h-25 w-auto"
            />
          </div>

          {/* Basic Information */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Cabin No / Plot No
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.cabinOrPlotNo || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Inspection Completed By
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.inspectionCompletedBy || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Site Location
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.siteLocation || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Inspection Date
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.inspectionDate || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Scheme */}
          {report.scheme && (
            <div className="mb-8 pb-8 border-b">
              <h4 className="text-lg font-bold text-gray-800 mb-4">
                Associated Scheme
              </h4>
              <span className="badge badge-lg bg-purple-100 text-purple-700">
                {report.scheme}
              </span>
            </div>
          )}

          {/* Checklist sections */}
          {sections.map((sectionName) => (
            <div key={sectionName} className="mb-8 pb-8 border-b">
              <h4 className="text-lg font-bold text-gray-800 mb-4">
                {sectionName}
              </h4>
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Question</th>
                      <th className="text-center">Answer</th>
                      <th className="text-left">Comments / Actions</th>
                      <th className="text-left">Action Owner</th>
                      <th className="text-left">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.checklist
                      .filter((row) => row.section === sectionName)
                      .map((row, idx) => (
                        <tr key={idx}>
                          <td className="max-w-xs">{row.question}</td>
                          <td className="text-center font-semibold">
                            {row.answer || "—"}
                          </td>
                          <td>{row.comments || "—"}</td>
                          <td>{row.actionOwner || "—"}</td>
                          <td>{row.completed || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Submission Information */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="text-sm font-semibold text-gray-500 uppercase mb-4">
              Submission Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Submitted by:</span>
                <span className="ml-2 font-medium text-gray-800">
                  {report.submittedBy?.name || "Unknown"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Submitted on:</span>
                <span className="ml-2 font-medium text-gray-800">
                  {formatDate(report.createdAt)}
                </span>
              </div>
              {report.updatedAt && (
                <div>
                  <span className="text-gray-500">Last updated:</span>
                  <span className="ml-2 font-medium text-gray-800">
                    {formatDate(report.updatedAt)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Status:</span>
                <span
                  className={`ml-2 badge ${
                    report.status === "submitted"
                      ? "badge-warning"
                      : "badge-success"
                  }`}
                >
                  {report.status || "submitted"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminSidebarLayout>
  );
};

export default CabinSafetyCheckDetailPage;
