import { useState } from "react";
import { supabase } from "../../config/supabase";
import { isVideoFile } from "../../utils/fileType";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

// Number of concurrent update requests — a one-time admin utility, not
// performance-critical, so this just caps concurrency rather than batching.
const CONCURRENCY = 20;

const BackfillHasVideoPage = () => {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const runBackfill = async () => {
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("incident_reports")
        .select("id, files, has_video");
      if (fetchError) throw fetchError;

      const rows = data || [];
      let scanned = 0;
      let withVideo = 0;
      let updated = 0;

      // Only update when the stored value is missing or wrong — keeps the
      // backfill idempotent and minimizes writes on re-runs.
      const mismatches = [];
      for (const row of rows) {
        scanned += 1;
        const computed = (row.files || []).some(isVideoFile);
        if (computed) withVideo += 1;
        if (row.has_video !== computed) mismatches.push({ id: row.id, has_video: computed });
      }

      for (let i = 0; i < mismatches.length; i += CONCURRENCY) {
        const chunk = mismatches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map(({ id, has_video }) =>
            supabase.from("incident_reports").update({ has_video }).eq("id", id),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
        updated += chunk.length;
      }

      setResult({ scanned, withVideo, updated });
    } catch (err) {
      console.error("hasVideo backfill failed:", err);
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Backfill hasVideo
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        One-time utility. Scans every incident report and sets the{" "}
        <code>hasVideo</code> flag so the CCTV Recordings page can query video
        reports directly. Idempotent — safe to re-run; it only writes documents
        whose flag is missing or wrong. Run once per environment (staging, then
        production).
      </p>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
          <div className="flex items-center gap-2 font-medium mb-1">
            <CheckCircle2 className="w-5 h-5" />
            Backfill complete.
          </div>
          <p className="text-sm">
            Scanned {result.scanned} reports · {result.withVideo} have video ·{" "}
            {result.updated} updated.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5" /> {error}
        </div>
      )}

      <button
        onClick={runBackfill}
        disabled={running}
        className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2 transition-colors"
      >
        {running && <Loader2 className="w-4 h-4 animate-spin" />}
        {running ? "Running backfill..." : "Run Backfill"}
      </button>
    </div>
  );
};

export default BackfillHasVideoPage;
