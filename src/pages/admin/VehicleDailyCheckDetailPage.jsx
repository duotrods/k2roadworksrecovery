import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Download } from "lucide-react";
import { staffService } from "../../services/staffService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";
import chellanlogo from "../../assets/chellanpng.png";

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const STATUS_DISPLAY = {
  ok: { symbol: "✓", className: "text-green-600 font-bold" },
  defect: { symbol: "✗", className: "text-red-600 font-bold" },
  na: { symbol: "–", className: "text-gray-500 font-bold" },
};

const renderCheckCell = (row, day) => {
  const status = row.status?.[day];
  if (status && STATUS_DISPLAY[status]) {
    const { symbol, className } = STATUS_DISPLAY[status];
    return <span className={className}>{symbol}</span>;
  }
  return row.initials?.[day] || "—";
};

const VehicleDailyCheckDetailPage = () => {
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
      const foundReport = await staffService.getVehicleDailyCheckById(id);

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
      await generateReportPDF(report, "vehicle-check");
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
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      </AdminSidebarLayout>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <AdminSidebarLayout>
      <div className="max-w-5xl mx-auto">
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
                Vehicle Daily Check Details
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
                  Week Commencing
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.weekCommencing || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Drivers Name
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.driversName || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Vehicle Type/Registration No
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.vehicleTypeReg || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Mileage
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.mileage || "N/A"}
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

          {/* Daily checks grid */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">
              Daily Checks
            </h4>
            <div className="overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Check Item</th>
                    {DAYS_OF_WEEK.map((day) => (
                      <th key={day} className="text-center">
                        {DAY_LABELS[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.checks || []).map((row) => (
                    <tr key={row.item}>
                      <td className="font-semibold">{row.label}</td>
                      {DAYS_OF_WEEK.map((day) => (
                        <td key={day} className="text-center">
                          {renderCheckCell(row, day)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(report.driversReport || report.actionTaken) && (
            <div className="mb-8 pb-8 border-b space-y-4">
              {report.driversReport && (
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">
                    Driver's Report
                  </label>
                  <p className="text-gray-800 bg-gray-50 p-4 rounded-lg mt-1 whitespace-pre-wrap">
                    {report.driversReport}
                  </p>
                </div>
              )}
              {report.actionTaken && (
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">
                    Action Taken
                  </label>
                  <p className="text-gray-800 bg-gray-50 p-4 rounded-lg mt-1 whitespace-pre-wrap">
                    {report.actionTaken}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mb-8 pb-8 border-b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Supervisor's Signature
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.supervisorSignature || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">
                  Date
                </label>
                <p className="text-lg font-medium text-gray-800 mt-1">
                  {report.date || "N/A"}
                </p>
              </div>
            </div>
          </div>

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

export default VehicleDailyCheckDetailPage;
