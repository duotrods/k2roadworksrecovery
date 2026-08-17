import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Confirms the destructive "Recovery Stood Down" action on Step 2 of the
// incident form — deleting the live job sheet is permanent, so this mirrors
// LogoutConfirmModal's danger-confirm pattern rather than a plain window.confirm.
const StandDownConfirmModal = ({ onConfirm, onCancel }) => {
  const [standingDown, setStandingDown] = useState(false);

  const handleConfirm = async () => {
    if (standingDown) return;
    setStandingDown(true);
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">
          Stand down this recovery?
        </h2>
        <p className="text-sm text-gray-500 text-center mb-5">
          This will permanently delete the job sheet. This action cannot be undone.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={standingDown}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={standingDown}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:bg-red-700 disabled:cursor-not-allowed"
          >
            <AlertTriangle className="w-4 h-4" />
            {standingDown ? "Standing down..." : "Stand Down"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StandDownConfirmModal;
