import { MapPin, MapPinOff } from "lucide-react";
import { useShift } from "../../hooks/useShift";
import { isLocationSupported, openLocationSettings } from "../../utils/locationFeed";
import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

// Go on/off duty. While on duty the app shares the staff member's location
// with control (see ShiftTrackingContext). Shown at the top of every staff page.
const DutyToggle = () => {
  const { onDuty, status, setOnDuty } = useShift();
  const supported = isLocationSupported();

  const warning =
    status === "denied"
      ? isNative
        ? "Location is blocked, so control can't see where you are. Allow location (and notifications) for this app."
        : "Location is blocked, so control can't see where you are. Allow location for this site in your browser settings."
      : status === "unavailable"
        ? "This device can't share its location."
        : null;

  return (
    <div className="mb-4">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${
          onDuty
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-white text-gray-600"
        }`}
      >
        {onDuty ? (
          <MapPin className="h-4 w-4 shrink-0" />
        ) : (
          <MapPinOff className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1 min-w-48">
          {onDuty
            ? isNative
              ? "You're on duty. Control can see your location, even with the screen locked."
              : "You're on duty. Control can see your location while this app stays open."
            : "You're off duty. Your location isn't shared."}
        </span>
        <button
          type="button"
          disabled={!supported}
          onClick={() => setOnDuty(!onDuty)}
          className={`rounded-md px-4 py-1.5 font-semibold text-white disabled:opacity-50 ${
            onDuty ? "bg-gray-600 hover:bg-gray-700" : "bg-brand-500 hover:bg-brand-600"
          }`}
        >
          {onDuty ? "Go off duty" : "Go on duty"}
        </button>
      </div>
      {warning && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <MapPinOff className="h-4 w-4 shrink-0" />
          {warning}
          {isNative && status === "denied" && (
            <button
              type="button"
              onClick={() => openLocationSettings()}
              className="ml-auto shrink-0 rounded-md bg-amber-600 px-3 py-1 font-semibold text-white"
            >
              Open settings
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DutyToggle;
