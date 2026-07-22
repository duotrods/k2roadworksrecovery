import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import { getSchemesForUser } from "../../utils/schemes";
import { getStaffBasePath } from "../../utils/constants";

import chellanlogo from "../../assets/chellanpng.png";

// Fixed 22-question checklist, grouped into 6 sections — matches the paper
// "Cabin Health and Safety Monthly Inspection Checklist" template exactly.
// Not user-addable/removable; only the answer/comments/actionOwner/completed
// fields per question are editable.
const CABIN_SAFETY_QUESTIONS = [
  { section: "Fire Safety", question: "Do records show that the fire alarm is being tested weekly?" },
  { section: "Fire Safety", question: "Have the fire extinguishers & fire blankets been serviced within the last year?" },
  { section: "Fire Safety", question: "Are all fire extinguishers in their designated locations and easily accessible?" },
  { section: "Fire Safety", question: "Is the safety pin and tamper seal in place and intact on the fire extinguishers?" },
  { section: "Fire Safety", question: "Are all fire extinguishers clearly indicated by pictogram signs and are they relevant to the type of area / work activity?" },
  { section: "Fire Safety", question: "Are all means of escape; routes, doors, passageways clear of obstructions." },
  { section: "Fire Safety", question: "Are all areas free of accumulated combustible materials?" },
  { section: "Electrical Safety", question: "Are all portable appliances regularly tested and inspected with 'PAT labels' clearly visible on the appliance?" },
  { section: "Electrical Safety", question: "Are sufficient socket outlets provided and are they readily accessible?" },
  { section: "Electrical Safety", question: "Does the number of electrical items plugged into extension leads / adapters correlate with the number of sockets available; it is prohibited to daisy chain i.e., connect multi sockets onto multiple sockets?" },
  { section: "Electrical Safety", question: "Are all cables free from straining, if an extension lead has been used is it fully extended and not coiled?" },
  { section: "Electrical Safety", question: "Are plugs and sockets free from damage?" },
  { section: "Gas Safety", question: "Has a gas safety check been completed within the last twelve months?" },
  { section: "Gas Safety", question: "Do records show that the carbon monoxide detector is being tested weekly?" },
  { section: "Gas Safety", question: "Are air vents clear?" },
  { section: "Gas Safety", question: "Are gas bottles appropriately stored?" },
  { section: "First Aid", question: "Have the contents of the first aid kit been checked within the last month and are bandages and eye wash vials within their expiration date." },
  { section: "Slips, Trips and Falls (Same Level)", question: "Are walking surfaces leading to cabin level, free from holes, cracks, and protrusions?" },
  { section: "Slips, Trips and Falls (Same Level)", question: "Is adequate external lighting provided?" },
  { section: "Slips, Trips and Falls (Same Level)", question: "Are leading edges on stairs and handrails in good condition and robust?" },
  { section: "Slips, Trips and Falls (Same Level)", question: "Are relevant operatives wearing safety footwear?" },
  { section: "Other", question: "Are vehicles appropriately parked i.e. (no parking alongside or in front of cabin)" },
];

const CABIN_SAFETY_SECTIONS = [...new Set(CABIN_SAFETY_QUESTIONS.map((q) => q.section))];

const seedChecklist = () =>
  CABIN_SAFETY_QUESTIONS.map(({ section, question }) => ({
    section,
    question,
    answer: "",
    comments: "",
    actionOwner: "",
    completed: "",
  }));

