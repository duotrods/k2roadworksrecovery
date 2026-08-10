import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import { formatRelativeTime } from "../../utils/relativeTime";

// Two-letter initials from a staff name, for the row avatar. "Rod Staff" → "RS".
const initialsOf = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = (parts[0][0] || "") + (parts.length > 1 ? parts.at(-1)[0] : "");
  return letters.toUpperCase();
};

// "Recent team activity" — the latest submissions by teammates (getRecentActivities
// already excludes the current user's own actions). Reuses the same call shape as
// NoticeBoard. Fails soft and hides the whole section when there's nothing to show.
const TeamActivityFeed = () => {
  const { currentUser, userProfile } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid || !userProfile) return;
    let active = true;
    setLoading(true);
    // Wider window than NoticeBoard's 24h so the feed isn't empty between shifts.
    const since = userProfile.lastLogoutAt
      ? new Date(userProfile.lastLogoutAt)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    staffService
      .getRecentActivities(currentUser.uid, since, "internal")
      .then((rows) => active && setActivities(rows.slice(0, 5)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [currentUser?.uid, userProfile]);

  // Hide entirely while loading or when there's nothing — no empty card.
  if (loading || activities.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        Recent team activity
      </h2>
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <ul className="divide-y divide-gray-100">
          {activities.map((activity, index) => (
            <li key={index} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center shrink-0">
                {initialsOf(activity.staffName)}
              </span>
              <p className="text-sm text-gray-700 min-w-0 flex-1">
                {activity.description}
              </p>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatRelativeTime(activity.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default TeamActivityFeed;
