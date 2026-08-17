import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Download, Image, Video, X } from "lucide-react";
import { clientDataService } from "../../services/clientDataService";
import ClientSidebarLayout from "../../components/layout/ClientSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";
import { isVideoFile } from "../../utils/fileType";
import {
  SERVICE_ACCEPTANCE_STATEMENTS,
  VEHICLE_CONDITION_SECTIONS,
  CHECK_ITEMS,
} from "../../utils/incidentForm";

const IncidentReportView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedImages, setLoadedImages] = useState({}); // Track which images are loaded
  const [viewingFile, setViewingFile] = useState(null); // { url, isVideo } for fullscreen view

  // Load image on demand (saves Firebase Storage bandwidth!)
  const handleLoadImage = (index) => {
    setLoadedImages((prev) => ({ ...prev, [index]: true }));
  };

  // Renders one Attachments section (e.g. "Arrival Images"). Takes
  // {file, index} pairs so lazy-load state (loadedImages) stays keyed by
  // each file's original position in report.files even though a section
  // only shows a filtered subset.
  const renderAttachmentSection = (title, entries) => {
    if (entries.length === 0) return null;

    return (
      <div key={title}>
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <h4 className="text-lg font-semibold text-gray-800">
            {title} ({entries.length})
          </h4>
          {entries.some(({ index }) => !loadedImages[index]) && (
            <button
              onClick={() => {
                const updates = {};
                entries.forEach(({ index }) => {
                  updates[index] = true;
                });
                setLoadedImages((prev) => ({ ...prev, ...updates }));
              }}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              Load All
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(({ file, index }) => (
            <div key={index} className="relative">
              {loadedImages[index] ? (
                isVideoFile(file) ? (
                  <div className="relative">
                    <video
                      src={file.downloadUrl}
                      controls
                      className="w-full h-48 object-cover rounded-lg bg-black"
                    />
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 p-2 bg-white/80 rounded-lg hover:bg-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-4 h-4 text-gray-700" />
                    </a>
                  </div>
                ) : (
                  <>
                    <img
                      src={file.downloadUrl}
                      alt={file.fileName}
                      className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setViewingFile({ url: file.downloadUrl, isVideo: false })}
                    />
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 p-2 bg-white/80 rounded-lg hover:bg-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-4 h-4 text-gray-700" />
                    </a>
                  </>
                )
              ) : (
                <button
                  onClick={() => handleLoadImage(index)}
                  className="w-full h-48 bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-gray-200 transition-colors border-2 border-dashed border-gray-300"
                >
                  {isVideoFile(file) ? (
                    <Video className="w-8 h-8 text-gray-400" />
                  ) : (
                    <Image className="w-8 h-8 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-500">
                    Click to load {isVideoFile(file) ? "video" : "image"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {file.fileName}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Splits report.files into "Arrival Images" (Step 2), "Unloaded Images"
  // (Step 3), and a fallback for older reports uploaded before attachments
  // were tagged by stage.
  const renderAttachments = () => {
    const withIndex = (report?.files || []).map((file, index) => ({ file, index }));
    return (
      <div className="space-y-6">
        {renderAttachmentSection("Arrival Images", withIndex.filter(({ file }) => file.stage === "arrival"))}
        {renderAttachmentSection("Unloaded Images", withIndex.filter(({ file }) => file.stage === "dropoff"))}
        {renderAttachmentSection("Other Attachments", withIndex.filter(({ file }) => !file.stage))}
      </div>
    );
  };

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      // Use efficient single-document fetch (1 read instead of loading all reports!)
      const foundReport = await clientDataService.getIncidentById(id);

      if (foundReport) {
        setReport(foundReport);
      } else {
        toast.error("Report not found");
        navigate(-1);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
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
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);
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
      <ClientSidebarLayout>
        <div className="flex justify-center items-center h-64">
          <span className="loading loading-spinner loading-lg text-brand-500"></span>
        </div>
      </ClientSidebarLayout>
    );
  }

  if (!report) {
    return (
      <ClientSidebarLayout>
        <div className="text-center py-12">
          <p className="text-gray-500">Report not found</p>
        </div>
      </ClientSidebarLayout>
    );
  }

  return (
    <ClientSidebarLayout>
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
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold text-gray-800">
                  Job Sheet Details
                </h3>
                {report.status === "live" ? (
                  <span className="px-3 py-1 bg-yellow-500 text-white rounded-full text-sm font-semibold">
                    LIVE
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-green-500 text-white rounded-full text-sm font-semibold">
                    COMPLETED
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Reference: {report.referenceId || report.id.slice(0, 12)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors w-full md:w-auto"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6">
          {/* CONDITIONAL RENDER: Show different content based on status */}
          {report.status === "live" ? (
            // ============ LIVE INCIDENT - Show only Step 1 fields ============
            <>
              {/* Basic Info for Live Job */}
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
                    <p className="text-gray-800">{report.firstName || "N/A"}</p>
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
                    <p className="text-gray-800">
                      {report.customerLogNo || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Date of Receipt
                    </label>
                    <p className="text-gray-800">{report.date || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Time of Arrival
                    </label>
                    <p className="text-gray-800">
                      {report.timeOfArrival || "N/A"}
                    </p>
                  </div>
                </div>
                {report.notes && (
                  <div className="mt-4">
                    <label className="text-sm font-semibold text-gray-600">
                      Notes
                    </label>
                    <p className="text-gray-800 whitespace-pre-wrap">{report.notes}</p>
                  </div>
                )}
              </div>

              {/* Attachments for Live Incident - Lazy loaded to save bandwidth */}
              {report.files && report.files.length > 0 && renderAttachments()}

              {/* Live Status Indicator */}
              <div className="bg-yellow-50 rounded-lg p-6">
                <span className="px-3 py-1 bg-yellow-500 text-white rounded-full text-sm font-medium">
                  LIVE
                </span>
                <p className="text-sm text-gray-600 mt-3">
                  This Job Sheet is still live. Full details will be
                  available once completed.
                </p>
              </div>
            </>
          ) : (
            // ============ COMPLETED INCIDENT - Show all fields ============
            <>
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
                    <p className="text-gray-800">
                      {report.customerLogNo || "N/A"}
                    </p>
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
                    <p className="text-gray-800">
                      {report.vehicleType || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Reg. No.
                    </label>
                    <p className="text-gray-800">
                      {report.vehicleRegNo || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Make / Model
                    </label>
                    <p className="text-gray-800">
                      {report.vehicleMakeModel || "N/A"}
                    </p>
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
                    <p className="text-gray-800">
                      {report.manualOrAuto || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Transmission
                    </label>
                    <p className="text-gray-800">
                      {report.transmission || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      No. Passengers
                    </label>
                    <p className="text-gray-800">
                      {report.noOfPassengers || "N/A"}
                    </p>
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
                    <p className="text-gray-800">
                      {report.motorcycleType || "N/A"}
                    </p>
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
                    <p className="text-gray-800">
                      {report.actualFault || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Marker Post
                    </label>
                    <p className="text-gray-800">
                      {report.markerPost || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Location
                    </label>
                    <p className="text-gray-800">
                      {report.location || "N/A"}
                    </p>
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
                    <label className="text-sm font-semibold text-gray-600">
                      Time of Arrival
                    </label>
                    <p className="text-gray-800">
                      {report.timeOfArrival || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Time Completed
                    </label>
                    <p className="text-gray-800">
                      {report.timeCompleted || "N/A"}
                    </p>
                  </div>
                  {report.timeSpottedToOn && (
                    <div>
                      <label className="text-sm font-semibold text-gray-600">
                        Response Time
                      </label>
                      <p className="text-gray-800">{report.timeSpottedToOn}</p>
                    </div>
                  )}
                  {report.timeOnsiteToCleared && (
                    <div>
                      <label className="text-sm font-semibold text-gray-600">
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
                    <p className="text-gray-800">
                      {report.recoveryDestination || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Vehicle in Storage
                    </label>
                    <p className="text-gray-800">
                      {report.vehicleInStorage || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Property Removed
                    </label>
                    <p className="text-gray-800">
                      {report.propertyRemoved || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      Vehicle Outcome
                    </label>
                    <p className="text-gray-800">
                      {report.vehicleOutcome || "N/A"}
                    </p>
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
                        <label className="text-sm font-semibold text-gray-600">
                          {label}
                        </label>
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
                            {section.damage
                              ? `Damaged — ${section.note || "no note"}`
                              : "No damage"}
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
                          {report.serviceAcceptance[index]
                            ? "Accepted"
                            : "Not accepted"}
                        </span>
                        <span className="text-sm text-gray-700">
                          {index + 1}. {statement}
                        </span>
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
                    <p className="text-gray-800">
                      {report.name || "N/A"}
                    </p>
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

              {/* Files - Lazy loaded to save bandwidth */}
              {report.files && report.files.length > 0 && renderAttachments()}

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
                  <div>
                    <label className="font-semibold">Status:</label>{" "}
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {report.status || "completed"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen File Viewer Modal */}
      {viewingFile && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingFile(null)}
        >
          <button
            onClick={() => setViewingFile(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          {viewingFile.isVideo ? (
            <video
              src={viewingFile.url}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={viewingFile.url}
              alt="Full size"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <a
            href={viewingFile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      )}
    </ClientSidebarLayout>
  );
};

export default IncidentReportView;
