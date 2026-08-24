import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveIncidents, usePaginatedCompletedIncidents } from '../../hooks/useLiveIncidents';
import { Eye, Download, Radio, CheckCircle, ChevronLeft, ChevronRight, Loader2, Filter, ChevronRight as ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { generateReportPDF } from '../../utils/pdfGenerator';
import { staffService } from '../../services/staffService';
import { SCHEMES } from '../../utils/schemes';
import AdminSidebarLayout from '../../components/layout/AdminSidebarLayout';

const AdminLiveIncidentsPage = () => {
  const navigate = useNavigate();

  // Admins aren't scoped to a single scheme — they pick which one to monitor.
  const [schemeId, setSchemeId] = useState(SCHEMES[0]?.id || '');
  const schemeName = SCHEMES.find((s) => s.id === schemeId)?.fullName || '';

  // Real-time subscription for LIVE incidents only (instant updates)
  const { liveIncidents, loading: liveLoading } = useLiveIncidents(schemeId);

  // Server-side paginated completed incidents (only reads 6 rows per page!)
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
  } = usePaginatedCompletedIncidents(schemeId, 6);

  // When a live incident gets completed, liveIncidents.length decreases.
  // This triggers a refresh of the completed list so it shows up immediately.
  const prevLiveCount = useRef(liveIncidents.length);
  useEffect(() => {
    if (prevLiveCount.current > 0 && liveIncidents.length < prevLiveCount.current) {
      refreshCompleted();
    }
    prevLiveCount.current = liveIncidents.length;
  }, [liveIncidents.length, refreshCompleted]);

  const loading = liveLoading;

  // Client-side pagination for live incidents. Unlike the completed list (which is
  // paginated server-side), live incidents already live in memory via the realtime
  // subscription, so we just slice the array here.
  const LIVE_PAGE_SIZE = 6;
  const [livePage, setLivePage] = useState(1);
  const liveTotalPages = Math.max(1, Math.ceil(liveIncidents.length / LIVE_PAGE_SIZE));

  // Realtime churn (or switching schemes) can shrink the list — clamp to a valid page.
  useEffect(() => {
    if (livePage > liveTotalPages) setLivePage(liveTotalPages);
  }, [livePage, liveTotalPages]);

  // Reset to page 1 whenever the selected scheme changes.
  useEffect(() => {
    setLivePage(1);
  }, [schemeId]);

  const pagedLiveIncidents = useMemo(
    () => liveIncidents.slice((livePage - 1) * LIVE_PAGE_SIZE, livePage * LIVE_PAGE_SIZE),
    [liveIncidents, livePage]
  );

  const formatTime = (dateValue) => {
    if (!dateValue) return 'N/A';
    if (typeof dateValue === 'string' && dateValue.includes(':')) return dateValue;
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  };

  // "Started 5d ago" for recent incidents, falling back to a date for older ones.
  const relativeStart = (createdAt) => {
    if (!createdAt) return null;
    const then = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    if (Number.isNaN(then.getTime())) return null;

    const diffMs = Date.now() - then.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString('en-GB');
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

  const refOf = (incident) =>
    incident.referenceId || `Incident #${incident.id.slice(0, 4)}`;

  const handleViewIncident = (incident) => {
    navigate(`/dashboard/admin/staff-reports/incident/${incident.id}`);
  };

  const handleDownloadPDF = async (incident, e) => {
    e.stopPropagation();
    try {
      // The list row only carries display columns (egress optimization) —
      // fetch the full record before handing it to the PDF generator, which
      // reads ~40 fields.
      const fullIncident = await staffService.getIncidentReportById(incident.id);
      await generateReportPDF(fullIncident, 'incident');
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  return (
    <AdminSidebarLayout>
      <div className="max-w-8xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-semibold text-gray-800 mb-2">Live Incidents</h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">
            Monitor live and completed incidents in real time per scheme
          </p>
        </div>

        {/* Scheme selector */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="relative w-full sm:w-auto max-w-md">
            <Filter className="w-5 h-5 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <select
              value={schemeId}
              onChange={(e) => setSchemeId(e.target.value)}
              className="select text-gray-600 pl-10 bg-white border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            >
              {SCHEMES.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-brand-500"></span>
          </div>
        ) : (
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

                <div className="bg-gray-50 rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {liveIncidents.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-gray-500">No live incidents right now</p>
                      <p className="mt-1 text-xs text-gray-400">New incidents appear here the moment they're logged.</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3 p-3">
                      {pagedLiveIncidents.map((incident) => {
                        const started = relativeStart(incident.createdAt);
                        const detail = [incident.incidentType, incident.markerPost && `MP ${incident.markerPost}`]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <div
                            key={incident.id}
                            onClick={() => handleViewIncident(incident)}
                            className="group flex cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-red-200 hover:shadow-md"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-bold text-gray-900">{refOf(incident)}</span>
                                {schemeName && (
                                  <span className="truncate text-sm text-gray-400">· {schemeName}</span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                                  <Radio className="h-3 w-3" />
                                  Live
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                {started ? `Started ${started}` : `Spotted ${incident.time || formatTime(incident.timeSpotted)}`}
                              </p>
                              {detail && (
                                <span className="mt-2 inline-flex rounded-md bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  {detail}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewIncident(incident); }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                            >
                              View
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {/* Pagination Controls */}
                    {liveTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                        <span className="text-sm text-gray-500">
                          Showing {(livePage - 1) * LIVE_PAGE_SIZE + 1}-{Math.min(livePage * LIVE_PAGE_SIZE, liveIncidents.length)} of {liveIncidents.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLivePage((p) => Math.max(1, p - 1))}
                            disabled={livePage === 1}
                            className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <span className="text-sm font-medium px-2">
                            {livePage} / {liveTotalPages}
                          </span>
                          <button
                            onClick={() => setLivePage((p) => Math.min(liveTotalPages, p + 1))}
                            disabled={livePage === liveTotalPages}
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

                <div className="bg-gray-50 rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {completedLoading ? (
                    <div className="p-6 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                    </div>
                  ) : completedIncidents.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-gray-500">No completed incidents yet</p>
                      <p className="mt-1 text-xs text-gray-400">Cleared incidents are archived here.</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 p-3 overflow-y-auto">
                        {completedIncidents.map((incident) => {
                          const duration = calculateDuration(incident.timeSpotted, incident.timeCleared);
                          const detail = [incident.incidentType, duration && `${duration}`]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <div
                              key={incident.id}
                              onClick={() => handleViewIncident(incident)}
                              className="group flex cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-bold text-gray-900">{refOf(incident)}</span>
                                  {schemeName && (
                                    <span className="truncate text-sm text-gray-400">· {schemeName}</span>
                                  )}
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                                    <CheckCircle className="h-3 w-3" />
                                    Completed
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-gray-500">
                                  Spotted {incident.timeSpotted || 'N/A'} · Cleared {incident.timeCleared || 'N/A'}
                                </p>
                                {detail && (
                                  <span className="mt-2 inline-flex rounded-md bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    {detail}
                                  </span>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  onClick={(e) => handleDownloadPDF(incident, e)}
                                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500"
                                  title="Download PDF"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewIncident(incident); }}
                                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500"
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Pagination Controls */}
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
        )}
      </div>
    </AdminSidebarLayout>
  );
};

export default AdminLiveIncidentsPage;
