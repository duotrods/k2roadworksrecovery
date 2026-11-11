import { MapPin, MapPinOff } from "lucide-react";

// Tells the operator what location sharing is doing during Step 2 before
// "Click when on Scene". Renders nothing when tracking is idle.
const LocationSharingBanner = ({ status }) => {
  if (status === "tracking") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
        <MapPin className="h-4 w-4 shrink-0" />
        Sharing your location with control until you tap "Click when on Scene". Keep this
        screen open.
      </div>
    );
  }
  if (status === "denied" || status === "unavailable") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <MapPinOff className="h-4 w-4 shrink-0" />
        {status === "denied"
          ? "Location is blocked, so control can't see where you are. Allow location for this site in your browser settings. You can still complete the job."
          : "This device can't share its location. You can still complete the job."}
      </div>
    );
  }
  return null;
};

export default LocationSharingBanner;