const CabinSafetyCheckFormPage = () => {
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
    cabinOrPlotNo: "",
    inspectionCompletedBy: userProfile?.displayName || "",
    siteLocation: "",
    inspectionDate: formatDateToBritish(new Date()),
    scheme: "",
    checklist: seedChecklist(),
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
      const form = await staffService.getCabinHealthSafetyCheckById(editId);

      if (form) {
        setFormData({
          cabinOrPlotNo: form.cabinOrPlotNo || "",
          inspectionCompletedBy: form.inspectionCompletedBy || "",
          siteLocation: form.siteLocation || "",
          inspectionDate: form.inspectionDate || "",
          scheme: form.scheme || "",
          checklist: form.checklist || seedChecklist(),
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

  const updateChecklistField = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      checklist: prev.checklist.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.scheme ||
      !formData.inspectionDate ||
      !formData.cabinOrPlotNo
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      if (editId) {
        await staffService.updateCabinHealthSafetyCheck(
          editId,
          formData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Cabin Health & Safety Check updated successfully!");
        navigate(basePath);
      } else {
        await staffService.submitCabinHealthSafetyCheck(
          formData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Cabin Health & Safety Check submitted successfully!");

        setFormData({
          cabinOrPlotNo: "",
          inspectionCompletedBy: userProfile?.displayName || "",
          siteLocation: "",
          inspectionDate: formatDateToBritish(new Date()),
          scheme: "",
          checklist: seedChecklist(),
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
      <div className="max-w-6xl mx-auto">
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
              ? "Edit Cabin Health & Safety Check"
              : "Cabin Health & Safety Monthly Inspection Checklist"}
          </h3>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-md p-8"
        >
          <div className="flex justify-center items-center space-x-2 mb-8">
            <img src={chellanlogo} alt="MyApp Logo" className="h-25 w-auto" />
          </div>

          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Cabin No / Plot No <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                value={formData.cabinOrPlotNo}
                onChange={(e) =>
                  setFormData({ ...formData, cabinOrPlotNo: e.target.value })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Inspection Completed By
                </span>
              </label>
              <input
                type="text"
                value={formData.inspectionCompletedBy}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    inspectionCompletedBy: e.target.value,
                  })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Site Location
                </span>
              </label>
              <input
                type="text"
                value={formData.siteLocation}
                onChange={(e) =>
                  setFormData({ ...formData, siteLocation: e.target.value })
                }
                className="input input-accent w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                maxLength={100}
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  Inspection Date (DD/MM/YYYY){" "}
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                value={formData.inspectionDate}
                onChange={(e) =>
                  setFormData({ ...formData, inspectionDate: e.target.value })
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

          {/* Checklist sections */}
          {CABIN_SAFETY_SECTIONS.map((sectionName) => (
            <div
              key={sectionName}
              className="mb-6 p-6 bg-gray-50 rounded-xl border border-gray-200"
            >
              <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                {sectionName}
              </h4>
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Question</th>
                      <th className="text-center w-40">Yes / No / N/A</th>
                      <th className="text-left">Comments / Actions</th>
                      <th className="text-left">Action Owner</th>
                      <th className="text-left">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.checklist
                      .map((row, idx) => ({ row, idx }))
                      .filter(({ row }) => row.section === sectionName)
                      .map(({ row, idx }) => (
                        <tr key={idx}>
                          <td className="max-w-xs align-top py-2">
                            {row.question}
                          </td>
                          <td className="align-top py-2">
                            <div className="flex gap-2 justify-center">
                              {["Yes", "No", "N/A"].map((opt) => (
                                <label
                                  key={opt}
                                  className="flex items-center gap-1 cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    name={`checklist_${idx}`}
                                    checked={row.answer === opt}
                                    onChange={() =>
                                      updateChecklistField(idx, "answer", opt)
                                    }
                                    className="radio radio-sm radio-neutral"
                                  />
                                  <span className="text-xs">{opt}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                          <td className="align-top py-2">
                            <input
                              type="text"
                              value={row.comments}
                              onChange={(e) =>
                                updateChecklistField(
                                  idx,
                                  "comments",
                                  e.target.value,
                                )
                              }
                              className="input input-sm w-full bg-white border-gray-300 rounded-lg"
                            />
                          </td>
                          <td className="align-top py-2">
                            <input
                              type="text"
                              value={row.actionOwner}
                              onChange={(e) =>
                                updateChecklistField(
                                  idx,
                                  "actionOwner",
                                  e.target.value,
                                )
                              }
                              className="input input-sm w-full bg-white border-gray-300 rounded-lg"
                            />
                          </td>
                          <td className="align-top py-2">
                            <input
                              type="text"
                              value={row.completed}
                              onChange={(e) =>
                                updateChecklistField(
                                  idx,
                                  "completed",
                                  e.target.value,
                                )
                              }
                              className="input input-sm w-full bg-white border-gray-300 rounded-lg"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

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

export default CabinSafetyCheckFormPage;
