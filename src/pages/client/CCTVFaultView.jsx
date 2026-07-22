import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Camera, Calendar, Clock, User, MessageSquare, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { clientDataService } from '../../services/clientDataService';
import { useAuth } from '../../hooks/useAuth';
import { USER_ROLES } from '../../utils/constants';
import ClientSidebarLayout from '../../components/layout/ClientSidebarLayout';

const formatNoteTime = (addedAt) => {
  if (!addedAt) return '';
  const d = new Date(addedAt);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

const ReadOnlyNoteThread = ({ notes, legacyNote }) => {
  const allNotes = notes?.length
    ? notes
    : legacyNote
    ? [{ text: legacyNote, addedAt: null, authorRole: 'cctvfaultoperator', authorName: 'Operator' }]
    : [];

  if (!allNotes.length) return <p className="text-xs text-gray-400 text-center py-2">No notes yet.</p>;

  return (
    <div className="space-y-2 py-2">
      {allNotes.map((note, idx) => {
        const isCCTV = note.authorRole === 'cctvfaultoperator';
        return (
          <div key={idx} className={`flex flex-col ${isCCTV ? 'items-end' : 'items-start'}`}>
            <div className={`px-3 py-2 rounded-xl text-sm max-w-[80%] ${
              isCCTV
                ? 'bg-teal-500 text-white rounded-tr-sm'
                : 'bg-blue-100 text-blue-900 rounded-tl-sm'
            }`}>
              {note.text}
            </div>
            <span className="text-xs text-gray-400 mt-0.5">
              {note.authorName || (isCCTV ? 'Operator' : 'Staff')}
              {note.addedAt && ` · ${formatNoteTime(note.addedAt)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const CCTVFaultView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, userProfile } = useAuth();
  const Layout = ClientSidebarLayout;
  const [fault, setFault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threadOpen, setThreadOpen] = useState(false);

  useEffect(() => {
    loadFault();
  }, [id]);

  const loadFault = async () => {
    try {
      setLoading(true);
      const data = await clientDataService.getCCTVFaultById(id);
      if (data) {
        // For clients, verify the fault belongs to their active scheme
        if (role === USER_ROLES.CLIENT) {
          const activeScheme = userProfile?.activeSchemeId;
          const faultSchemes = data.schemeIds || [];
          if (activeScheme && !faultSchemes.includes(activeScheme)) {
            navigate(-1);
            return;
          }
        }
        setFault(data);
      } else {
        toast.error('Fault report not found');
        navigate(-1);
      }
    } catch (error) {
      console.error('Failed to load fault report:', error);
      toast.error('Failed to load fault report');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <span className="loading loading-spinner loading-lg text-brand-500"></span>
        </div>
      </Layout>
    );
  }

  if (!fault) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500">Fault report not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h3 className="text-2xl font-bold text-gray-800">
              CCTV Fault Report
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Reference: {fault.referenceId || fault.id.slice(0, 12)}
            </p>
          </div>
        </div>

        {/* Fault Details Card */}
        <div className="bg-white rounded-xl shadow-md p-8 space-y-6">
          {/* Status Banner */}
          {fault.status === 'completed' ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-700">Fault Resolved</p>
                <p className="text-sm text-green-600">
                  Camera <span className="font-bold">{fault.camera || 'N/A'}</span> — {fault.scheme || 'N/A'}
                  {fault.completedBy?.name && (
                    <span className="ml-1">· Completed by <span className="font-bold">{fault.completedBy.name}</span></span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-lg">
              <Camera className="w-6 h-6 text-red-500 shrink-0" />
              <div>
                <p className="font-semibold text-red-700">Camera Fault — Live</p>
                <p className="text-sm text-red-500">
                  Camera <span className="font-bold">{fault.camera || 'N/A'}</span> — {fault.scheme || 'N/A'}
                </p>
              </div>
            </div>
          )}

          {/* Client Acknowledgment */}
          {fault.clientAcknowledged && (
            <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0" />
              <p className="font-semibold text-teal-700 text-sm">You have acknowledged this fault.</p>
            </div>
          )}

          {/* Details Grid */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Report Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-sm font-semibold text-gray-500">Date</label>
                  <p className="text-gray-800 mt-0.5">{fault.date || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-sm font-semibold text-gray-500">Time</label>
                  <p className="text-gray-800 mt-0.5">{fault.time || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Camera className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-sm font-semibold text-gray-500">Camera</label>
                  <p className="text-gray-800 mt-0.5">{fault.camera || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-sm font-semibold text-gray-500">Reported By</label>
                  <p className="text-gray-800 mt-0.5">
                    {fault.submittedBy?.name || fault.fullName || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Camera className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <label className="text-sm font-semibold text-gray-500">Scheme</label>
                  <p className="text-gray-800 mt-0.5">{fault.scheme || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comments */}
          {fault.comments && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Fault Description
              </h4>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap leading-relaxed">
                {fault.comments}
              </p>
            </div>
          )}

          {/* Staff / Operator Notes — read-only for client */}
          {(() => {
            const hasNotes = fault.clientNotes?.length || fault.clientNote;
            if (!hasNotes) return null;
            return (
              <div>
                <button
                  onClick={() => setThreadOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 text-left mb-2"
                >
                  <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Notes
                    <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {fault.clientNotes?.length || (fault.clientNote ? 1 : 0)}
                    </span>
                  </h4>
                  {threadOpen
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
                {threadOpen && (
                  <div className="bg-gray-50 rounded-lg px-4 pb-3 border border-gray-100">
                    <ReadOnlyNoteThread notes={fault.clientNotes} legacyNote={fault.clientNote} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-500">
              <div>
                <label className="font-semibold">Submitted:</label>{' '}
                {formatDateTime(fault.createdAt)}
              </div>
              {fault.updatedAt && (
                <div>
                  <label className="font-semibold">Last Updated:</label>{' '}
                  {formatDateTime(fault.updatedAt)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CCTVFaultView;
