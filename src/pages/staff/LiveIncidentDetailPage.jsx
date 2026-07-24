import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { staffService } from '../../services/staffService';
import StaffSidebarLayout from '../../components/layout/StaffSidebarLayout';
import { generateReportPDF } from '../../utils/pdfGenerator';
import chellanlogo from "../../assets/chellanpng.png";

const LiveIncidentDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
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
        navigate('/dashboard/staff/live-incidents');
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      toast.error('Failed to load report');
      navigate('/dashboard/staff/live-incidents');
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
      <StaffSidebarLayout>
        <div className="flex justify-center items-center h-96">
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      </StaffSidebarLayout>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <StaffSidebarLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard/staff/live-incidents')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">Incident Report Details</h3>
              <p className="text-sm text-gray-500 mt-1">Reference: {report.referenceId || 'N/A'}</p>
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
            <img src={chellanlogo} alt="Company Logo" className="h-25 w-auto" />
          </div>

          {/* CONDITIONAL RENDER: Show different content based on status */}
          {report.status === 'live' ? (
            // ============ LIVE INCIDENT - Show only Step 1 fields ============
            <>
              {/* Step 1 Fields Only */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 pb-8 border-b">
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Scheme</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.scheme || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Section</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.section || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Marker Post</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.markerPost || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Date</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.date || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Name</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">
                    {report.firstName} {report.lastName}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Time Spotted</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{formatTime(report.timeSpotted)}</p>
                </div>
              </div>

              {/* Images for Live Incident */}
              {report.files && report.files.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-lg font-bold text-gray-800 mb-4">Attached Images</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.files.map((file, index) => (
                      <img
                        key={index}
                        src={file.downloadUrl}
                        alt={file.fileName}
                        className="w-full h-48 object-cover rounded-lg"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Live Status Indicator */}
              <div className="bg-yellow-50 rounded-lg p-6">
                <span className="badge badge-warning badge-lg">LIVE</span>
                <p className="text-sm text-gray-600 mt-2">
                  This incident is currently live. Full details will be available once completed.
                </p>
              </div>
            </>
          ) : (
            // ============ COMPLETED INCIDENT - Show all fields ============
            <>
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 pb-8 border-b">
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Scheme</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.scheme || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Section</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.section || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Date</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">{report.date || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Submitted By</label>
                  <p className="text-lg font-medium text-gray-800 mt-1">
                    {report.firstName} {report.lastName}
                  </p>
                </div>
              </div>

              {/* Weather & Log Information */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Conditions & Log Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Weather Conditions</label>
                    <p className="text-base text-gray-800 mt-1">{report.weatherConditions || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">NH Log</label>
                    <p className="text-base text-gray-800 mt-1">{report.nhLog || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Collar Number</label>
                    <p className="text-base text-gray-800 mt-1">{report.collarNumber || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Incident Details */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Incident Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Incursion</label>
                    <p className="text-base text-gray-800 mt-1">{report.incursion || 'NO'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Reported By</label>
                    <p className="text-base text-gray-800 mt-1">{report.reportedBy || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Camera Number</label>
                    <p className="text-base text-gray-800 mt-1">{report.cameraNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Traffic Conditions</label>
                    <p className="text-base text-gray-800 mt-1">{report.trafficConditions || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Marker Post</label>
                    <p className="text-base text-gray-800 mt-1">{report.markerPost || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Track</label>
                    <p className="text-base text-gray-800 mt-1">{report.track || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Incident Type</label>
                    <p className="text-base text-gray-800 mt-1">{report.incidentType || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Fault</label>
                    <p className="text-base text-gray-800 mt-1">{report.fault || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Affected Lanes */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Affected Lanes</h4>
                {report.affectedLanes && report.affectedLanes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {report.affectedLanes.map((lane, index) => (
                      <span key={index} className="badge badge-lg bg-teal-100 text-teal-700">
                        {lane}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No affected lanes specified</p>
                )}
              </div>

              {/* Emergency Services */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Emergency Services</h4>
                {report.emergencyServices && report.emergencyServices.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {report.emergencyServices.map((service, index) => (
                      <span key={index} className="badge badge-lg bg-orange-100 text-orange-700">
                        {service}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No emergency services specified</p>
                )}
              </div>

              {/* Recovery Requested */}
              {report.recoveryRequested && (
                <div className='mb-8 pb-8 border-b'>
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                    Recovery Requested
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Light</label>
                      <p className="text-gray-800">{report.recoveryRequested.light || 0}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Heavy</label>
                      <p className="text-gray-800">{report.recoveryRequested.heavy || 0}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">IPV</label>
                      <p className="text-gray-800">{report.recoveryRequested.ipv || 0}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-600">HETOS</label>
                      <p className="text-gray-800">{report.recoveryRequested.hetos || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Time Information */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Time Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Time Spotted</label>
                    <p className="text-base text-gray-800 mt-1">{formatTime(report.timeSpotted)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Time On Site</label>
                    <p className="text-base text-gray-800 mt-1">{formatTime(report.timeOnSite)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase">Time Cleared</label>
                    <p className="text-base text-gray-800 mt-1">{formatTime(report.timeCleared)}</p>
                  </div>
                </div>
              </div>

              {/* Closed Log Information */}
              <div className="mb-8 pb-8 border-b">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Closed Log Information</h4>
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase">Closed Log Collar Number</label>
                  <p className="text-base text-gray-800 mt-1">{report.closedLogCollar || 'N/A'}</p>
                </div>
              </div>

              {/* Vehicles Involved */}
              {report.vehicles && report.vehicles.length > 0 && (
                <div className="mb-8 pb-8 border-b">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                    Vehicles Involved
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="table w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left text-sm font-semibold text-gray-600 px-4 py-2">Type</th>
                          <th className="text-left text-sm font-semibold text-gray-600 px-4 py-2">Make</th>
                          <th className="text-left text-sm font-semibold text-gray-600 px-4 py-2">Model</th>
                          <th className="text-left text-sm font-semibold text-gray-600 px-4 py-2">VIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.vehicles.map((vehicle, index) => (
                          <tr key={index} className="border-b">
                            <td className="px-4 py-2">{vehicle.type || 'N/A'}</td>
                            <td className="px-4 py-2">{vehicle.make || 'N/A'}</td>
                            <td className="px-4 py-2">{vehicle.model || 'N/A'}</td>
                            <td className="px-4 py-2">{vehicle.vin || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="mb-8">
                <h4 className="text-lg font-bold text-gray-800 mb-4">Description of Incident</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {report.description || 'No description provided'}
                  </p>
                </div>
              </div>

              {/* Attached Images */}
              {report.files && report.files.length > 0 && (
                <div className="mb-8 pb-8 border-b">
                  <h4 className="text-lg font-bold text-gray-800 mb-4">Attached Images</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.files.map((file, index) => (
                      <img
                        key={index}
                        src={file.downloadUrl}
                        alt={file.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-48 object-cover rounded-lg"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              )}

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
                    <span className={`ml-2 badge ${
                      report.status === 'completed' ? 'badge-success' : 'badge-warning'
                    }`}>
                      {report.status || 'submitted'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </StaffSidebarLayout>
  );
};

export default LiveIncidentDetailPage;
