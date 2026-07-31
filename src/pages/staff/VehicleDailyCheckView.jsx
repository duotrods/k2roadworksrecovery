import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Edit, Trash2, Download } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getStaffBasePath } from "../../utils/constants";
import { staffService } from "../../services/staffService";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const STATUS_DISPLAY = {
  ok: { symbol: "✓", className: "text-green-600 font-bold" },
  defect: { symbol: "✗", className: "text-red-600 font-bold" },
  na: { symbol: "–", className: "text-gray-500 font-bold" },
};

const renderCheckCell = (row, day) => {
  const status = row.status?.[day];
  if (status && STATUS_DISPLAY[status]) {
    const { symbol, className } = STATUS_DISPLAY[status];
    return <span className={className}>{symbol}</span>;
  }
  return row.initials?.[day] || "—";
};

const VehicleDailyCheckView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadForm = async () => {
    try {
      setLoading(true);
      const foundForm = await staffService.getVehicleDailyCheckById(id);

      if (foundForm) {
        setForm(foundForm);
      } else {
        toast.error("Form not found");
        navigate(basePath);
      }
    } catch (error) {
      console.error("Failed to load form:", error);
      toast.error("Failed to load form");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`${basePath}/forms/vehicle-daily-check?edit=${id}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this Vehicle Daily Check? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await staffService.deleteVehicleDailyCheck(
        id,
        userProfile.uid,
        userProfile.displayName,
      );
      toast.success("Vehicle Daily Check deleted successfully");
      navigate(basePath);
    } catch (error) {
      console.error("Failed to delete form:", error);
      toast.error("Failed to delete form");
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateReportPDF(form, "vehicle-check", null);
      toast.success("Downloaded Vehicle Daily Check report as PDF");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to download PDF");
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <StaffSidebarLayout basePath={basePath}>
        <div className="flex justify-center items-center h-64">
          <span className="loading loading-spinner loading-lg text-teal-500"></span>
        </div>
      </StaffSidebarLayout>
    );
  }

  if (!form) {
    return (
      <StaffSidebarLayout basePath={basePath}>
        <div className="text-center py-12">
          <p className="text-gray-500">Form not found</p>
        </div>
      </StaffSidebarLayout>
    );
  }

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">
                Vehicle Daily Check Details
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Reference: {form.referenceId || form.id.slice(0, 12)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-xl shadow-md p-8 space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Date
                </label>
                <p className="text-gray-800">{form.date || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Week Commencing
                </label>
                <p className="text-gray-800">
                  {form.weekCommencing || "N/A"}
                </p>
              </div>
              {form.day && (
                <div>
                  <label className="text-sm font-semibold text-gray-600">
                    Day
                  </label>
                  <p className="text-gray-800">
                    {DAY_LABELS[form.day] || form.day}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Drivers Name
                </label>
                <p className="text-gray-800">{form.driversName || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Vehicle Type/Registration No
                </label>
                <p className="text-gray-800">
                  {form.vehicleTypeReg || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Mileage
                </label>
                <p className="text-gray-800">{form.mileage || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Scheme
                </label>
                <p className="text-gray-800">{form.scheme || "N/A"}</p>
              </div>
              {form.lastEditedBy && (
                <div>
                  <label className="text-sm font-semibold text-gray-600">
                    Last Edited By
                  </label>
                  <p className="text-blue-600">
                    {form.lastEditedBy?.name || "Unknown"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Daily checks */}
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">
              {form.day
                ? `Daily Checks — ${DAY_LABELS[form.day] || form.day}`
                : "Daily Checks"}
            </h4>
            {form.day ? (
              <div className="divide-y divide-gray-200">
                {(form.checks || []).map((row) => (
                  <div
                    key={row.item}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="font-semibold text-sm">{row.label}</span>
                    <span>{renderCheckCell(row, form.day)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Check Item</th>
                      {DAYS_OF_WEEK.map((day) => (
                        <th key={day} className="text-center">
                          {DAY_LABELS[day]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(form.checks || []).map((row) => (
                      <tr key={row.item}>
                        <td className="font-semibold">{row.label}</td>
                        {DAYS_OF_WEEK.map((day) => (
                          <td key={day} className="text-center">
                            {renderCheckCell(row, day)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {form.driversReport && (
            <div>
              <label className="text-sm font-semibold text-gray-600">
                Driver's Report
              </label>
              <p className="text-gray-800 bg-gray-50 p-3 rounded-lg mt-1 whitespace-pre-wrap">
                {form.driversReport}
              </p>
            </div>
          )}

          {form.actionTaken && (
            <div>
              <label className="text-sm font-semibold text-gray-600">
                Action Taken
              </label>
              <p className="text-gray-800 bg-gray-50 p-3 rounded-lg mt-1 whitespace-pre-wrap">
                {form.actionTaken}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
              <div>
                <label className="font-semibold">Created:</label>{" "}
                {formatDateTime(form.createdAt)}
              </div>
              {form.updatedAt && (
                <div>
                  <label className="font-semibold">Last Updated:</label>{" "}
                  {formatDateTime(form.updatedAt)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StaffSidebarLayout>
  );
};

export default VehicleDailyCheckView;
