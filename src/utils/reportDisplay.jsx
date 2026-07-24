import {
  FileText,
  AlertTriangle,
  Eye,
  Package,
} from "lucide-react";

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

// Display date for a report — form date for incident/asset/cctv, else createdAt.
export const getReportDisplayDate = (report) => {
  if (
    (report.reportType === "incident" ||
      report.reportType === "asset-damage" ||
      report.reportType === "cctv-check") &&
    report.date
  ) {
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
  if (
    (report.reportType === "asset-damage" ||
      report.reportType === "cctv-check") &&
    report.time
  ) {
    return report.time;
  }
  return formatTime(report.timestamp);
};

export const getReportTypeIcon = (type) => {
  switch (type) {
    case "incident":
      return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    case "asset-damage":
      return <Package className="w-5 h-5 text-red-500" />;
    case "cctv-check":
      return <Eye className="w-5 h-5 text-green-500" />;
    default:
      return <FileText className="w-5 h-5 text-gray-500" />;
  }
};

export const getReportTypeBadge = (type) => {
  const badges = {
    incident: "badge-warning",
    "asset-damage": "badge-error",
    "cctv-check": "badge-success",
  };
  return badges[type] || "badge-ghost";
};
