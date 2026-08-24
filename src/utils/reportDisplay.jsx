import { FileText } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCarBurst } from "@fortawesome/free-solid-svg-icons";

// Presentation helpers shared by the client Reports page (table, modal, cards).
// Kept in one place so the page component stays focused on data/pagination logic.

export const formatDate = (timestamp) => {
  if (!timestamp) return "N/A";
  const date = timestamp.seconds
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatTime = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.seconds
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Parse a DD/MM/YYYY string into a Date (or null).
export const parseBritishDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return null;
};

// Display date for a report — form date for incident, else createdAt.
export const getReportDisplayDate = (report) => {
  if (report.reportType === "incident" && report.date) {
    const date = parseBritishDate(report.date);
    if (date) {
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    return report.date;
  }
  return formatDate(report.timestamp);
};

// Display time for a report.
export const getReportDisplayTime = (report) => {
  if (report.reportType === "incident" && report.timeSpotted) {
    return report.timeSpotted;
  }
  return formatTime(report.timestamp);
};

// Matches the admin StaffReportsPage type styling: FontAwesome icon shown
// inside a soft coloured badge.
export const getReportTypeIcon = (type) => {
  switch (type) {
    case "incident":
      return (
        <FontAwesomeIcon icon={faCarBurst} className="text-brand-600 text-[14px]" />
      );
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
};

export const getReportTypeBadge = (type) => {
  const badges = {
    incident: "bg-brand-100 text-brand-600 font-semibold",
  };
  return badges[type] || "badge-ghost";
};

// Human label for a report type, e.g. "incident" → "RECOVERY JOB SHEET".
export const getReportTypeLabel = (type) => {
  const labels = {
    incident: "Recovery Job Sheet",
  };
  return (labels[type] || type || "").toUpperCase();
};
