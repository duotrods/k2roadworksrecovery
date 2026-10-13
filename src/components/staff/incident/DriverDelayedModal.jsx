import { Clock } from "lucide-react";
import { formatMinutes } from "../../../utils/incidentForm";

// Shown on Step 2 when the driver arrived more than DRIVER_DELAY_MINUTES
// after the job started and "Driver Delayed Arrival" isn't ticked — as soon
// as Time of Arrival is changed, and again on Next. There's no skip:
// OK ticks the box and focuses the (required) reason input.
const DriverDelayedModal = ({ responseMinutes, startTime, arrivalTime, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 bg-brand-50 rounded-full flex items-center justify-center">
          <Clock className="w-7 h-7 text-brand-500" />
        </div>
      </div>

      {/* Text */}
      <h2 className="text-lg font-bold text-gray-800 text-center mb-1">
        Driver delayed arrival
      </h2>
      <p className="text-sm text-gray-500 text-center mb-5">
        Job started {startTime}, driver arrived {arrivalTime}: that&apos;s{" "}
        <span className="font-semibold text-gray-700">{formatMinutes(responseMinutes)}</span>,
        over 1 hour. Please tick &quot;Driver Delayed Arrival&quot; and give the reason.
      </p>

      {/* Action */}
      <button
        type="button"
        onClick={onConfirm}
        className="w-full px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors"
      >
        OK
      </button>
    </div>
  </div>
);

export default DriverDelayedModal;
