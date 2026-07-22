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

const VehicleDailyCheckFormPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const [loading, setLoading] = useState(false);

  const formatDateToBritish = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const [formData, setFormData] = useState({
    weekCommencing: formatDateToBritish(new Date()),
    driversName: userProfile?.displayName || "",
    vehicleTypeReg: "",
    mileage: "",
    scheme: "",
    checks: seedChecks(),
    driversReport: "",
    actionTaken: "",
    supervisorSignature: "",
    date: formatDateToBritish(new Date()),
  });

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
          supervisorSignature: form.supervisorSignature || "",
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

    if (!formData.scheme || !formData.weekCommencing || !formData.driversName) {
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

        setFormData({
          weekCommencing: formatDateToBritish(new Date()),
          driversName: userProfile?.displayName || "",
          vehicleTypeReg: "",
          mileage: "",
          scheme: "",
          checks: seedChecks(),
          driversReport: "",
          actionTaken: "",
          supervisorSignature: "",
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
                  Week Commencing (DD/MM/YYYY){" "}
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                value={formData.weekCommencing}
                onChange={(e) =>
                  setFormData({ ...formData, weekCommencing: e.target.value })
                }
                placeholder="DD/MM/YYYY"
                pattern="\d{2}/\d{2}/\d{4}"
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                required
              />
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
          </div>

          {/* Daily checks grid */}
          <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Driver to initial against check list below
            </h4>
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
                  {formData.checks.map((row, idx) => (
                    <tr key={row.item}>
                      <td className="font-semibold py-2">{row.label}</td>
                      {DAYS_OF_WEEK.map((day) => (
                        <td key={day} className="text-center py-2">
                          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateStatus(idx, day, "ok")}
                              className={`px-2 py-1 text-xs font-bold ${
                                row.status[day] === "ok"
                                  ? "bg-green-500 text-white"
                                  : "bg-white text-gray-400 hover:bg-gray-100"
                              }`}
                              aria-label={`${row.label} ${DAY_LABELS[day]}: OK`}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(idx, day, "defect")}
                              className={`px-2 py-1 text-xs font-bold border-l border-gray-300 ${
                                row.status[day] === "defect"
                                  ? "bg-red-500 text-white"
                                  : "bg-white text-gray-400 hover:bg-gray-100"
                              }`}
                              aria-label={`${row.label} ${DAY_LABELS[day]}: Defect`}
                            >
                              ✗
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(idx, day, "na")}
                              className={`px-2 py-1 text-xs font-bold border-l border-gray-300 ${
                                row.status[day] === "na"
                                  ? "bg-gray-500 text-white"
                                  : "bg-white text-gray-400 hover:bg-gray-100"
                              }`}
                              aria-label={`${row.label} ${DAY_LABELS[day]}: N/A`}
                            >
                              –
                            </button>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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

          {/* Supervisor Signature / Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Supervisor's Signature
                </span>
              </label>
              <input
                type="text"
                value={formData.supervisorSignature}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    supervisorSignature: e.target.value,
                  })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
              />
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
              className="px-8 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors font-semibold"
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
