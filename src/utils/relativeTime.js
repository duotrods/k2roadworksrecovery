// Pure time-formatting helpers for the staff dashboard. Kept free of any
// Supabase/React imports so they can be unit-tested in isolation.

// Human-friendly "time ago" for a past timestamp: "just now", "42 min ago",
// "3h ago", "2d ago". Falls back to "" for missing/invalid input, and to a
// British-format date once past a week so old items don't read as "40d ago".
export const formatRelativeTime = (input, now = new Date()) => {
  if (!input) return "";
  const then = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(then.getTime())) return "";

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return "just now";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return then.toLocaleDateString("en-GB");
};

// Step names mirror the Job Sheet form's StepIndicator so the resume chip reads
// the same as the form. currentStep is 1..4; falls back to 2 when absent, which
// matches the form's own resume-at logic for a live job.
const STEP_NAMES = ["Start Job", "On Scene", "Drop-Off", "Customer"];

export const liveJobStepLabel = (currentStep) => {
  const step =
    Number.isInteger(currentStep) && currentStep >= 1 && currentStep <= 4
      ? currentStep
      : 2;
  return `Step ${step} of 4 · ${STEP_NAMES[step - 1]}`;
};
