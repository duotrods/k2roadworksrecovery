import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import NoticeBoard from "../staff/NoticeBoard";
import LiveJobsPanel from "./LiveJobsPanel";
import TeamActivityFeed from "./TeamActivityFeed";
import { AlertTriangle, Truck, Car, FilePlus, ChevronRight, ShieldCheck } from "lucide-react";
import { getViewerSchemeScope } from "../../utils/schemes";
import { getStaffBasePath } from "../../utils/constants";

// Time-of-day greeting for the dashboard header.
const greetingFor = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const NewStaffDashboard = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  // Scheme scope for this viewer: TP staff → their company schemes; real staff →
  // all internal (non-demo, non-TP) schemes; demo → demo scheme.
  const schemeScope = getViewerSchemeScope(userProfile);
  // Check if notice board has been shown in this session
  const [showNoticeBoard, setShowNoticeBoard] = useState(() => {
    const hasSeenNotice = sessionStorage.getItem("hasSeenNoticeBoard");
    return !hasSeenNotice; // Show only if not seen yet
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    setLoading(true);
    loadStatCounts().finally(() => setLoading(false));
  }, [userProfile?.uid]);

  const loadStatCounts = async () => {
    try {
      const counts = await staffService.getAllFormsCountByType(schemeScope);
      setStats(counts);
    } catch (error) {
      console.warn("Could not load stat counts:", error);
    }
  };

  // All cards share one brand color now (icon + label carry the distinction) —
  // color is kept free for status/alert states instead of decoration.
  const statCards = [
    {
      title: "Total Vehicle Dispatched",
      count: stats?.dispatchedThisWeekTotal || 0,
      icon: AlertTriangle,
    },
    {
      title: "IPV Recovery",
      count: stats?.ipvRecoveryTotal || 0,
      icon: Truck,
    },
    {
      title: "Light Recovery",
      count: stats?.lightRecoveryTotal || 0,
      icon: Car,
    },
    {
      title: "Heavy Recovery",
      count: stats?.heavyRecoveryTotal || 0,
      icon: Truck,
    },
     {
      title: "Police On Scene",
      count: stats?.policeOnSceneTotal || 0,
      icon: Truck,
    },
  ];

  // Whole CTA cards are clickable (not just the button inside them); this
  // keeps them keyboard-operable too.
  const goTo = (path) => navigate(path);
  const handleCardKeyDown = (e, path) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goTo(path);
    }
  };

  const handleCloseNoticeBoard = () => {
    // Mark notice board as seen in this session
    sessionStorage.setItem("hasSeenNoticeBoard", "true");
    setShowNoticeBoard(false);
  };

  return (
    <>
      <NoticeBoard isOpen={showNoticeBoard} onClose={handleCloseNoticeBoard} />

      <div>
        {/* Welcome Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            {greetingFor()},{" "}
            <span className="text-brand-500">{userProfile?.displayName}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>

        {/* Statistics Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-brand-500"></span>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              This week
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6 mb-6 sm:mb-8">
              {statCards.map((card, index) => (
                <div
                  key={index}
                  className={`bg-white rounded-xl shadow-md p-4 sm:p-6 hover:shadow-lg transition-shadow ${
                    index === statCards.length - 1 && statCards.length % 2 === 1
                      ? "col-span-2 lg:col-span-1"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
                      <card.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h5 className="text-xs sm:text-sm font-medium text-gray-600 leading-tight">
                      {card.title}
                    </h5>
                  </div>

                  <div className="mt-2">
                    <span className="text-3xl sm:text-4xl font-bold text-gray-800">
                      {card.count}
                    </span>
                    <p className="text-xs sm:text-sm text-gray-400 mt-1">This week</p>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Start something new
            </h2>

            {/* New Job Sheet CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => goTo(`${basePath}/forms/incident-report`)}
              onKeyDown={(e) => handleCardKeyDown(e, `${basePath}/forms/incident-report`)}
              className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex flex-col md:flex-row md:items-center items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
                    <FilePlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">
                      Create a new Job Sheet
                    </h3>
                    <p className="text-sm text-gray-500">
                      Log a K2 Vehicle Recovery Job Sheet for a new job.
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`${basePath}/forms/incident-report`);
                  }}
                  className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold flex items-center justify-center gap-2 shrink-0 w-full md:w-auto"
                >
                  + New Job Sheet
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* New Cabin H&S Check CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => goTo(`${basePath}/forms/cabin-safety-check`)}
              onKeyDown={(e) => handleCardKeyDown(e, `${basePath}/forms/cabin-safety-check`)}
              className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow cursor-pointer mt-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex flex-col md:flex-row md:items-center items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">
                      Create a new Cabin H&S Check
                    </h3>
                    <p className="text-sm text-gray-500">
                      Complete the monthly cabin health & safety inspection checklist.
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`${basePath}/forms/cabin-safety-check`);
                  }}
                  className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold flex items-center justify-center gap-2 shrink-0 w-full md:w-auto"
                >
                  + New Cabin H&S Check
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* New Vehicle Check CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => goTo(`${basePath}/forms/vehicle-daily-check`)}
              onKeyDown={(e) => handleCardKeyDown(e, `${basePath}/forms/vehicle-daily-check`)}
              className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow cursor-pointer mt-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex flex-col md:flex-row md:items-center items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">
                      Create a new Vehicle Check
                    </h3>
                    <p className="text-sm text-gray-500">
                      Log the Recovery Vehicle Daily Check Sheet for the week.
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`${basePath}/forms/vehicle-daily-check`);
                  }}
                  className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold flex items-center justify-center gap-2 shrink-0 w-full md:w-auto"
                >
                  + New Vehicle Check
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-8">
              <LiveJobsPanel basePath={basePath} />
              <TeamActivityFeed />
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default NewStaffDashboard;
