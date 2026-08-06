import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import { SCHEMES } from "../../utils/schemes";

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

// A scaffold, not a constraint — admin can add/remove rows freely.
const ROWS_PER_DAY_SEED = 1;

// This is a real operational roster, not a demo-mode form — exclude the demo scheme.
const REAL_SCHEMES = SCHEMES.filter((s) => !s.isDemo);

const formatDateToBritish = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const createBlankRow = (day) => ({
  rowId: crypto.randomUUID(),
  day,
  opName: "",
  class: "",
  location: "",
  reg: "",
  vehicleType: "",
});

const seedRows = () =>
  DAYS_OF_WEEK.flatMap((day) =>
    Array.from({ length: ROWS_PER_DAY_SEED }, () => createBlankRow(day)),
  );

const emptyFormData = () => ({
  schemeId: "",
  schemeName: "",
  weekEnding: formatDateToBritish(new Date()),
  rows: seedRows(),
});

const DailyAllocationForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(emptyFormData);

  useEffect(() => {
    if (id) loadAllocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAllocation = async () => {
    setLoading(true);
    try {
      const allocation = await staffService.getDailyAllocationById(id);
      if (!allocation) {
        toast.error("Allocation not found");
        navigate("/dashboard/admin/daily-allocations");
        return;
      }
      setFormData({
        schemeId: allocation.schemeId || "",
        schemeName: allocation.schemeName || "",
        weekEnding: allocation.weekEnding || "",
        rows: allocation.rows || [],
      });
    } catch (error) {
      console.error("Failed to load daily allocation:", error);
      toast.error("Failed to load allocation");
    } finally {
      setLoading(false);
    }
  };

  const handleSchemeChange = (e) => {
    const selected = REAL_SCHEMES.find((s) => s.id === e.target.value);
    setFormData((prev) => ({
      ...prev,
      schemeId: selected ? selected.id : "",
      schemeName: selected ? selected.fullName : "",
    }));
  };

  const addRow = (day) => {
    setFormData((prev) => ({
      ...prev,
      rows: [...prev.rows, createBlankRow(day)],
    }));
  };

  const handleRowChange = (rowId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.rowId === rowId ? { ...r, [field]: value } : r,
      ),
    }));
  };

  const removeRow = (rowId) => {
    setFormData((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => r.rowId !== rowId),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.schemeId) {
      toast.error("Please select a scheme");
      return;
    }

    setLoading(true);
    try {
      if (id) {
        await staffService.updateDailyAllocation(
          id,
          formData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Daily Allocation updated successfully!");
      } else {
        const result = await staffService.submitDailyAllocation(
          formData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success(
          `Daily Allocation ${result.referenceId} created successfully!`,
        );
      }
      navigate("/dashboard/admin/daily-allocations");
    } catch (error) {
      console.error("Error submitting daily allocation:", error);
      toast.error("Failed to save daily allocation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-8xl mx-auto">
      <div className="flex items-start mb-6">
        <button
          onClick={() => navigate("/dashboard/admin/daily-allocations")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6  text-gray-800" />
        </button>
        <div>
          <h1 className=" font-bold text-gray-800 mb-2">
            {id ? "Edit Daily Allocations" : "Daily Allocations"}
          </h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">
            Weekly roster of operator allocations by scheme
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-md p-8 space-y-6"
      >
        {/* Scheme + Week Ending */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Scheme <span className="text-red-500">*</span>
              </span>
            </label>
            <select
              value={formData.schemeId}
              onChange={handleSchemeChange}
              className="select select-bordered w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              required
            >
              <option value="">Please Select a Scheme</option>
              {REAL_SCHEMES.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Week Ending (W/E) <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              value={formData.weekEnding}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  weekEnding: e.target.value,
                }))
              }
              placeholder="DD/MM/YYYY"
              pattern="\d{2}/\d{2}/\d{4}"
              className="input input-bordered w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              required
            />
          </div>
        </div>

        {/* Day sections */}
        {DAYS_OF_WEEK.map((day) => {
          const dayRows = formData.rows.filter((r) => r.day === day);
          return (
            <div key={day} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800">
                  {DAY_LABELS[day]}
                </h4>
                <button
                  type="button"
                  onClick={() => addRow(day)}
                  className="btn btn-sm btn-outline gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Row
                </button>
              </div>

              {dayRows.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">
                  No rows for this day.
                </p>
              ) : (
                <>
                  {/* Desktop: table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                          <th className="pb-2 pr-2">Op Name</th>
                          <th className="pb-2 pr-2">Class</th>
                          <th className="pb-2 pr-2">Location</th>
                          <th className="pb-2 pr-2">Reg</th>
                          <th className="pb-2 pr-2">Type of Vehicle</th>
                          <th className="pb-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRows.map((row) => (
                          <tr key={row.rowId}>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={row.opName}
                                onChange={(e) =>
                                  handleRowChange(
                                    row.rowId,
                                    "opName",
                                    e.target.value,
                                  )
                                }
                                className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={row.class}
                                onChange={(e) =>
                                  handleRowChange(
                                    row.rowId,
                                    "class",
                                    e.target.value,
                                  )
                                }
                                className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={row.location}
                                onChange={(e) =>
                                  handleRowChange(
                                    row.rowId,
                                    "location",
                                    e.target.value,
                                  )
                                }
                                className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={row.reg}
                                onChange={(e) =>
                                  handleRowChange(
                                    row.rowId,
                                    "reg",
                                    e.target.value,
                                  )
                                }
                                className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={row.vehicleType}
                                onChange={(e) =>
                                  handleRowChange(
                                    row.rowId,
                                    "vehicleType",
                                    e.target.value,
                                  )
                                }
                                className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                              />
                            </td>
                            <td className="py-1">
                              <button
                                type="button"
                                onClick={() => removeRow(row.rowId)}
                                className="text-red-500 hover:text-red-700"
                                title="Remove row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: one stacked card per row instead of a squeezed table */}
                  <div className="sm:hidden space-y-3">
                    {dayRows.map((row) => (
                      <div
                        key={row.rowId}
                        className="relative border border-gray-200 bg-brand-100 rounded-lg p-4 space-y-2"
                      >
                        <button
                          type="button"
                          onClick={() => removeRow(row.rowId)}
                          className="absolute top-3 right-4 text-red-500 hover:text-red-700"
                          title="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Op Name
                          </label>
                          <input
                            type="text"
                            value={row.opName}
                            onChange={(e) =>
                              handleRowChange(row.rowId, "opName", e.target.value)
                            }
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Class
                          </label>
                          <input
                            type="text"
                            value={row.class}
                            onChange={(e) =>
                              handleRowChange(row.rowId, "class", e.target.value)
                            }
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Location
                          </label>
                          <input
                            type="text"
                            value={row.location}
                            onChange={(e) =>
                              handleRowChange(row.rowId, "location", e.target.value)
                            }
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Reg
                          </label>
                          <input
                            type="text"
                            value={row.reg}
                            onChange={(e) =>
                              handleRowChange(row.rowId, "reg", e.target.value)
                            }
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Type of Vehicle
                          </label>
                          <input
                            type="text"
                            value={row.vehicleType}
                            onChange={(e) =>
                              handleRowChange(row.rowId, "vehicleType", e.target.value)
                            }
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mt-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Submit */}
        <div className="flex justify-end gap-4 pt-6 border-t border-gray-300">
          <button
            type="button"
            onClick={() => navigate("/dashboard/admin/daily-allocations")}
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
              ? id
                ? "Updating..."
                : "Submitting..."
              : id
                ? "Update"
                : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DailyAllocationForm;
