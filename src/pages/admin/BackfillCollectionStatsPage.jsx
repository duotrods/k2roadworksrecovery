import { useState } from "react";
import { staffService } from "../../services/staffService";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

// Counters maintained by the hybrid system. `nondemo: true` means we also seed
// the "excluding demo" variant that the dashboards read.
const COUNTERS = [
  { collection: "incidentReports", nondemo: true },
  { collection: "cctvCheckForms", nondemo: true },
  { collection: "assetDamageReports", nondemo: true },
];

const BackfillCollectionStatsPage = () => {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);

  const runBackfill = async () => {
    setRunning(true);
    setResults({});
    for (const { collection, nondemo } of COUNTERS) {
      setResults((prev) => ({ ...prev, [collection]: { status: "running" } }));
      try {
        const total = await staffService.recountCollectionStat(collection, false);
        const nonDemo = nondemo
          ? await staffService.recountCollectionStat(collection, true)
          : null;
        setResults((prev) => ({
          ...prev,
          [collection]: { status: "done", total, nonDemo },
        }));
      } catch (error) {
        setResults((prev) => ({
          ...prev,
          [collection]: { status: "error", error: error.message },
        }));
      }
    }
    setRunning(false);
  };

  const allDone =
    Object.keys(results).length === COUNTERS.length &&
    Object.values(results).every((r) => r.status === "done");

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Backfill Collection Stats
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Seeds/resets the live dashboard counters to the true counts. Safe to
        re-run any time — it recomputes from the actual data, so it also fixes
        any counter that has drifted. Run once after enabling the cache rules
        (staging, then production); the counters then stay live on their own.
      </p>

      {allDone && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-2 text-green-700 font-medium">
          <CheckCircle2 className="w-5 h-5" />
          All counters seeded.
        </div>
      )}

      <div className="space-y-3 mb-6">
        {COUNTERS.map(({ collection }) => {
          const result = results[collection];
          return (
            <div
              key={collection}
              className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
            >
              <p className="font-mono text-sm text-gray-800">{collection}</p>
              <div className="text-sm text-right">
                {!result && <span className="text-gray-400">Pending</span>}
                {result?.status === "running" && (
                  <span className="flex items-center gap-1 text-blue-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Running...
                  </span>
                )}
                {result?.status === "done" && (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    total {result.total}
                    {result.nonDemo !== null && ` · non-demo ${result.nonDemo}`}
                  </span>
                )}
                {result?.status === "error" && (
                  <span className="flex items-center gap-1 text-red-500">
                    <AlertTriangle className="w-4 h-4" /> {result.error}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={runBackfill}
        disabled={running}
        className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2 transition-colors"
      >
        {running && <Loader2 className="w-4 h-4 animate-spin" />}
        {running ? "Running..." : "Run Backfill"}
      </button>
    </div>
  );
};

export default BackfillCollectionStatsPage;
