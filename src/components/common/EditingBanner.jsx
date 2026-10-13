import { Pencil } from "lucide-react";

// Shown at the top of a form opened on an existing record, so it's clear
// which record is being changed, e.g. "You're editing job sheet IN43".
// Renders nothing until the record (and its reference) has loaded.
const EditingBanner = ({ action = "editing", recordLabel, referenceId }) => {
  if (!referenceId) return null;
  return (
    <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
      <Pencil className="w-4 h-4 shrink-0" />
      <p className="text-sm">
        You&apos;re {action} {recordLabel}{" "}
        <span className="font-bold">{referenceId}</span>
      </p>
    </div>
  );
};

export default EditingBanner;
