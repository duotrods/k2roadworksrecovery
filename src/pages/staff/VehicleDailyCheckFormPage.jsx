import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import { getSchemesForUser } from "../../utils/schemes";
import { getStaffBasePath } from "../../utils/constants";
import { VEHICLE_CHECK_ITEMS } from "../../utils/vehicleCheckStats";

import chellanlogo from "../../assets/chellanpng.png";

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

const emptyStatus = () =>
  DAYS_OF_WEEK.reduce((acc, day) => ({ ...acc, [day]: "" }), {});

const seedChecks = () =>
  VEHICLE_CHECK_ITEMS.map(({ item, label }) => ({
    item,
    label,
    status: emptyStatus(),
  }));

// The grid's day columns (DAY_LABELS) are Monday-first, so weekCommencing
// must actually be a Monday for the future-day math below to line up —
// default new sheets to the current week's Monday rather than "today".
const getMostRecentMonday = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseBritishDate = (str) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str || "");
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateToBritish = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Whether `day` (a DAYS_OF_WEEK key) falls after today, given the sheet's
// week-commencing date — used to disable days that haven't happened yet in
// the Day dropdown (a vehicle can't be checked before that day occurs).
const isFutureDay = (weekCommencing, day) => {
  const monday = parseBritishDate(weekCommencing);
  if (!monday) return false;
  const dayDate = new Date(monday);
  dayDate.setDate(dayDate.getDate() + DAYS_OF_WEEK.indexOf(day));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dayDate > today;
};

// The latest day within weekCommencing's week that isn't in the future —
// today for the current week, or Sunday for any past week — used to pick a
// sensible default when the form loads or the selected week changes.
const getDefaultDay = (weekCommencing) => {
  for (let i = DAYS_OF_WEEK.length - 1; i >= 0; i--) {
    if (!isFutureDay(weekCommencing, DAYS_OF_WEEK[i])) return DAYS_OF_WEEK[i];
  }
  return DAYS_OF_WEEK[0];
};

const VehicleDailyCheckFormPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState(() => {
    const weekCommencing = formatDateToBritish(getMostRecentMonday());
    return {
      weekCommencing,
      day: getDefaultDay(weekCommencing),
      driversName: userProfile?.displayName || "",
      vehicleTypeReg: "",
      mileage: "",
      scheme: "",
      checks: seedChecks(),
      driversReport: "",
      actionTaken: "",
      date: formatDateToBritish(new Date()),
    };
  });

  // The selected day defaults to OK across all items to save time (most
  // checks pass) — unless it's a future day, which shouldn't be selectable
  // anyway. Re-runs whenever the selected week or day changes.
  useEffect(() => {
    if (isFutureDay(formData.weekCommencing, formData.day)) return;
    setFormData((prev) => {
      if (isFutureDay(prev.weekCommencing, prev.day)) return prev;
      let changed = false;
      const checks = prev.checks.map((row) => {
        if (row.status[prev.day] !== "") return row;
        changed = true;
        return { ...row, status: { ...row.status, [prev.day]: "ok" } };
      });
      return changed ? { ...prev, checks } : prev;
    });
  }, [formData.weekCommencing, formData.day]);

  useEffect(() => {
    if (editId) {
      loadFormData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const loadFormData = async () => {
    try {
      setLoading(true);
      const form = await staffService.getVehicleDailyCheckById(editId);

      if (form) {
        setFormData({
          weekCommencing: form.weekCommencing || "",
          day: form.day || getDefaultDay(form.weekCommencing || ""),
          driversName: form.driversName || "",
          vehicleTypeReg: form.vehicleTypeReg || "",
          mileage: form.mileage || "",
          scheme: form.scheme || "",
          checks:
            form.checks?.length > 0
              ? form.checks.map((row) => ({
                  ...row,
                  status: row.status || emptyStatus(),
                }))
              : seedChecks(),
          driversReport: form.driversReport || "",
          actionTaken: form.actionTaken || "",
          date: form.date || "",
        });
      } else {
        toast.error("Form not found");
        navigate(basePath);
      }
    } catch (error) {
      console.error("Failed to load form:", error);
      toast.error("Failed to load form data");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = (index, day, value) => {
    setFormData((prev) => ({
      ...prev,
      checks: prev.checks.map((row, i) =>
        i === index
          ? {
              ...row,
              status: {
                ...row.status,
                [day]: row.status[day] === value ? "" : value,
              },
            }
          : row,
      ),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.scheme ||
      !formData.weekCommencing ||
      !formData.day ||
      !formData.driversName
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      const trimmedData = {
        ...formData,
        driversReport: formData.driversReport.trim(),
        actionTaken: formData.actionTaken.trim(),
      };

      if (editId) {
        await staffService.updateVehicleDailyCheck(
          editId,
          trimmedData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Vehicle Daily Check updated successfully!");
        navigate(basePath);
      } else {
        await staffService.submitVehicleDailyCheck(
          trimmedData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Vehicle Daily Check submitted successfully!");

        const weekCommencing = formatDateToBritish(getMostRecentMonday());
        setFormData({
          weekCommencing,
          day: getDefaultDay(weekCommencing),
          driversName: userProfile?.displayName || "",
          vehicleTypeReg: "",
          mileage: "",
          scheme: "",
          checks: seedChecks(),
          driversReport: "",
          actionTaken: "",
          date: formatDateToBritish(new Date()),
        });
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to submit form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h3 className="text-2xl font-bold text-gray-800">
            {editId
              ? "Edit Recovery Vehicle Daily Check Sheet"
              : "Recovery Vehicle Daily Check Sheet"}
          </h3>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-md p-8"
        >
          {/* <div className="flex justify-center items-center space-x-2 mb-8">
            <img src={chellanlogo} alt="MyApp Logo" className="h-25 w-auto" />
          </div> */}

          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Day <span className="text-red-500">*</span>
                </span>
              </label>
              <select
                value={formData.day}
                onChange={(e) =>
                  setFormData({ ...formData, day: e.target.value })
                }
                className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                required
              >
                {DAYS_OF_WEEK.map((day) => {
                  const future = isFutureDay(formData.weekCommencing, day);
                  return (
                    <option key={day} value={day} disabled={future}>
                      {DAY_LABELS[day]}
                      {future ? " (not yet)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Drivers Name <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                value={formData.driversName}
                onChange={(e) =>
                  setFormData({ ...formData, driversName: e.target.value })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Scheme <span className="text-red-500">*</span>
                </span>
              </label>
              <select
                value={formData.scheme}
                onChange={(e) =>
                  setFormData({ ...formData, scheme: e.target.value })
                }
                className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                required
              >
                <option value="">Please Select</option>
                {getSchemesForUser(userProfile).map((scheme) => (
                  <option key={scheme.id} value={scheme.fullName}>
                    {scheme.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Date (DD/MM/YYYY)
                </span>
              </label>
              <input
                type="text"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                placeholder="DD/MM/YYYY"
                pattern="\d{2}/\d{2}/\d{4}"
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Vehicle Type/Registration No
                </span>
              </label>
              <input
                type="text"
                value={formData.vehicleTypeReg}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleTypeReg: e.target.value })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Mileage
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.mileage}
                onChange={(e) =>
                  setFormData({ ...formData, mileage: e.target.value })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={20}
              />
            </div>
          </div>

          {/* Daily checks — single day, matching the selected Day dropdown */}
          <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Driver to check against list below — {DAY_LABELS[formData.day]}
            </h4>
            <div className="divide-y divide-gray-200">
              {formData.checks.map((row, idx) => (
                <div
                  key={row.item}
                  className="flex items-center justify-between py-3"
                >
                  <span className="font-semibold text-sm">{row.label}</span>
                  <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateStatus(idx, formData.day, "ok")}
                      className={`px-3 py-1.5 text-xs font-bold ${
                        row.status[formData.day] === "ok"
                          ? "bg-brand-500 text-white"
                          : "bg-white text-gray-400 hover:bg-gray-100"
                      }`}
                      aria-label={`${row.label}: OK`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(idx, formData.day, "defect")}
                      className={`px-3 py-1.5 text-xs font-bold border-l border-gray-300 ${
                        row.status[formData.day] === "defect"
                          ? "bg-red-500 text-white"
                          : "bg-white text-gray-400 hover:bg-gray-100"
                      }`}
                      aria-label={`${row.label}: Defect`}
                    >
                      ✗
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(idx, formData.day, "na")}
                      className={`px-3 py-1.5 text-xs font-bold border-l border-gray-300 ${
                        row.status[formData.day] === "na"
                          ? "bg-gray-500 text-white"
                          : "bg-white text-gray-400 hover:bg-gray-100"
                      }`}
                      aria-label={`${row.label}: N/A`}
                    >
                      –
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Driver's Report / Action Taken */}
          <div className="mb-6">
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Driver's Report (detail any problems)
              </span>
            </label>
            <textarea
              value={formData.driversReport}
              onChange={(e) =>
                setFormData({ ...formData, driversReport: e.target.value })
              }
              rows={3}
              className="textarea w-full textarea-accent bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              maxLength={2000}
            />
          </div>

          <div className="mb-6">
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Action Taken (to solve above problems)
              </span>
            </label>
            <textarea
              value={formData.actionTaken}
              onChange={(e) =>
                setFormData({ ...formData, actionTaken: e.target.value })
              }
              rows={3}
              className="textarea w-full textarea-accent bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              maxLength={2000}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-300">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors font-semibold"
            >
              {loading
                ? editId
                  ? "Updating..."
                  : "Submitting..."
                : editId
                  ? "Update"
                  : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </StaffSidebarLayout>
  );
};

export default VehicleDailyCheckFormPage;
