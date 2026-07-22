import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  useStaffLiveCCTVFaults,
  usePaginatedCCTVFaults,
} from "../../hooks/useCCTVFaults";
import {
  Eye,
  CameraOff,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  CheckCircle2,
  Send,
  MessageSquare,
} from "lucide-react";
import { USER_ROLES } from "../../utils/constants";
import { SCHEMES } from "../../utils/schemes";
import { clientDataService } from "../../services/clientDataService";
import { toast } from "react-hot-toast";

const formatNoteTime = (addedAt) => {
  if (!addedAt) return "";
  const d = new Date(addedAt);
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

const NoteThread = ({ notes, legacyNote }) => {
  const allNotes = notes?.length
    ? notes
    : legacyNote
      ? [
          {
            text: legacyNote,
            addedAt: null,
            authorRole: "cctvfaultoperator",
            authorName: "Operator",
          },
        ]
      : [];

  if (!allNotes.length) return null;

  // test
  return (
    <div className="space-y-2 pb-2">
      {allNotes.map((note, idx) => {
        const isCCTV = note.authorRole === "cctvfaultoperator";
        return (
          <div
            key={idx}
            className={`flex flex-col ${isCCTV ? "items-end" : "items-start"}`}
          >
            <div
              className={`px-3 py-2 rounded-xl text-sm max-w-[85%] ${
                isCCTV
                  ? "bg-teal-500 text-white rounded-tr-sm"
                  : "bg-blue-100 text-blue-900 rounded-tl-sm"
              }`}
            >
              {note.text}
            </div>
            <span className="text-xs text-gray-400 mt-0.5">
              {note.authorName || (isCCTV ? "Operator" : "Staff")}
              {note.addedAt && ` · ${formatNoteTime(note.addedAt)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const LiveCameraFaultsPage = ({
  hideDashboardLink = false,
  faultBasePath = "/dashboard/client/cctv-fault",
}) => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  // Clients migrated from the removed 'cctvfaultoperator' role keep note-writing
  // rights via this capability flag; plain clients remain acknowledge-only.
  const canAddNote =
    role === USER_ROLES.CLIENT && userProfile?.canManageCCTVFaults === true;
  const authorName = userProfile?.displayName || userProfile?.name || "";
  // Notes/acknowledgments from canManageCCTVFaults clients keep the
  // 'cctvfaultoperator' discriminator so historical bubble styling/attribution
  // (see NoteThread's isCCTV check) continues to work now that the live role
  // value is always 'client'.
  const noteAuthorRole = canAddNote ? "cctvfaultoperator" : role;

  // Restrict to assigned schemes when the operator has been assigned specific schemes
  const operatorSchemeIds = userProfile?.schemeIds?.length > 0
    ? userProfile.schemeIds
    : null;

  // Real-time subscription scoped to assigned schemes (or all if none assigned)
  const { faults: recentFaults, loading: recentLoading } =
    useStaffLiveCCTVFaults(operatorSchemeIds);

  // Server-side paginated completed fault history scoped to first assigned scheme
  const {
    faults: historyFaults,
    loading: historyLoading,
    currentPage,
    totalPages,
    totalCount,
    goToNextPage,
    goToPrevPage,
    refresh: refreshHistory,
    pageSize,
  } = usePaginatedCCTVFaults(operatorSchemeIds?.[0] ?? null, 6);

  // When a live fault gets completed, auto-refresh history
  const prevLiveFaultCount = useRef(recentFaults.length);
  useEffect(() => {
    if (
      prevLiveFaultCount.current > 0 &&
      recentFaults.length < prevLiveFaultCount.current
    ) {
      refreshHistory();
    }
    prevLiveFaultCount.current = recentFaults.length;
  }, [recentFaults.length, refreshHistory]);

  // Per-fault note state for first-time acknowledgment
  const [notes, setNotes] = useState({});
  const [acknowledging, setAcknowledging] = useState({});
  // Note input text per fault (for adding notes after acknowledged)
  const [newNotes, setNewNotes] = useState({});
  const [savingNote, setSavingNote] = useState({});
  // Per-fault notes thread open/closed
  const [notesOpen, setNotesOpen] = useState({});
  const seenNoteCountRef = useRef({});
  const toggleNotes = (faultId, noteCount) =>
    setNotesOpen((prev) => {
      const opening = !prev[faultId];
      if (opening) seenNoteCountRef.current[faultId] = noteCount;
      return { ...prev, [faultId]: opening };
    });

  const hasNewNote = (fault) => {
    const faultNotes = fault.clientNotes || [];
    if (!faultNotes.some((n) => n.authorRole !== "cctvfaultoperator")) return false;
    const seen = seenNoteCountRef.current[fault.id] ?? 0;
    return faultNotes.length > seen;
  };

  const handleAcknowledge = async (fault) => {
    if (fault.clientAcknowledged) return;
    setAcknowledging((prev) => ({ ...prev, [fault.id]: true }));
    try {
      await clientDataService.acknowledgeCCTVFault(
        fault.id,
        notes[fault.id] || "",
        noteAuthorRole,
        authorName,
      );
      toast.success("Fault acknowledged — staff have been notified.");
    } catch {
      toast.error("Failed to acknowledge fault. Please try again.");
    } finally {
      setAcknowledging((prev) => ({ ...prev, [fault.id]: false }));
    }
  };

  const handleSendNote = async (fault) => {
    const text = (newNotes[fault.id] || "").trim();
    if (!text) return;
    setSavingNote((prev) => ({ ...prev, [fault.id]: true }));
    try {
      await clientDataService.addClientNote(fault.id, text, noteAuthorRole, authorName);
      setNewNotes((prev) => ({ ...prev, [fault.id]: "" }));
    } catch {
      toast.error("Failed to add note. Please try again.");
    } finally {
      setSavingNote((prev) => ({ ...prev, [fault.id]: false }));
    }
  };

  const handleViewFault = (fault) => {
    navigate(`${faultBasePath}/${fault.id}`);
  };

  return (
    <div>
      {/* Header with Back Button — hidden for cctvfaultoperator */}
      {!hideDashboardLink && (
        <div className="mb-8 bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => navigate("/dashboard/client")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h4 className="font-bold text-gray-800">
                Go Back to{" "}
                <span className="font-semibold text-brand-400">Dashboard</span>
              </h4>
            </div>
          </div>
        </div>
      )}

      {recentLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      ) : (
        <>
          <div className="mb-8 bg-white rounded-xl text-center p-6 shadow-sm">
            <h4 className="font-bold text-gray-800">Camera Fault Reports</h4>
            <p className="text-gray-500">
              {operatorSchemeIds
                ? operatorSchemeIds
                    .map((id) => {
                      const s = SCHEMES.find((s) => s.id === id);
                      return s ? s.name : id;
                    })
                    .join(", ")
                : "All schemes"}{" "}
              — live and completed faults
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Live Faults Column — real-time feed */}
              <div className="flex flex-col">
                <div className="bg-linear-to-br from-red-500 to-red-600 rounded-t-lg px-4 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <CameraOff className="w-6 h-6 text-red-500" />
                  </div>
                  <span className="text-white font-semibold text-2xl">
                    Live Faults
                  </span>
                  <span className="ml-auto bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {recentFaults.length} Active
                  </span>
                </div>

                <div className="bg-white shadow-xs rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {recentFaults.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No active camera faults
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                      {recentFaults.map((fault) => (
                        <div key={fault.id} className="px-4 py-4">
                          {/* Top row */}
                          <div className="flex items-center justify-between">
                            <div
                              className="flex items-center gap-3 flex-wrap cursor-pointer"
                              onClick={() => handleViewFault(fault)}
                            >
                              <span className="text-red-400 font-mono font-semibold">
                                {fault.time || "N/A"}
                              </span>
                              <span className="text-red-500 font-bold">|</span>
                              <span className="font-medium">
                                {fault.referenceId ||
                                  `Fault #${fault.id.slice(0, 6)}`}
                              </span>
                              <span className="text-red-500 font-bold">|</span>
                              <span className="font-medium text-gray-700">
                                {fault.camera || "N/A"}
                              </span>
                              <span className="text-red-500 font-bold">|</span>
                              <span className="font-medium text-gray-700">
                                {fault.scheme || "N/A"}
                              </span>
                            </div>
                            <button
                              onClick={() => handleViewFault(fault)}
                              className="p-1.5 rounded text-blue-400 hover:text-blue-300"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Date + comment */}
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-slate-400 text-sm">
                              Date: {fault.date || "N/A"}
                            </p>
                            {fault.comments && (
                              <>
                                <span className="text-slate-300">•</span>
                                <p className="text-slate-400 text-sm truncate max-w-xs">
                                  {fault.comments}
                                </p>
                              </>
                            )}
                          </div>

                          {/* Notes thread + acknowledgment */}
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            {/* Collapsible notes toggle */}
                            {(() => {
                              const count =
                                fault.clientNotes?.length ||
                                (fault.clientNote ? 1 : 0);
                              const isOpen = notesOpen[fault.id];
                              const newNote = hasNewNote(fault) && !isOpen;
                              return count > 0 ? (
                                <button
                                  onClick={() => toggleNotes(fault.id, count)}
                                  className={`flex items-center gap-2 text-xs mb-2 rounded px-1.5 py-0.5 transition-colors ${newNote ? "text-red-500 bg-red-50 hover:bg-red-100" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                  <span className="relative">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {newNote && (
                                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                                    )}
                                  </span>
                                  <span>
                                    {count} {count === 1 ? "note" : "notes"}
                                  </span>
                                  {isOpen ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              ) : null;
                            })()}
                            {/* Chat thread — real-time via onSnapshot */}
                            {notesOpen[fault.id] && (
                              <NoteThread
                                notes={fault.clientNotes}
                                legacyNote={fault.clientNote}
                              />
                            )}

                            {fault.clientAcknowledged ? (
                              <>
                                <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-2">
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  <span>Acknowledged</span>
                                </div>
                                {/* Chat input for CCTV operators */}
                                {canAddNote && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="Add a note..."
                                      value={newNotes[fault.id] || ""}
                                      onChange={(e) =>
                                        setNewNotes((prev) => ({
                                          ...prev,
                                          [fault.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault();
                                          handleSendNote(fault);
                                        }
                                      }}
                                      disabled={savingNote[fault.id]}
                                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                                    />
                                    <button
                                      onClick={() => handleSendNote(fault)}
                                      disabled={
                                        savingNote[fault.id] ||
                                        !(newNotes[fault.id] || "").trim()
                                      }
                                      className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg disabled:opacity-50 transition-colors"
                                    >
                                      {savingNote[fault.id] ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Send className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="space-y-2">
                                {canAddNote && (
                                  <textarea
                                    rows={2}
                                    placeholder="Add a note (e.g. will fix on Tuesday)..."
                                    value={notes[fault.id] || ""}
                                    onChange={(e) =>
                                      setNotes((prev) => ({
                                        ...prev,
                                        [fault.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
                                  />
                                )}
                                {canAddNote && (
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      className="checkbox checkbox-sm checkbox-success"
                                      disabled={acknowledging[fault.id]}
                                      onChange={(e) => {
                                        if (e.target.checked)
                                          handleAcknowledge(fault);
                                      }}
                                    />
                                    <span className="text-sm text-gray-600">
                                      {acknowledging[fault.id]
                                        ? "Sending acknowledgment..."
                                        : "Mark as received / acknowledged"}
                                    </span>
                                  </label>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Fault History Column — paginated completed faults */}
              <div className="flex flex-col">
                <div className="bg-linear-to-br from-brand-500 to-brand-600 rounded-t-lg px-4 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <Clock className="w-6 h-6 text-brand-500" />
                  </div>
                  <span className="text-white font-semibold text-2xl">
                    Fault History
                  </span>
                  <span className="ml-auto bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {totalCount} Completed
                  </span>
                </div>

                <div className="bg-white shadow-xs rounded-b-lg flex-1 overflow-hidden border border-t-0 border-gray-100">
                  {historyLoading ? (
                    <div className="p-6 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                    </div>
                  ) : historyFaults.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No completed fault reports yet
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-gray-100 overflow-y-auto">
                        {historyFaults.map((fault) => (
                          <div
                            key={fault.id}
                            className="px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handleViewFault(fault)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-gray-700">
                                  {fault.time || "N/A"}
                                </span>
                                <span className="text-brand-500 font-bold">
                                  |
                                </span>
                                <span className="text-black font-mono">
                                  {fault.date || "N/A"}
                                </span>
                                <span className="text-brand-500 font-bold">
                                  |
                                </span>
                                <span className="text-black font-medium">
                                  {fault.referenceId ||
                                    `Fault #${fault.id.slice(0, 6)}`}
                                </span>
                                <span className="text-black font-medium">
                                  {fault.scheme || "N/A"}
                                </span>
                              </div>
                              <button
                                className="p-1.5 hover:bg-gray-200 rounded text-blue-400 hover:text-blue-500"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-slate-400 text-sm">
                                Camera:{" "}
                                <span className="font-medium text-gray-700">
                                  {fault.camera || "N/A"}
                                </span>
                              </p>
                              <div className="flex items-center gap-2">
                                {fault.clientAcknowledged && (
                                  <CheckCircle2
                                    className="w-4 h-4 text-green-500"
                                    title="Client acknowledged"
                                  />
                                )}
                                {fault.completedBy?.name && (
                                  <span className="text-slate-400 text-sm">
                                    By:{" "}
                                    <span className="text-black font-semibold">
                                      {fault.completedBy.name}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                          <span className="text-sm text-gray-500">
                            Showing {(currentPage - 1) * pageSize + 1}–
                            {Math.min(currentPage * pageSize, totalCount)} of{" "}
                            {totalCount}
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

export default LiveCameraFaultsPage;
