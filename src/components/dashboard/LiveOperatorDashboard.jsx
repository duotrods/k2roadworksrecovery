import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveOperatorIncidents, usePaginatedCompletedIncidentsForOperator } from '../../hooks/useLiveOperatorIncidents';
import { Eye, Download, Radio, CheckCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { generateReportPDF } from '../../utils/pdfGenerator';

const LiveOperatorDashboard = () => {
  const navigate = useNavigate();

  // Real-time subscription for LIVE incidents (instant updates, cost-effective)
  const { liveIncidents, loading: liveLoading } = useLiveOperatorIncidents();

  // Server-side paginated completed incidents (only reads 10 docs per page!)
  const {
    incidents: completedIncidents,
    loading: completedLoading,
    currentPage,
    totalPages,
    totalCount,
    goToNextPage,
    goToPrevPage,
    refreshCompleted,
    pageSize,
  } = usePaginatedCompletedIncidentsForOperator(6);

  // When a live incident gets completed, liveIncidents.length decreases.
  // This triggers a refresh of the completed list so it shows up immediately.
  const prevLiveCount = useRef(liveIncidents.length);
  useEffect(() => {
    // Only refresh when live count DECREASES (meaning an incident moved to completed)
    if (prevLiveCount.current > 0 && liveIncidents.length < prevLiveCount.current) {
      refreshCompleted();
    }
    prevLiveCount.current = liveIncidents.length;
  }, [liveIncidents.length, refreshCompleted]);

  // Client-side pagination for live incidents (data is already loaded via real-time)
  const [liveCurrentPage, setLiveCurrentPage] = useState(1);
  const livePageSize = 6;
  const liveTotalPages = Math.ceil(liveIncidents.length / livePageSize);
  const paginatedLiveIncidents = liveIncidents.slice(
    (liveCurrentPage - 1) * livePageSize,
    liveCurrentPage * livePageSize
  );

  const formatTime = (dateValue) => {
    if (!dateValue) return 'N/A';
    if (typeof dateValue === 'string' && dateValue.includes(':')) return dateValue;
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  };

  const calculateDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return null;

    const parseTime = (time) => {
      if (!time) return null;
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (start === null || end === null) return null;

    let diff = end - start;
    if (diff < 0) diff += 24 * 60;

    return `${diff}m`;
  };

  const handleViewIncident = (incident) => {
    navigate(`/dashboard/staff/live-incidents/incident/${incident.id}`);
  };

  const handleDownloadPDF = async (incident, e) => {
    e.stopPropagation();
    try {
      await generateReportPDF(incident, 'incident');
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8 bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          Live Operations <span className="text-teal-500">Dashboard</span>
        </h2>
        <p className="text-gray-500">Monitor incident reports in real-time</p>
      </div> 

      {liveLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      ) : (
        <>
          {/* Incident Management Hub */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Live Incidents Column */}
              <div className="flex flex-col">
                <div className="bg-linear-to-br from-red-500 to-red-600 rounded-t-lg px-4 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <Radio className="w-6 h-6 text-red-500" />
                  </div>
                  <span className="text-white font-semibold text-2xl">Live Incidents</span>
                  <span className="ml-auto bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {liveIncidents.length} Active
                  </span>
                </div>

                <div className="bg-white-500 shadow-xs rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {liveIncidents.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No live incidents at this time
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                        {paginatedLiveIncidents.map((incident) => (
                          <div
                            key={incident.id}
                            onClick={() => handleViewIncident(incident)}
                            className="px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-red-400 font-mono font-semibold">
                                  {incident.time || formatTime(incident.timeSpotted)}
                                </span>
                                <span className="text-red-500 font-bold">|</span>
                                <span className="font-medium">
                                  {incident.referenceId || `Incident #${incident.id.slice(0, 4)}`}
                                </span>
                                <span className="text-red-500 font-bold">|</span>
                                <span className="font-medium">
                                  {incident.scheme}
                                </span>
                                <span className="text-red-500 font-bold">|</span>
                                <span className="font-medium">
                                  Marker Post: {incident.markerPost || 'N/A'}
                                </span>
                              </div>
                              <button
                                className="p-1.5 rounded text-blue-400 hover:text-blue-300"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                            {incident.incidentType && (
                              <p className="text-slate-400 text-sm mt-1">
                                {incident.incidentType} - {incident.scheme || 'N/A'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Live Incidents Pagination (client-side) */}
                      {liveTotalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                          <span className="text-sm text-gray-500">
                            Showing {(liveCurrentPage - 1) * livePageSize + 1}-{Math.min(liveCurrentPage * livePageSize, liveIncidents.length)} of {liveIncidents.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLiveCurrentPage(p => Math.max(1, p - 1))}
                              disabled={liveCurrentPage === 1}
                              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-medium px-2">
                              {liveCurrentPage} / {liveTotalPages}
                            </span>
                            <button
                              onClick={() => setLiveCurrentPage(p => Math.min(liveTotalPages, p + 1))}
                              disabled={liveCurrentPage === liveTotalPages}
                              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Completed Incidents Column */}
              <div className="flex flex-col">
                <div className="bg-linear-to-br from-brand-500 to-brand-600 rounded-t-lg px-4 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-white font-semibold text-2xl">Completed Incidents</span>
                  <span className="ml-auto bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {totalCount} Total
                  </span>
                </div>

                <div className="bg-white shadow-xs rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {completedLoading ? (
                    <div className="p-6 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                    </div>
                  ) : completedIncidents.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No completed incidents yet
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-gray-100 overflow-y-auto">
                        {completedIncidents.map((incident) => {
                          const duration = calculateDuration(incident.timeSpotted, incident.timeCleared);
                          return (
                            <div
                              key={incident.id}
                              className="px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => handleViewIncident(incident)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-black font-mono">
                                    {incident.timeSpotted || formatTime(incident.createdAt)}
                                  </span>
                                  <span className="text-green-500 font-bold">|</span>
                                  <span className="font-mono">
                                    Cleared: {incident.timeCleared || 'N/A'}
                                  </span>
                                  <span className="text-green-500 font-bold">|</span>
                                  <span className="text-black font-medium">
                                    {incident.referenceId || `Incident #${incident.id.slice(0, 4)}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => handleDownloadPDF(incident, e)}
                                    className="p-1.5 hover:bg-gray-200 rounded text-purple-500 hover:text-purple-600"
                                    title="Download PDF"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="p-1.5 hover:bg-gray-200 rounded text-blue-400 hover:text-blue-500"
                                    title="View Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                {incident.incidentType && (
                                  <p className="text-slate-400 text-sm">
                                    {incident.incidentType} - {incident.scheme || 'N/A'}
                                  </p>
                                )}
                                {duration && (
                                  <span className="text-slate-400 text-sm">
                                    Duration: <span className="text-black font-semibold">{duration}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Completed Incidents Pagination (server-side) */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                          <span className="text-sm text-gray-500">
                            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={goToPrevPage}
                              disabled={currentPage === 1}
                              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-medium px-2">
                              {currentPage} / {totalPages}
                            </span>
                            <button
                              onClick={goToNextPage}
                              disabled={currentPage === totalPages}
                              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LiveOperatorDashboard;
