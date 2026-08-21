import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { staffService } from "../../services/staffService";
import { supabase } from "../../config/supabase";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { getSchemesForUser, extractSchemeId, isDemoScheme } from "../../utils/schemes";
import { getStaffBasePath, USER_ROLES } from "../../utils/constants";
import { compressImage } from "../../utils/imageCompression";
import { generateReportPDF, blobToBase64 } from "../../utils/pdfGenerator";

const MAX_IMAGES = 10;

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
    // Defaults to "N/A" to save time — staff only need to flip the items
    // that actually apply to "Yes"/"No" rather than fill in all 22.
    answer: "N/A",
    comments: "",
    actionOwner: "",
    completed: "",
  }));

const CabinSafetyCheckFormPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  // Admin can also reach this page (to edit a staff-submitted report) —
  // keep their own sidebar, and land back on Staff Reports (not the generic
  // admin dashboard) after save/cancel, instead of wherever `basePath` points.
  const isAdmin = role === USER_ROLES.ADMIN;
  const Layout = isAdmin ? AdminSidebarLayout : StaffSidebarLayout;
  const postActionPath = isAdmin ? "/dashboard/admin/staff-reports" : basePath;
  // Admin-revocable permission (Admin → Assignments & Access → Cabin Check
  // Access) — admin is never subject to it, even when editing a staff
  // member's report whose own permission is currently revoked.
  const canSubmit = isAdmin || userProfile?.canSubmitCabinHsChecks !== false;
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile && !canSubmit) {
      toast.error("You don't have permission to submit Cabin H&S Checks. Ask your admin for access.");
      navigate(postActionPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, canSubmit]);

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
    images: [],
  });

  // Staged photo uploads — mirrors IncidentReportFormPage.jsx's eager
  // background-upload pattern: each entry uploads to R2 the moment it's
  // added, so submit only has to await whatever's still in flight.
  const [stagedImages, setStagedImages] = useState([]);
  const uploadPromisesRef = useRef({});

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
          images: form.images || [],
        });
      } else {
        toast.error("Form not found");
        navigate(postActionPath);
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

  // Any "No" answer requires a written explanation before submit — same
  // principle as VehicleDailyCheckFormPage's "defect requires Driver's
  // Report" rule. Drives both the submit-block below and the required
  // styling on each row's Comments field.
  const hasMissingRequiredComment = formData.checklist.some(
    (row) => row.answer === "No" && !row.comments.trim(),
  );

  // Asks the server-side R2 upload proxy (api/upload.js) for a short-lived
  // presigned URL, then PUTs the file straight to R2 from the browser —
  // same flow as IncidentReportFormPage's uploadToR2.
  const uploadToR2 = async (blob, fileName, contentType) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const presignResponse = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        fileName,
        contentType,
        folder: "cabin-safety-checks",
      }),
    });

    if (!presignResponse.ok) {
      const { error } = await presignResponse.json().catch(() => ({}));
      throw new Error(error || "Upload failed");
    }

    const { uploadUrl, fileUrl, downloadUrl, fileType } =
      await presignResponse.json();

    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });

    if (!putResponse.ok) {
      throw new Error("Upload to storage failed");
    }

    return { fileUrl, downloadUrl, fileType };
  };

  // Kicks off compress + upload for one staged entry in the background and
  // records its promise so submit can await it.
  const startUpload = (id, file) => {
    const promise = (async () => {
      try {
        const compressedFile = await compressImage(file);
        const { fileUrl, downloadUrl, fileType } = await uploadToR2(
          compressedFile,
          file.name,
          file.type,
        );
        const result = {
          fileName: file.name,
          fileUrl,
          downloadUrl,
          fileSize: compressedFile.size,
          fileType,
        };
        setStagedImages((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: "done", result } : e)),
        );
        return { id, status: "done", result };
      } catch (error) {
        console.error("Background upload failed:", error);
        setStagedImages((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: "error", error } : e)),
        );
        return { id, status: "error", error };
      }
    })();
    uploadPromisesRef.current[id] = promise;
    return promise;
  };

  const addFiles = (files) => {
    const roomLeft = MAX_IMAGES - (formData.images.length + stagedImages.length);
    if (roomLeft <= 0) {
      toast.error(`You can upload up to ${MAX_IMAGES} photos`);
      return;
    }
    const accepted = files.slice(0, roomLeft);
    if (accepted.length < files.length) {
      toast.error(`Only ${roomLeft} more photo(s) can be added (max ${MAX_IMAGES})`);
    }
    const entries = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading",
      result: null,
      error: null,
    }));
    setStagedImages((prev) => [...prev, ...entries]);
    entries.forEach((entry) => startUpload(entry.id, entry.file));
  };

  const retryUpload = (id) => {
    const entry = stagedImages.find((e) => e.id === id);
    if (!entry) return;
    setStagedImages((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "uploading", error: null } : e)),
    );
    startUpload(id, entry.file);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));
    if (files.length !== e.target.files.length) {
      toast.error("Only images are allowed");
    }
    addFiles(files);
    e.target.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length !== e.dataTransfer.files.length) {
      toast.error("Only images are allowed");
    }
    addFiles(files);
  };

  const removeStagedImage = (id) => {
    setStagedImages((prev) => prev.filter((e) => e.id !== id));
    delete uploadPromisesRef.current[id];
  };

  const removeExistingImage = (index) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const isUploadingImages = stagedImages.some((e) => e.status === "uploading");
  const hasUploadErrors = stagedImages.some((e) => e.status === "error");
  const uploadsBusy = isUploadingImages || hasUploadErrors;

  // Staged photos upload eagerly as they're added, so this just awaits
  // whatever's still in flight — throws if any staged upload failed, so the
  // caller never submits with a missing image.
  const collectStagedImages = async () => {
    if (stagedImages.length === 0) return [];
    const results = await Promise.all(
      stagedImages.map((entry) => uploadPromisesRef.current[entry.id]).filter(Boolean),
    );
    if (results.some((r) => r.status === "error")) {
      throw new Error("Some photos failed to upload. Please retry them.");
    }
    return results.map((r) => r.result);
  };

  // Emails the scheme's contact a PDF copy of a newly submitted check.
  // Best-effort: the report is already saved by the time this runs, so any
  // failure here only shows a toast warning — it must never undo the save.
  // The API route resolves the recipient itself from the scheme (never a
  // demo scheme) and is idempotent, so this is safe to call every time.
  // Mirrors VehicleDailyCheckFormPage.jsx's sendReportCopyEmail.
  const sendReportCopyEmail = async (data, checkId, referenceId) => {
    const schemeId = extractSchemeId(data.scheme);
    if (!schemeId || isDemoScheme(schemeId)) return;

    try {
      const pdfBlob = await generateReportPDF(data, "cabin-safety", { asBlob: true });
      const pdfBase64 = await blobToBase64(pdfBlob);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          reportType: "cabin-safety",
          reportId: checkId,
          referenceId,
          schemeId,
          pdfBase64,
        }),
      });

      if (!response.ok) throw new Error("send-report-email request failed");
    } catch (error) {
      console.error("Failed to email report copy:", error);
      toast.error("Saved, but we couldn't email a copy to the scheme contact.");
    }
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

    if (hasMissingRequiredComment) {
      toast.error("Please add a comment for every question answered \"No\"");
      return;
    }

    if (uploadsBusy) {
      toast.error(
        isUploadingImages
          ? "Please wait for photos to finish uploading"
          : "Some photos failed to upload. Please retry or remove them.",
      );
      return;
    }

    setLoading(true);

    let submitData;
    try {
      const newImages = await collectStagedImages();
      submitData = {
        ...formData,
        images: [...formData.images, ...newImages],
      };
    } catch (error) {
      console.error("Error collecting uploaded photos:", error);
      toast.error(error.message || "Some photos failed to upload. Please retry them.");
      setLoading(false);
      return;
    }

    try {
      if (editId) {
        await staffService.updateCabinHealthSafetyCheck(
          editId,
          submitData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Cabin Health & Safety Check updated successfully!");
        navigate(postActionPath);
      } else {
        const { id: checkId, referenceId } = await staffService.submitCabinHealthSafetyCheck(
          submitData,
          userProfile.uid,
          userProfile.displayName,
        );
        toast.success("Cabin Health & Safety Check submitted successfully!");
        await sendReportCopyEmail(submitData, checkId, referenceId);

        setFormData({
          cabinOrPlotNo: "",
          inspectionCompletedBy: userProfile?.displayName || "",
          siteLocation: "",
          inspectionDate: formatDateToBritish(new Date()),
          scheme: "",
          checklist: seedChecklist(),
          images: [],
        });
        setStagedImages([]);
        uploadPromisesRef.current = {};
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to submit form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Hard block — don't render the form while the redirect above is in
  // flight, or a moment of unauthorized form access could flash on screen.
  if (userProfile && !canSubmit) return null;

  return (
    <Layout basePath={basePath}>
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
          className="bg-white rounded-xl shadow-md p-4 sm:p-8"
        >
          {/* <div className="flex justify-center items-center space-x-2 mb-8">
            <img src={chellanlogo} alt="MyApp Logo" className="h-25 w-auto" />
          </div> */}

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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
              className="mb-6 p-4 md:p-6 bg-gray-50 rounded-xl border border-gray-200"
            >
              <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
                {sectionName}
              </h4>

              {/* Mobile: stacked cards so the form never scrolls sideways */}
              <div className="md:hidden space-y-4">
                {formData.checklist
                  .map((row, idx) => ({ row, idx }))
                  .filter(({ row }) => row.section === sectionName)
                  .map(({ row, idx }) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
                    >
                      <p className="text-sm font-medium text-gray-800">
                        {row.question}
                      </p>
                      <div className="flex gap-4">
                        {["Yes", "No", "N/A"].map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-1.5 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`checklist_m_${idx}`}
                              checked={row.answer === opt}
                              onChange={() =>
                                updateChecklistField(idx, "answer", opt)
                              }
                              className="radio radio-sm radio-neutral"
                            />
                            <span className="text-sm">{opt}</span>
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">
                          Comments / Actions
                          {row.answer === "No" && (
                            <span className="text-red-500"> * required</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={row.comments}
                          onChange={(e) =>
                            updateChecklistField(idx, "comments", e.target.value)
                          }
                          required={row.answer === "No"}
                          className={`input input-sm w-full bg-white rounded-lg mt-1 ${
                            row.answer === "No" && !row.comments.trim()
                              ? "border-red-400"
                              : "border-gray-300"
                          }`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Action Owner
                          </label>
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
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">
                            Completed
                          </label>
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
                            className="input input-sm w-full bg-white border-gray-300 rounded-lg mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Desktop: full table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Question</th>
                      <th className="text-center w-40">Yes / No / N/A</th>
                      <th className="text-left">
                        Comments / Actions{" "}
                        <span className="text-red-500 font-normal text-xs">
                          (required if No)
                        </span>
                      </th>
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
                              required={row.answer === "No"}
                              placeholder={row.answer === "No" ? "Required" : ""}
                              className={`input input-sm w-full bg-white rounded-lg ${
                                row.answer === "No" && !row.comments.trim()
                                  ? "border-red-400"
                                  : "border-gray-300"
                              }`}
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

          {/* Photos */}
          <div className="mb-6">
            <label className="label">
              <span className="label-text font-semibold">
                Photos ({formData.images.length + stagedImages.length}/{MAX_IMAGES})
              </span>
            </label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="cabin-safety-photo-upload"
                disabled={formData.images.length + stagedImages.length >= MAX_IMAGES}
              />
              <label
                htmlFor="cabin-safety-photo-upload"
                className="cursor-pointer"
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-brand-600 font-semibold mb-1">Browse Photos</p>
                <p className="text-gray-500 text-sm">
                  Drag and drop images here — up to {MAX_IMAGES} total
                </p>
              </label>

              {formData.images.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                    Saved photos
                  </p>
                  {formData.images.map((image, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-blue-50 p-2 rounded"
                    >
                      <span className="text-sm text-gray-700 truncate">
                        {image.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeExistingImage(index)}
                        className="text-red-500 hover:text-red-700 shrink-0 ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {stagedImages.length > 0 && (
                <div className="mt-4 space-y-2">
                  {formData.images.length > 0 && (
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                      New photos
                    </p>
                  )}
                  {stagedImages.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.status === "uploading" && (
                          <Loader2 className="w-4 h-4 shrink-0 text-brand-500 animate-spin" />
                        )}
                        {entry.status === "done" && (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                        )}
                        {entry.status === "error" && (
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                        )}
                        <span className="text-sm text-gray-700 truncate">
                          {entry.file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.status === "error" && (
                          <button
                            type="button"
                            onClick={() => retryUpload(entry.id)}
                            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeStagedImage(entry.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              disabled={loading || uploadsBusy}
              className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors font-semibold"
            >
              {loading
                ? editId
                  ? "Updating..."
                  : "Submitting..."
                : isUploadingImages
                  ? "Uploading photos…"
                  : editId
                    ? "Update"
                    : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CabinSafetyCheckFormPage;
