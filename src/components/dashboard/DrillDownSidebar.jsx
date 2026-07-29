import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

// Slide-in panel listing the incidents behind a clicked chart bar/metric.
// Rendered in a portal so it never affects page scroll. Presentation only —
// the parent owns the drillDown state and navigation.
const DrillDownSidebar = ({ drillDown, onClose, onNavigate }) => {
  if (!drillDown) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(3px)",
          animation: "fadeInBackdrop 0.25s ease",
        }}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white"
        style={{
          width: "480px",
          boxShadow:
            "-8px 0 40px rgba(0,0,0,0.18), -1px 0 0 rgba(0,0,0,0.06)",
          animation: "slideInRight 0.3s cubic-bezier(0.25,1,0.5,1)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-cente bg-brand-500 justify-between px-6 py-5 shrink-0"
         
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white leading-tight">
                {drillDown.title}
              </h4>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {drillDown.incidents.length} incident
                {drillDown.incidents.length !== 1 ? "s" : ""} matched
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="drilldown-close-btn flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Sub-header */}
        <div
          className="flex items-center justify-between px-6 py-2.5 shrink-0"
          style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#9ca3af" }}
          >
            Incident Records
          </span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: "#0865ad", color: "#ffffff" }}
          >
            Tap row to open
          </span>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 py-2">
          {drillDown.incidents.map((inc, idx) => (
            <div
              key={inc.id}
              className="drilldown-row flex items-center gap-4 px-6 py-4 cursor-pointer"
              onClick={() => onNavigate(inc.id)}
            >
              {/* Index badge */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: "#0865ad", color: "#ffffff" }}
              >
                {idx + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: "#0865ad", color: "#ffffff" }}
                  >
                    {inc.referenceId || inc.id?.slice(0, 10)}
                  </span>
                  {inc.incidentType && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full truncate max-w-[120px]"
                      style={{ background: "#0865ad", color: "#ffffff" }}
                    >
                      {inc.incidentType}
                    </span>
                  )}
                </div>
                <p className="text-xs truncate" style={{ color: "#6b7280" }}>
                  {[inc.markerPost || inc.section, inc.date]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {inc.submittedBy?.name && (
                  <p
                    className="text-xs mt-0.5 truncate"
                    style={{ color: "#9ca3af" }}
                  >
                    {inc.submittedBy.name}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 shrink-0"
                style={{ color: "#d1d5db" }}
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: "1px solid #e5e7eb", background: "#f8fafc" }}
        >
          <p className="text-xs" style={{ color: "#9ca3af" }}>
            {drillDown.incidents.length} result
            {drillDown.incidents.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={onClose}
            className="drilldown-footer-btn text-xs font-semibold px-4 py-2 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .drilldown-row {
          border-bottom: 1px solid #f3f4f6;
          background: transparent;
          transition: background 0.1s;
        }
        .drilldown-row:hover { background: #e6f0f7; }
        .drilldown-close-btn {
          background: rgba(255,255,255,0.15);
          transition: background 0.15s;
        }
        .drilldown-close-btn:hover { background: rgba(255,255,255,0.28); }
        .drilldown-footer-btn {
          background: #e5e7eb;
          color: #374151;
          transition: background 0.15s;
        }
        .drilldown-footer-btn:hover { background: #d1d5db; }
      `}</style>
    </>,
    document.body,
  );
};

export default DrillDownSidebar;
