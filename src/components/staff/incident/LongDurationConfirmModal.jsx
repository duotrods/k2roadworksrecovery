import { AlertTriangle, Pencil } from "lucide-react";
import { formatMinutes } from "../../../utils/incidentForm";

// Shown when continuing Step 2 with an arrival → cleared duration over
// LONG_JOB_MINUTES, so an AM/PM misclick is caught before it's saved.
// Same layout as StandDownConfirmModal, in amber since it's only a check.
const LongDurationConfirmModal = ({ duration, arrivalTime, clearedTime, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
      </div>

      {/* Text */}
      <h2 className="text-lg font-bold text-gray-800 text-center mb-1">
        Is this job duration correct?
      </h2>
      <p className="text-sm text-gray-500 text-center mb-5">
        Arrived {arrivalTime}, cleared {clearedTime}: that&apos;s{" "}
        <span className="font-semibold text-gray-700">{formatMinutes(duration)}</span>.
        Check AM/PM wasn&apos;t misclicked.
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Change time
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
        >
          Yes, continue
        </button>
      </div>
    </div>
  </div>
);

export default LongDurationConfirmModal;
