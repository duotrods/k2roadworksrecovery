import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { staffService } from '../../services/staffService';
import { useAuth } from '../../hooks/useAuth';

const NoticeBoard = ({ isOpen, onClose }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, userProfile } = useAuth();
  const staffGroup = "internal";

  useEffect(() => {
    if (isOpen && userProfile) {
      loadActivities();
    }
  }, [isOpen, userProfile]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const lastLogout = userProfile?.lastLogoutAt
        ? new Date(userProfile.lastLogoutAt)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentActivities = await staffService.getRecentActivities(currentUser.uid, lastLogout, staffGroup);
      // Handover notes always appear at the top
      const sorted = [
        ...recentActivities.filter((a) => a.type === "logout_note"),
        ...recentActivities.filter((a) => a.type !== "logout_note"),
      ];
      setActivities(sorted);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-brand-500 to-brand-600 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Important Notice!</h2>
              <p className="text-brand-100">Here are some updates while you were away!</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-lg text-brand-500"></span>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No new updates since your last visit.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activities.map((activity) => {
                const isNote = activity.type === "logout_note";
                return (
                  <div
                    key={activity.id}
                    className={`flex items-start gap-3 p-4 rounded-lg transition-colors ${
                      isNote
                        ? "bg-red-50 hover:bg-red-100 border border-red-200"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 ${isNote ? "bg-red-500" : "bg-brand-500"}`} />
                    <div className="flex-1">
                      {isNote && (
                        <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-0.5">
                          Handover Note · {activity.staffName}
                        </p>
                      )}
                      <p className={`font-medium ${isNote ? "text-red-800" : "text-gray-800"}`}>
                        {activity.description}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 font-semibold transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoticeBoard;
