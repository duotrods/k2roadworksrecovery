import { useContext } from "react";
import { ShiftContext } from "../context/shift-context";

// { onDuty, status, setOnDuty(bool) } — status is "idle" | "tracking" |
// "denied" | "unavailable". Staff only; elsewhere onDuty is always false.
export const useShift = () => {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used within ShiftTrackingProvider");
  return ctx;
};
