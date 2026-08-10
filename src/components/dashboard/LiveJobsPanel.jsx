import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Radio } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import { formatRelativeTime, liveJobStepLabel } from "../../utils/relativeTime";

// "Your live jobs" — the current operator's own in-progress Job Sheets, each
// resumable from the dashboard. Reads only their own live incidents (see
// staffService.getMyLiveIncidents) and fails soft: an empty or errored result
// just shows the quiet empty-state line, never breaking the dashboard.
const LiveJobsPanel = ({ basePath }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile?.uid) return;
    let active = true;
    setLoading(true);
    staffService
      .getMyLiveIncidents(userProfile.uid)
      .then((rows) => active && setJobs(rows))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userProfile?.uid]);

  const resume = (id) =>
    navigate(`${basePath}/forms/incident-report?edit=${id}`);

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/15" />
        Your live jobs
        {jobs.length > 0 && (
          <span className="text-sm font-medium text-gray-400">
            · {jobs.length}
          </span>
        )}
      </h2>

      {loading ? (
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 flex justify-center">
          <span className="loading loading-spinner text-brand-500" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
          <p className="text-sm text-gray-500">
            No live jobs right now. Start a new Job Sheet above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              role="button"
              tabIndex={0}
              onClick={() => resume(job.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  resume(job.id);
                }
              }}
              className="bg-white rounded-xl shadow-md p-4 sm:p-5 flex items-center justify-between gap-4 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">
                    {job.referenceId || "Job Sheet"}
                    {job.scheme && (
                      <span className="font-normal text-gray-500">
                        {" "}
                        · {job.scheme}
                      </span>
                    )}
                  </p>
                  <span className="badge badge-error badge-soft shrink-0">
                    <Radio className="w-3.5 h-3.5 text-red-500" />
                    Live
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Started {formatRelativeTime(job.createdAt)}
                </p>
                <span className="inline-block mt-2 text-xs font-semibold text-brand-600 bg-brand-50 rounded-full px-2.5 py-0.5">
                  {liveJobStepLabel(job.currentStep)}
                </span>
              </div>
              <span className="flex items-center gap-1 shrink-0 px-4 py-2 bg-brand-500 text-white rounded-lg font-semibold text-sm">
                Resume
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveJobsPanel;
