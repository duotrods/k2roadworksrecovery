import { AlertTriangle, Clock } from "lucide-react";
import {
  minutesBetween,
  currentTimeHHMM,
  formatMinutes,
  LONG_JOB_MINUTES,
} from "../../../utils/incidentForm";

// Time Cleared input for Step 2 of the incident form, with a "Now" shortcut
// and an inline warning when the job looks implausibly long — usually an
// AM/PM misclick on a 12-hour time picker (01:04 picked instead of 13:04).
const TimeClearedField = ({
  label,
  value,
  arrivalTime,
  onChange,
  required = false,
  hint,
  className = "w-full",
}) => {
  const duration = minutesBetween(arrivalTime, value);
  const isLong = duration !== null && duration > LONG_JOB_MINUTES;

  return (
    <div>
      <label className="label">
        <span className="label-text font-semibold mb-2 mr-2">
          {label} <span className="text-red-500">*</span>
        </span>
      </label>
      <div className={`flex gap-2 ${className}`}>
        <input
          type="time"
          name="timeCompleted"
          value={value}
          onChange={onChange}
          className={`input bg-white rounded-lg hover:bg-gray-100 flex-1 min-w-0 ${isLong ? "border-amber-400" : "border-gray-300"}`}
          required={required}
        />
        <button
          type="button"
          onClick={() =>
            onChange({ target: { name: "timeCompleted", value: currentTimeHHMM() } })
          }
          className="flex items-center gap-1.5 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          title="Set to the current time"
        >
          <Clock className="w-4 h-4" />
          Now
        </button>
      </div>
      {isLong ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 mt-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          Job duration is {formatMinutes(duration)} ({arrivalTime} → {value}). Check AM/PM is correct.
        </p>
      ) : (
        hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>
      )}
    </div>
  );
};

export default TimeClearedField;
