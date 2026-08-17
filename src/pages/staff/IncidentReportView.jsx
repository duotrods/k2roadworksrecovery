import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Download, Edit, Trash2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getStaffBasePath } from "../../utils/constants";
import { staffService } from "../../services/staffService";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";
import {
  SERVICE_ACCEPTANCE_STATEMENTS,
  VEHICLE_CONDITION_SECTIONS,
  CHECK_ITEMS,
} from "../../utils/incidentForm";

const IncidentReportView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const foundReport = await staffService.getIncidentReportById(id);

      if (foundReport) {
        setReport(foundReport);
      } else {
        toast.error("Report not found");
        navigate(basePath);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`${basePath}/forms/incident-report?edit=${id}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete this Job Sheet? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await staffService.deleteIncidentReport(
        id,
        userProfile.uid,
        userProfile.displayName,
      );
      toast.success("Job Sheet deleted successfully");
      navigate(basePath);
    } catch (error) {
      console.error("Failed to delete report:", error);
      toast.error("Failed to delete report");
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateReportPDF(report, "incident");
      toast.success("Downloaded report as PDF");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to download PDF");
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <StaffSidebarLayout basePath={basePath}>
        <div className="flex justify-center items-center h-64">
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      </StaffSidebarLayout>
    );
  }

  if (!report) {
    return (
      <StaffSidebarLayout basePath={basePath}>
        <div className="text-center py-12">
          <p className="text-gray-500">Report not found</p>
        </div>
      </StaffSidebarLayout>
    );
  }

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">
                Job Sheet Details
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Reference: {report.referenceId || report.id.slice(0, 12)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleDownloadPDF}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleEdit}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6">
          {/* Arrival Details */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Arrival Details
            </h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                ["driverOnScene", "Driver on scene"],
                ["policeOnScene", "Police on scene"],
                ["nhOnScene", "NH on scene"],
                ["ripvOnScene", "RIPV on scene"],
              ]
                .filter(([key]) => report[key])
                .map(([key, label]) => (
                  <span
                    key={key}
                    className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm"
                  >
                    {label}
                  </span>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Operator
                </label>
                <p className="text-gray-800">
                  {report.submittedBy?.name || report.firstName || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Scheme
                </label>
                <p className="text-gray-800">{report.scheme || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Job Source/Customer
                </label>
                <p className="text-gray-800">{report.jobSource || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Customer Log No.
                </label>
                <p className="text-gray-800">{report.customerLogNo || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Date of Receipt
                </label>
                <p className="text-gray-800">{report.date || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Time
                </label>
                <p className="text-gray-800">{report.time || "N/A"}</p>
              </div>
              {report.lastEditedBy && (
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-gray-600">
                    Last Edited By
                  </label>
                  <p className="text-blue-600">
                    {report.lastEditedBy?.name || "Unknown"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Details */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Vehicle Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Vehicle Type
                </label>
                <p className="text-gray-800">{report.vehicleType || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Reg. No.
                </label>
                <p className="text-gray-800">{report.vehicleRegNo || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Make / Model
                </label>
                <p className="text-gray-800">{report.vehicleMakeModel || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Petrol / Diesel
                </label>
                <p className="text-gray-800">{report.fuelType || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Manual / Auto
                </label>
                <p className="text-gray-800">{report.manualOrAuto || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Transmission
                </label>
                <p className="text-gray-800">{report.transmission || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  No. Passengers
                </label>
                <p className="text-gray-800">{report.noOfPassengers || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Speedo
                </label>
                <p className="text-gray-800">{report.speedo || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Motorcycle Solo / Combo
                </label>
                <p className="text-gray-800">{report.motorcycleType || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Fault & Location */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Fault & Location
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Fault
                </label>
                <p className="text-gray-800">{report.actualFault || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Marker Post
                </label>
                <p className="text-gray-800">{report.markerPost || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Location
                </label>
                <p className="text-gray-800">{report.location || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Time Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Time Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-semibold text-black">
                  Time of Arrival
                </label>
                <p className="text-gray-800">{report.timeOfArrival || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-black">
                  Time Completed
                </label>
                <p className="text-gray-800">{report.timeCompleted || "N/A"}</p>
              </div>
              {report.timeSpottedToOn && (
                <div>
                  <label className="text-sm font-semibold text-black">
                    Response Time
                  </label>
                  <p className="text-gray-800">{report.timeSpottedToOn}</p>
                </div>
              )}
              {report.timeOnsiteToCleared && (
                <div>
                  <label className="text-sm font-semibold text-black">
                    Job Duration
                  </label>
                  <p className="text-gray-800">{report.timeOnsiteToCleared}</p>
                </div>
              )}
            </div>
          </div>

          {/* Completion Details */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Completion Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Recovery Destination
                </label>
                <p className="text-gray-800">{report.recoveryDestination || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Vehicle in Storage
                </label>
                <p className="text-gray-800">{report.vehicleInStorage || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Property Removed
                </label>
                <p className="text-gray-800">{report.propertyRemoved || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Vehicle Outcome
                </label>
                <p className="text-gray-800">{report.vehicleOutcome || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Checks */}
          {report.checks && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                Checks
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {CHECK_ITEMS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-sm font-semibold text-gray-600">{label}</label>
                    <p className="text-gray-800">{report.checks[key] || "N/A"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle Condition */}
          {report.vehicleCondition && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                Vehicle Condition
              </h4>
              <div className="space-y-2">
                {VEHICLE_CONDITION_SECTIONS.map(({ key, label }) => {
                  const section = report.vehicleCondition[key] || {};
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-600 w-40 shrink-0">
                        {label}
                      </span>
                      <span className="text-gray-800">
                        {section.damage ? `Damaged — ${section.note || "no note"}` : "No damage"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer/Driver Service Acceptance */}
          {report.serviceAcceptance && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                Customer/Driver Service Acceptance
              </h4>
              <div className="space-y-2">
                {SERVICE_ACCEPTANCE_STATEMENTS.map((statement, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs shrink-0 ${
                        report.serviceAcceptance[index]
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {report.serviceAcceptance[index] ? "Accepted" : "Not accepted"}
                    </span>
                    <span className="text-sm text-gray-700">{index + 1}. {statement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sign Off */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Sign Off
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Name
                </label>
                <p className="text-gray-800">{report.name || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Satisfaction Confirmed
                </label>
                <p className="text-gray-800">
                  {report.satisfactionConfirmed ? "Yes" : "No"}
                </p>
              </div>
            </div>
            {report.signatureUrl && (
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Signature
                </label>
                <img
                  src={report.signatureUrl}
                  alt="Signature"
                  className="mt-1 border border-gray-200 rounded-lg bg-white h-32 object-contain"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Notes
            </h4>
            <p className="text-gray-800 whitespace-pre-wrap">
              {report.notes || "N/A"}
            </p>
          </div>

          {/* Files */}
          {[
            { title: "Arrival Images", files: (report.files || []).filter((f) => f.stage === "arrival") },
            { title: "Unloaded Images", files: (report.files || []).filter((f) => f.stage === "dropoff") },
            { title: "Other Attachments", files: (report.files || []).filter((f) => !f.stage) },
          ]
            .filter((section) => section.files.length > 0)
            .map((section) => (
              <div key={section.title}>
                <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                  {section.title}
                </h4>
                <div className="space-y-2">
                  {section.files.map((file, index) => (
                    <a
                      key={index}
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-800">
                        {file.fileName}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
              <div>
                <label className="font-semibold">Created:</label>{" "}
                {formatDateTime(report.createdAt)}
              </div>
              {report.updatedAt && (
                <div>
                  <label className="font-semibold">Last Updated:</label>{" "}
                  {formatDateTime(report.updatedAt)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StaffSidebarLayout>
  );
};

export default IncidentReportView;
