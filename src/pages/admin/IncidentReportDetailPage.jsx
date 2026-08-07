import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Download, FileText, Calendar, User, MapPin, AlertTriangle } from 'lucide-react';
import { staffService } from '../../services/staffService';
import AdminSidebarLayout from '../../components/layout/AdminSidebarLayout';
import { generateReportPDF } from '../../utils/pdfGenerator';
import { SERVICE_ACCEPTANCE_STATEMENTS, VEHICLE_CONDITION_SECTIONS, CHECK_ITEMS } from '../../utils/incidentForm';
import k2logo from "../../assets/k2logo.svg";

const IncidentReportDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  // Return to the page we came from; default to Staff Reports.
  const backPath = location.state?.from || '/dashboard/admin/staff-reports';
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

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
        toast.error('Report not found');
        navigate(backPath);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      toast.error('Failed to load report');
      navigate(backPath);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateReportPDF(report, 'incident');
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (time) => {
    if (!time) return 'N/A';
    return time;
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

  return (
    <AdminSidebarLayout>
      <div className="max-w-8xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-start">
            <button
              onClick={() => navigate(backPath)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-800">Job Sheet Details</h1>
                {report.status === 'live' ? (
                  <span className="badge badge-error gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                ) : report.status === 'completed' ? (
                  <span className="badge badge-success text-white">Completed</span>
                ) : (
                  <span className="badge badge-warning capitalize">{report.status || 'submitted'}</span>
                )}
              </div>
              <p className="text-gray-500 text-[13px] sm:text-[14px]">Reference: {report.referenceId || 'N/A'}</p>
            </div>
          </div>
          <button
            onClick={handleDownloadPDF}
            className="btn bg-blue-500 text-white hover:bg-blue-600 border-none w-full sm:w-auto shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-xl shadow-md p-8">
          {/* Logo */}
          <div className="flex justify-center items-center mb-8">
            <img src={k2logo} alt="Company Logo" className="h-25 w-auto" />
          </div>

          {/* Arrival Details */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Arrival Details</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                ["driverOnScene", "Driver on scene"],
                ["policeOnScene", "Police on scene"],
                ["nhOnScene", "NH on scene"],
                ["ripvOnScene", "RIPV on scene"],
              ]
                .filter(([key]) => report[key])
                .map(([key, label]) => (
                  <span key={key} className="badge badge-lg bg-teal-100 text-teal-700">
                    {label}
                  </span>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Operator</label>
                <p className="text-lg font-medium text-gray-800 mt-1">{report.firstName || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Scheme</label>
                <p className="text-lg font-medium text-gray-800 mt-1">{report.scheme || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Job Source/Customer</label>
                <p className="text-base text-gray-800 mt-1">{report.jobSource || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Customer Log No.</label>
                <p className="text-base text-gray-800 mt-1">{report.customerLogNo || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Date of Receipt</label>
                <p className="text-base text-gray-800 mt-1">{report.date || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Time</label>
                <p className="text-base text-gray-800 mt-1">{formatTime(report.time)}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Vehicle Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Reg. No.</label>
                <p className="text-base text-gray-800 mt-1">{report.vehicleRegNo || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Make / Model</label>
                <p className="text-base text-gray-800 mt-1">{report.vehicleMakeModel || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Colour</label>
                <p className="text-base text-gray-800 mt-1">{report.vehicleColour || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Petrol / Diesel</label>
                <p className="text-base text-gray-800 mt-1">{report.fuelType || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Manual / Auto</label>
                <p className="text-base text-gray-800 mt-1">{report.manualOrAuto || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Transmission</label>
                <p className="text-base text-gray-800 mt-1">{report.transmission || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">No. Passengers</label>
                <p className="text-base text-gray-800 mt-1">{report.noOfPassengers || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Speedo</label>
                <p className="text-base text-gray-800 mt-1">{report.speedo || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Motorcycle Solo / Combo</label>
                <p className="text-base text-gray-800 mt-1">{report.motorcycleType || 'N/A'}</p>
              </div>
              {report.hasCaravanTrailer && (
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Trailer Number</label>
                  <p className="text-base text-gray-800 mt-1">{report.trailerNumber || 'N/A'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Fault & Location */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Fault & Location</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Fault Reported</label>
                <p className="text-base text-gray-800 mt-1">{report.faultReported || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Actual Fault</label>
                <p className="text-base text-gray-800 mt-1">{report.actualFault || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Marker Post</label>
                <p className="text-base text-gray-800 mt-1">{report.markerPost || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Time Information */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Time Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Time of Arrival</label>
                <p className="text-base text-gray-800 mt-1">{formatTime(report.timeOfArrival)}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Time Completed</label>
                <p className="text-base text-gray-800 mt-1">{formatTime(report.timeCompleted)}</p>
              </div>
              {report.timeSpottedToOn && (
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Response Time</label>
                  <p className="text-base text-gray-800 mt-1">{report.timeSpottedToOn}</p>
                </div>
              )}
              {report.timeOnsiteToCleared && (
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Job Duration</label>
                  <p className="text-base text-gray-800 mt-1">{report.timeOnsiteToCleared}</p>
                </div>
              )}
            </div>
          </div>

          {/* Completion Details */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Completion Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Recovery Destination</label>
                <p className="text-base text-gray-800 mt-1">{report.recoveryDestination || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Property Removed</label>
                <p className="text-base text-gray-800 mt-1">{report.propertyRemoved || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Vehicle Outcome</label>
                <p className="text-base text-gray-800 mt-1">{report.vehicleOutcome || 'N/A'}</p>
              </div>
              {(report.storageName || report.storageAddress || report.storageContactNo) && (
                <>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Storage Name</label>
                    <p className="text-base text-gray-800 mt-1">{report.storageName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Storage Address</label>
                    <p className="text-base text-gray-800 mt-1">{report.storageAddress || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Storage Contact No.</label>
                    <p className="text-base text-gray-800 mt-1">{report.storageContactNo || 'N/A'}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Checks */}
          {report.checks && (
            <div className="mb-8 pb-8 border-b">
              <h4 className="text-lg font-bold text-gray-800 mb-4">Checks</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {CHECK_ITEMS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-sm font-semibold text-gray-600">{label}</label>
                    <p className="text-gray-800">{report.checks[key] || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle Condition */}
          {report.vehicleCondition && (
            <div className="mb-8 pb-8 border-b">
              <h4 className="text-lg font-bold text-gray-800 mb-4">Vehicle Condition</h4>
              <div className="space-y-2">
                {VEHICLE_CONDITION_SECTIONS.map(({ key, label }) => {
                  const section = report.vehicleCondition[key] || {};
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-600 w-40 shrink-0">{label}</span>
                      <span className="text-gray-800">
                        {section.damage ? `Damaged — ${section.note || 'no note'}` : 'No damage'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer/Driver Service Acceptance */}
          {report.serviceAcceptance && (
            <div className="mb-8 pb-8 border-b">
              <h4 className="text-lg font-bold text-gray-800 mb-4">Customer/Driver Service Acceptance</h4>
              <div className="space-y-2">
                {SERVICE_ACCEPTANCE_STATEMENTS.map((statement, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span
                      className={`badge shrink-0 ${
                        report.serviceAcceptance[index] ? 'badge-success' : 'badge-ghost'
                      }`}
                    >
                      {report.serviceAcceptance[index] ? 'Accepted' : 'Not accepted'}
                    </span>
                    <span className="text-sm text-gray-700">{index + 1}. {statement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sign Off */}
          <div className="mb-8 pb-8 border-b">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Sign Off</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Name</label>
                <p className="text-base text-gray-800 mt-1">{report.name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Satisfaction Confirmed</label>
                <p className="text-base text-gray-800 mt-1">{report.satisfactionConfirmed ? 'Yes' : 'No'}</p>
              </div>
            </div>
            {report.signatureUrl && (
              <div>
                <label className="text-sm font-semibold text-gray-500 uppercase">Signature</label>
                <img
                  src={report.signatureUrl}
                  alt="Signature"
                  className="mt-1 border border-gray-200 rounded-lg bg-white h-32 object-contain"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mb-8">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Notes</h4>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-800 whitespace-pre-wrap">
                {report.notes || 'No notes provided'}
              </p>
            </div>
          </div>

          {/* Files */}
          {[
            { title: "Arrival Images", files: (report.files || []).filter((f) => f.stage === "arrival") },
            { title: "Unloaded Images", files: (report.files || []).filter((f) => f.stage === "dropoff") },
            { title: "Other Attachments", files: (report.files || []).filter((f) => !f.stage) },
          ]
            .filter((section) => section.files.length > 0)
            .map((section) => (
              <div key={section.title} className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">{section.title}</h4>
                <div className="space-y-2">
                  {section.files.map((file, index) => (
                    <a
                      key={index}
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <FileText className="w-5 h-5 text-teal-600" />
                      <span className="text-sm font-medium text-gray-800">{file.fileName}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}

          {/* Submission Information */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="text-sm font-semibold text-gray-500 uppercase mb-4">Submission Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Submitted by:</span>
                <span className="ml-2 font-medium text-gray-800">
                  {report.submittedBy?.name || 'Unknown'}
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
                <span className={`ml-2 badge capitalize ${
                  report.status === 'live'
                    ? 'badge-error text-white'
                    : report.status === 'completed'
                      ? 'badge-success text-white'
                      : 'badge-warning'
                }`}>
                  {report.status || 'submitted'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminSidebarLayout>
  );
};

export default IncidentReportDetailPage;
