import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Upload, X, ChevronRight } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getStaffBasePath } from "../../utils/constants";
import { staffService } from "../../services/staffService";
import { supabase } from "../../config/supabase";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import StepIndicator from "../../components/staff/incident/StepIndicator";
import SignaturePad from "../../components/staff/incident/SignaturePad";
import { compressImage } from "../../utils/imageCompression";
import { getSchemesForUser } from "../../utils/schemes";
import { generateReportPDF, blobToBase64 } from "../../utils/pdfGenerator";
import {
  formatDateToBritish,
  calculateTimeDifferences,
  SERVICE_ACCEPTANCE_STATEMENTS,
  VEHICLE_CONDITION_SECTIONS,
  CHECK_ITEMS,
  SOURCE_OF_CALL_OPTIONS,
  createEmptyVehicleCondition,
  createEmptyChecks,
  VEHICLE_ALLOCATED_OPTIONS,
  VEHICLE_TRANSMISSION_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
  ACTUAL_TYPE_OPTIONS,
} from "../../utils/incidentForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Builds a fresh Job Sheet form. Step 1 (Start Job) fields default to
// "just took this call" state, later-step fields default empty.
const emptyFormData = (userProfile) => ({
  // Step 1 — Start Job
  firstName: userProfile?.displayName || "",
  scheme: "",
  driverName: "",
  vehicleAllocated: "",
  jobSource: "",
  customerLogNo: "",
  date: formatDateToBritish(new Date()),
  time: new Date().toTimeString().slice(0, 5),
  notes: "",
  // Step 2 — On Scene
  driverOnScene: false,
  policeOnScene: false,
  nhOnScene: false,
  ripvOnScene: false,
  otherOnScene: false,
  otherOnSceneDetails: "",
  timeOfArrival: "",
  markerPost: "",
  vehicleType: "",
  timeCompleted: "",
  // Step 3 — Drop-Off Sheet
  vehicleRegNo: "",
  vehicleMakeModel: "",
  vehicleColour: "",
  transmission: "",
  noOfPassengers: "",
  speedo: "",
  hasCaravanTrailer: false,
  trailerNumber: "",
  faultReported: "",
  actualFault: "",
  checks: createEmptyChecks(),
  vehicleCondition: createEmptyVehicleCondition(),
  // Step 4 — Customer Page
  recoveryDestination: "",
  storageName: "",
  storageAddress: "",
  storageContactNo: "",
  storageEmail: "",
  propertyRemoved: "",
  vehicleOutcome: "",
  serviceAcceptance: SERVICE_ACCEPTANCE_STATEMENTS.map(() => false),
  name: "",
  customerContactNo: "",
  customerAddress: "",
  satisfactionConfirmed: false,
  sendReportCopy: false,
  signatureUrl: "",
});

const IncidentReportFormPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  // Step 2 (On Scene) and Step 3 (Drop-Off Sheet) each get their own staging
  // array so "Arrival Images" and "Unloaded Images" never bleed into each
  // other's upload box.
  const [arrivalFiles, setArrivalFiles] = useState([]);
  const [dropoffFiles, setDropoffFiles] = useState([]);

  // Step management: 1 = Start Job, 2 = On Scene, 3 = Drop-Off Sheet, 4 = Customer
  const [currentStep, setCurrentStep] = useState(1);
  const [isEditingLiveIncident, setIsEditingLiveIncident] = useState(false);
  const [liveIncidentId, setLiveIncidentId] = useState(null);
  const [existingReferenceId, setExistingReferenceId] = useState(null);

  const [formData, setFormData] = useState(() => emptyFormData(userProfile));
  const [sourceOtherMode, setSourceOtherMode] = useState(false);
  const [isRedrawingSignature, setIsRedrawingSignature] = useState(false);
  const signaturePadRef = useRef(null);

  useEffect(() => {
    if (editId) {
      loadFormData();
    }
  }, [editId]);

  const loadFormData = async () => {
    try {
      setLoading(true);
      const report = await staffService.getIncidentReportById(editId);

      if (report) {
        setExistingReferenceId(report.referenceId || null);
        setFormData({
          driverOnScene: report.driverOnScene || false,
          policeOnScene: report.policeOnScene || false,
          nhOnScene: report.nhOnScene || false,
          ripvOnScene: report.ripvOnScene || false,
          otherOnScene: report.otherOnScene || false,
          otherOnSceneDetails: report.otherOnSceneDetails || "",
          firstName: report.firstName || "",
          scheme: report.scheme || "",
          driverName: report.driverName || "",
          vehicleAllocated: report.vehicleAllocated || "",
          jobSource: report.jobSource || "",
          customerLogNo: report.customerLogNo || "",
          date: report.date || "",
          time: report.time || "",
          timeOfArrival: report.timeOfArrival || "",
          vehicleRegNo: report.vehicleRegNo || "",
          vehicleMakeModel: report.vehicleMakeModel || "",
          vehicleColour: report.vehicleColour || "",
          vehicleType: report.vehicleType || "",
          transmission: report.transmission || "",
          noOfPassengers: report.noOfPassengers || "",
          speedo: report.speedo || "",
          hasCaravanTrailer: report.hasCaravanTrailer || false,
          trailerNumber: report.trailerNumber || "",
          faultReported: report.faultReported || "",
          actualFault: report.actualFault || "",
          markerPost: report.markerPost || "",
          notes: report.notes || "",
          timeCompleted: report.timeCompleted || "",
          recoveryDestination: report.recoveryDestination || "",
          storageName: report.storageName || "",
          storageAddress: report.storageAddress || "",
          storageContactNo: report.storageContactNo || "",
          storageEmail: report.storageEmail || "",
          propertyRemoved: report.propertyRemoved || "",
          vehicleOutcome: report.vehicleOutcome || "",
          checks: {
            ...createEmptyChecks(),
            ...Object.fromEntries(
              Object.entries(report.checks || {}).filter(([, value]) => value),
            ),
          },
          vehicleCondition: {
            ...createEmptyVehicleCondition(),
            ...Object.fromEntries(
              Object.entries(report.vehicleCondition || {}).filter(
                ([, section]) => section?.damage || section?.note,
              ),
            ),
          },
          serviceAcceptance:
            report.serviceAcceptance || SERVICE_ACCEPTANCE_STATEMENTS.map(() => false),
          name: report.name || "",
          customerContactNo: report.customerContactNo || "",
          customerAddress: report.customerAddress || "",
          satisfactionConfirmed: report.satisfactionConfirmed || false,
          sendReportCopy: report.sendReportCopy || false,
          signatureUrl: report.signatureUrl || "",
          files: report.files || [],
        });
        setIsRedrawingSignature(false);
        setSourceOtherMode(
          Boolean(report.jobSource) && !SOURCE_OF_CALL_OPTIONS.includes(report.jobSource),
        );

        // If editing a live job, resume at whichever step was last saved
        if (report.status === "live") {
          setCurrentStep(report.currentStep || 2);
          setIsEditingLiveIncident(true);
        }
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckToggle = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      checks: { ...prev.checks, [key]: value },
    }));
  };

  const handleConditionChange = (sectionKey, field, value) => {
    setFormData((prev) => ({
      ...prev,
      vehicleCondition: {
        ...prev.vehicleCondition,
        [sectionKey]: { ...prev.vehicleCondition[sectionKey], [field]: value },
      },
    }));
  };

  const handleAcceptanceToggle = (index) => {
    setFormData((prev) => {
      const serviceAcceptance = [...prev.serviceAcceptance];
      serviceAcceptance[index] = !serviceAcceptance[index];
      return { ...prev, serviceAcceptance };
    });
  };

  const filesForStage = (stage) =>
    stage === "arrival" ? arrivalFiles : dropoffFiles;

  const setFilesForStage = (stage, updater) => {
    if (stage === "arrival") setArrivalFiles(updater);
    else setDropoffFiles(updater);
  };

  const handleFileSelect = (e, stage) => {
    const selectedFiles = Array.from(e.target.files);
    setFilesForStage(stage, (prev) => [...prev, ...selectedFiles]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = Array.from(e.dataTransfer.files);
    const allowedTypes = ["image/", "video/", "application/pdf"];
    const validFiles = droppedFiles.filter((file) =>
      allowedTypes.some((type) => file.type.startsWith(type)),
    );

    if (validFiles.length !== droppedFiles.length) {
      toast.error(
        "Some files were rejected. Only images, videos, and PDFs are allowed.",
      );
    }

    setFilesForStage(stage, (prev) => [...prev, ...validFiles]);
  };

  const removeFile = (stage, index) => {
    setFilesForStage(stage, (prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index) => {
    setFormData((prev) => ({
      ...prev,
      files: (prev.files || []).filter((_, i) => i !== index),
    }));
  };

  // Asks the server-side R2 upload proxy (api/upload.js) for a short-lived
  // presigned URL, then PUTs the file straight to R2 from the browser. The
  // file bytes never pass through the Vercel function — only the small
  // presign request/response does — which avoids Vercel's ~4.5MB serverless
  // request-body limit that previously made large videos fail to upload.
  // Requires an active Supabase session; throws if either step fails.
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
        folder: "incident-reports",
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

  // Uploads every staged file for one step, tagging each result with the
  // step it belongs to so "Arrival Images" (Step 2) and "Unloaded Images"
  // (Step 3) stay separate once merged into formData.files.
  const uploadStageFiles = async (stage, stageFiles) =>
    Promise.all(
      stageFiles.map(async (file) => {
        const compressedFile = await compressImage(file);
        const { fileUrl, downloadUrl, fileType } = await uploadToR2(
          compressedFile,
          file.name,
          file.type,
        );

        return {
          fileName: file.name,
          fileUrl,
          downloadUrl,
          fileSize: compressedFile.size,
          fileType,
          stage,
        };
      }),
    );

  const uploadFiles = async () => {
    if (arrivalFiles.length === 0 && dropoffFiles.length === 0) return [];

    setUploadingFiles(true);
    try {
      const [arrivalResults, dropoffResults] = await Promise.all([
        uploadStageFiles("arrival", arrivalFiles),
        uploadStageFiles("dropoff", dropoffFiles),
      ]);

      return [...arrivalResults, ...dropoffResults];
    } finally {
      setUploadingFiles(false);
    }
  };

  // Uploads a freshly-drawn signature to R2 and returns its URL. If nothing
  // new was drawn, keeps whatever signature URL is already on the form.
  const uploadSignatureIfNeeded = async () => {
    const pad = signaturePadRef.current;
    if (!pad || pad.isEmpty()) return formData.signatureUrl || "";

    const blob = await pad.toBlob();
    if (!blob) return formData.signatureUrl || "";

    const { downloadUrl } = await uploadToR2(blob, "signature.png", "image/png");
    return downloadUrl;
  };

  // Persists whatever is in formData/files right now against the existing
  // incident doc, without navigating away. Used by the "Next" buttons on
  // steps 2 and 3 so progress survives a refresh mid-job. Status is only
  // forced to "live" for the live-job workflow — editing an already
  // "completed" report should not resurrect it.
  // nextStep is the step the operator is resuming at next time they reopen
  // this report (e.g. Step 2's "Next" passes 3), so current_step in the DB
  // always reflects where they actually left off, not a hardcoded step.
  const persistProgress = async (nextStep) => {
    const incidentId = editId || liveIncidentId;
    if (!incidentId) return;

    const uploadedFiles = await uploadFiles();
    const updateData = { ...formData, currentStep: nextStep };

    if (uploadedFiles.length > 0) {
      updateData.files = [...(formData.files || []), ...uploadedFiles];
    }

    if (!editId || isEditingLiveIncident) {
      updateData.status = "live";
    }

    await staffService.updateIncidentReport(
      incidentId,
      updateData,
      userProfile.uid,
      userProfile.displayName,
    );

    if (uploadedFiles.length > 0) {
      setFormData((prev) => ({ ...prev, files: updateData.files }));
      setArrivalFiles([]);
      setDropoffFiles([]);
    }
  };

  // Step 1: Start Job — creates the live incident (new job), or updates the
  // Start Job fields in place when editing an existing report.
  const handleStep1Submit = async (e) => {
    e.preventDefault();

    if (!formData.scheme || !formData.date || !formData.firstName) {
      toast.error("Please fill in all required fields for Start Job");
      return;
    }

    setLoading(true);

    try {
      const step1Data = {
        ...formData,
        firstName: formData.firstName.trim(),
      };

      if (editId) {
        await staffService.updateIncidentReport(
          editId,
          step1Data,
          userProfile.uid,
          userProfile.displayName,
        );
        setCurrentStep(2);
      } else {
        const { id: newIncidentId, referenceId: newRefId } =
          await staffService.submitIncidentReport(
            step1Data,
            userProfile.uid,
            userProfile.displayName,
            "live", // Status = live
          );

        toast.success("Job Sheet started! Please complete it once the job is done.");

        setLiveIncidentId(newIncidentId);
        setExistingReferenceId(newRefId);
        setIsEditingLiveIncident(true);
        setCurrentStep(2);
      }
    } catch (error) {
      console.error("Error submitting Start Job:", error);
      toast.error("Failed to save Job Sheet. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: On Scene — save progress and continue to Drop-Off Sheet.
  const handleStep2Next = async (e) => {
    e.preventDefault();

    if (!formData.timeOfArrival || !formData.markerPost) {
      toast.error("Please fill in all required fields for On Scene");
      return;
    }

    if (
      !formData.driverOnScene &&
      !formData.policeOnScene &&
      !formData.nhOnScene &&
      !formData.ripvOnScene &&
      !formData.otherOnScene
    ) {
      toast.error("Please select at least one On Scene option");
      return;
    }

    if (formData.otherOnScene && !formData.otherOnSceneDetails.trim()) {
      toast.error("Please specify who else was on scene");
      return;
    }

    const savedArrivalImages = (formData.files || []).filter(
      (file) => file.stage === "arrival",
    );
    if (savedArrivalImages.length === 0 && arrivalFiles.length === 0) {
      toast.error("Please upload at least one Arrival Image");
      return;
    }

    setLoading(true);
    try {
      await persistProgress(3);
      setCurrentStep(3);
    } catch (error) {
      console.error("Error saving On Scene details:", error);
      toast.error("Failed to save progress. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Drop-Off Sheet — save progress and continue to the Customer page.
  const handleStep3Next = async (e) => {
    e.preventDefault();

    const savedDropoffImages = (formData.files || []).filter(
      (file) => file.stage === "dropoff",
    );
    if (savedDropoffImages.length === 0 && dropoffFiles.length === 0) {
      toast.error("Please upload at least one Unloaded Image");
      return;
    }

    setLoading(true);
    try {
      await persistProgress(4);
      setCurrentStep(4);
    } catch (error) {
      console.error("Error saving Drop-Off Sheet details:", error);
      toast.error("Failed to save progress. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Save progress on the current step without completing — keeps status as
  // "live". Operator can return to the form later and find fields filled in.
  const handleSave = async () => {
    const incidentId = editId || liveIncidentId;
    if (!incidentId) return;

    setLoading(true);
    try {
      const uploadedFiles = await uploadFiles();
      const signatureUrl = await uploadSignatureIfNeeded();
      const updateData = { ...formData, signatureUrl, currentStep };

      if (uploadedFiles.length > 0) {
        updateData.files = [...(formData.files || []), ...uploadedFiles];
      } else if (formData.files) {
        updateData.files = formData.files;
      }

      // Explicitly keep status as live — do NOT complete it
      updateData.status = "live";

      await staffService.updateIncidentReport(
        incidentId,
        updateData,
        userProfile.uid,
        userProfile.displayName,
      );

      toast.success("Progress saved! Job Sheet is still live.");
      navigate(basePath);
    } catch (error) {
      console.error("Error saving progress:", error);
      toast.error("Failed to save progress. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Emails the customer a PDF copy of the completed Job Sheet, if they
  // opted in at sign-off. Best-effort: any failure here only shows a toast
  // warning, it must never block or roll back the report save that already
  // succeeded by the time this runs. The API route itself is idempotent
  // (guards against a duplicate send), so this is safe to call every time
  // this report genuinely completes.
  const sendReportCopyEmail = async (data, incidentId, referenceId) => {
    if (!data.sendReportCopy) return;
    const customerEmail = (data.storageEmail || "").trim();
    if (!EMAIL_RE.test(customerEmail)) return;

    try {
      const pdfBlob = await generateReportPDF(data, "incident", { asBlob: true });
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
          reportId: incidentId,
          referenceId,
          customerEmail,
          customerName: data.name,
          pdfBase64,
        }),
      });

      if (!response.ok) throw new Error("send-report-email request failed");
    } catch (error) {
      console.error("Failed to email report copy:", error);
      toast.error(
        "Job Sheet saved, but we couldn't email the customer's copy. Please offer a printed copy.",
      );
    }
  };

  // Step 4: Customer Page — complete the Job Sheet (or regular submit for
  // the legacy non-staged workflow).
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.scheme || !formData.date || !formData.firstName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      const uploadedFiles = await uploadFiles();
      const signatureUrl = await uploadSignatureIfNeeded();
      const trimmedData = {
        ...formData,
        firstName: formData.firstName.trim(),
        markerPost: formData.markerPost.trim(),
        jobSource: formData.jobSource.trim(),
        customerLogNo: formData.customerLogNo.trim(),
        vehicleRegNo: formData.vehicleRegNo.trim(),
        faultReported: formData.faultReported.trim(),
        actualFault: formData.actualFault.trim(),
        notes: formData.notes.trim(),
        recoveryDestination: formData.recoveryDestination.trim(),
        storageName: formData.storageName.trim(),
        storageAddress: formData.storageAddress.trim(),
        storageContactNo: formData.storageContactNo.trim(),
        storageEmail: formData.storageEmail.trim(),
        name: formData.name.trim(),
        customerContactNo: formData.customerContactNo.trim(),
        customerAddress: formData.customerAddress.trim(),
        signatureUrl,
      };
      const dataWithTimings = calculateTimeDifferences(trimmedData);

      // Use editId from URL or liveIncidentId from state
      const incidentId = editId || liveIncidentId;

      if (incidentId) {
        // Update existing form
        const updateData = { ...dataWithTimings };

        if (uploadedFiles.length > 0) {
          updateData.files = [...(formData.files || []), ...uploadedFiles];
        } else if (formData.files) {
          updateData.files = formData.files;
        }

        // If completing a live job, set status to completed
        if (isEditingLiveIncident) {
          updateData.status = "completed";
        }

        await staffService.updateIncidentReport(
          incidentId,
          updateData,
          userProfile.uid,
          userProfile.displayName,
          isEditingLiveIncident,
        );

        // Only the genuine "customer just signed off" completion should
        // trigger the copy email — not a later admin edit of an
        // already-completed report.
        if (isEditingLiveIncident) {
          await sendReportCopyEmail(dataWithTimings, incidentId, existingReferenceId);
        }

        if (isEditingLiveIncident) {
          toast.success("Job Sheet completed successfully!");
        } else {
          toast.success("Job Sheet updated successfully!");
        }
        navigate(basePath);
      } else {
        // Submit new form (regular flow - not using the staged workflow)
        const { id: newIncidentId, referenceId: newReferenceId } =
          await staffService.submitIncidentReport(
            {
              ...dataWithTimings,
              files: uploadedFiles,
            },
            userProfile.uid,
            userProfile.displayName,
            "submitted",
          );

        await sendReportCopyEmail(dataWithTimings, newIncidentId, newReferenceId);

        toast.success("Job Sheet submitted successfully!");

        // Reset form
        setFormData(emptyFormData(userProfile));
        setArrivalFiles([]);
        setDropoffFiles([]);
        setSourceOtherMode(false);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to submit form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Reusable Yes/No radio pair for the Drop-Off Sheet's operational checks.
  const YesNoField = ({ label, value, onChange }) => (
    <div>
      <label className="label">
        <span className="label-text font-semibold mb-2">{label}</span>
      </label>
      <div className="flex gap-6">
        {["Yes", "No"].map((option) => (
          <label key={option} className="cursor-pointer flex items-center gap-2">
            <input
              type="radio"
              checked={value === option}
              onChange={() => onChange(option)}
              className="radio"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );

  // stage is "arrival" (Step 2) or "dropoff" (Step 3) — each gets its own
  // saved-files filter and its own new-files staging array so the two boxes
  // never show each other's attachments.
  const renderFileUpload = (inputId, label, stage) => {
    const savedForStage = (formData.files || [])
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => file.stage === stage);
    const newForStage = filesForStage(stage);

    return (
      <div>
        <label className="label">
          <span className="label-text font-semibold">{label} <span className="text-red-500">*</span> </span>
        </label>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, stage)}
        >
          <input
            type="file"
            multiple
            onChange={(e) => handleFileSelect(e, stage)}
            className="hidden"
            id={inputId}
            accept="image/*,video/*,.pdf"
          />
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-brand-600 font-semibold mb-1">Browse Files</p>
            <p className="text-gray-500 text-sm">Drag and drop files here</p>
          </label>

          {savedForStage.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Saved files</p>
              {savedForStage.map(({ file, index }) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-blue-50 p-2 rounded"
                >
                  <span className="text-sm text-gray-700 truncate">{file.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removeExistingFile(index)}
                    className="text-red-500 hover:text-red-700 shrink-0 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {newForStage.length > 0 && (
            <div className="mt-4 space-y-2">
              {savedForStage.length > 0 && <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">New files</p>}
              {newForStage.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded"
                >
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(stage, index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Step 1 — Start Job
  const renderStep1 = () => (
    <form
      onSubmit={handleStep1Submit}
      className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6"
    >
      <StepIndicator currentStep={currentStep} />

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
        <p className="text-brand-700 font-medium">Step 1: Start Job</p>
        <p className="text-brand-600 text-sm mt-1">
          Capture the initial call details. Submitting makes this a live
          incident visible to admin and the client.
        </p>
      </div>

      {/* Operator and Scheme */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Operator <span className="text-red-500">*</span>
            </span>
          </label>
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
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
            name="scheme"
            value={formData.scheme}
            onChange={handleChange}
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

      {/* Driver Name and Vehicle Allocated */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Driver Name <span className="text-red-500">*</span>
            </span>
          </label>
          <input
            type="text"
            name="driverName"
            value={formData.driverName}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            maxLength={100}
            required
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Vehicle Allocated <span className="text-red-500">*</span>
            </span>
          </label>
          <select
            name="vehicleAllocated"
            value={formData.vehicleAllocated}
            onChange={handleChange}
            className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            required
          >
            <option value="">Please Select</option>
             {VEHICLE_ALLOCATED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Source of Call and Recovery Log Number */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Source of Call <span className="text-red-500">*</span>
            </span>
          </label>
          <select
            value={sourceOtherMode ? "Other" : formData.jobSource}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "Other") {
                setSourceOtherMode(true);
                setFormData((prev) => ({ ...prev, jobSource: "" }));
              } else {
                setSourceOtherMode(false);
                setFormData((prev) => ({ ...prev, jobSource: value }));
              }
            }}
            className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            required
          >
            <option value="">Please Select</option>
            {SOURCE_OF_CALL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="Other">Other</option>
          </select>
          {sourceOtherMode && (
            <input
              type="text"
              placeholder="Enter source of call"
              value={formData.jobSource}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, jobSource: e.target.value }))
              }
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full mt-3"
              maxLength={100}
            />
          )}
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Recovery Log Number</span>
          </label>
          <input
            type="text"
            value={existingReferenceId || "Will be assigned when created"}
            disabled
            className="input bg-gray-100 border-gray-300 rounded-lg w-full text-gray-500"
          />
        </div>
      </div>

      {/* Date of Receipt, Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Date of Receipt (DD/MM/YYYY) <span className="text-red-500">*</span>
            </span>
          </label>
          <input
            type="text"
            name="date"
            value={formData.date}
            onChange={handleChange}
            placeholder="DD/MM/YYYY"
            pattern="\d{2}/\d{2}/\d{4}"
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            required
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Time <span className="text-red-500">*</span>
            </span>
          </label>
          <input
            type="time"
            name="time"
            value={formData.time}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            required
          />
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || uploadingFiles}
            className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
          >
            {loading ? (
              editId ? "Saving..." : "Creating..."
            ) : (
              <>
                {editId ? "Next" : "Create Job Sheet"}
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  // Step 2 — On Scene: gated behind a "Click when on Scene" button, which
  // auto-captures Time of Arrival as the moment it's tapped, matching the
  // paper Job Sheet's "Time On Scene — auto-recorded when button pressed".
  const handleClickOnScene = () => {
    setFormData((prev) => ({
      ...prev,
      timeOfArrival: new Date().toTimeString().slice(0, 5),
    }));
  };

  const renderStep2 = () => {
    const hasClockedOnScene = Boolean(formData.timeOfArrival);

    return (
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6">
        <StepIndicator currentStep={currentStep} />

        <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
          <p className="text-brand-700 font-medium">Step 2: On Scene</p>
          <p className="text-brand-600 text-sm mt-1">
            Fill in the details on arrival at the scene.
          </p>
        </div>

        {!hasClockedOnScene ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <button
              type="button"
              onClick={handleClickOnScene}
              className="px-10 py-5 bg-brand-500 text-white rounded-xl hover:bg-brand-700 transition-colors font-bold text-lg"
            >
              Click when on Scene
            </button>
            <p className="text-sm text-gray-500">
              Tap this the moment you arrive — it records your Time of Arrival.
            </p>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="mt-4 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          </div>
        ) : (
          <form onSubmit={handleStep2Next} className="space-y-6">
            {/* On-scene checkboxes */}
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2">
                  On Scene
                  </span>
              </label>
              <div className="flex flex-wrap gap-6">
                {[
                  ["driverOnScene", "Driver on scene"],
                  ["policeOnScene", "Police on scene"],
                  ["nhOnScene", "NH on scene"],
                  ["ripvOnScene", "RIPV on scene"],
                  ["otherOnScene", "Other on scene (please specify)"]
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="onScene"
                      className="checkbox checkbox-sm border-gray-400"
                      checked={formData[key]}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
              {formData.otherOnScene && (
                <input
                  type="text"
                  name="otherOnSceneDetails"
                  placeholder="Please specify who else was on scene"
                  value={formData.otherOnSceneDetails}
                  onChange={handleChange}
                  className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full mt-3"
                />
              )}
            </div>

            {/* Time of Arrival, Marker Post */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="label">
                  <span className="label-text font-semibold mb-2">
                    Time of Arrival <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  name="timeOfArrival"
                  value={formData.timeOfArrival}
                  onChange={handleChange}
                  className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                  required
                />
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold mb-2">
                    Marker Post <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="text"
                  name="markerPost"
                  placeholder="e.g., 2.3"
                  value={formData.markerPost}
                  onChange={handleChange}
                  className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                  maxLength={50}
                  required
                />
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold mb-2">
                    Vehicle Type <span className="text-red-500">*</span>
                    </span>
                </label>
                <select
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                  required
                >
                  <option value="">Please select</option>
                  <option value="Car">Car</option>
                  <option value="Car+ Trailer">Car+ Trailer</option>
                  <option value="Van">Van</option>
                  <option value="HGV">HGV</option>
                  <option value="Motorbike">Motorbike</option>
                  <option value="Coach/Bus">Coach/Bus</option>
                </select>
              </div>
            </div>

            {renderFileUpload("file-upload-step2", "Arrival Images", "arrival")}

            {/* Time Cleared */}
            <div>
              <label className="label">
                <span className="label-text font-semibold mb-2 mr-2">
                  Time Cleared <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="time"
                name="timeCompleted"
                value={formData.timeCompleted}
                onChange={handleChange}
                className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full md:w-1/3"
              />
              <p className="text-xs text-gray-400 mt-1">Record when the scene is cleared.</p>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <div className="flex gap-3">
                {(isEditingLiveIncident || editId) && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || uploadingFiles}
                    className="px-6 py-3 border border-brand-500 text-brand-600 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors font-semibold"
                  >
                    {loading ? "Saving..." : "Save & Return"}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || uploadingFiles}
                  className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
                >
                  {loading ? "Saving..." : uploadingFiles ? "Uploading Files..." : (
                    <>
                      Next
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    );
  };

  // Step 3 — Drop-Off Sheet
  const renderStep3 = () => (
    <form
      onSubmit={handleStep3Next}
      className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6"
    >
      <StepIndicator currentStep={currentStep} />

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
        <p className="text-brand-700 font-medium">Step 3: Drop-Off Sheet</p>
        <p className="text-brand-600 text-sm mt-1">
          Record the vehicle details, fault, and condition checks.
        </p>
      </div>

      {/* Vehicle Details */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Vehicle Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Reg. No. <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              name="vehicleRegNo"
              value={formData.vehicleRegNo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={20}
              required
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Make / Model <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              name="vehicleMakeModel"
              value={formData.vehicleMakeModel}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Colour<span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              name="vehicleColour"
              value={formData.vehicleColour}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={50}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Transmission<span className="text-red-500">*</span>
              </span>
            </label>
              <select
              name="transmission"
              value={formData.transmission}
              onChange={handleChange}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              required
            >
              <option value="">Please Select</option>
              {VEHICLE_TRANSMISSION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                No. Passengers <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              name="noOfPassengers"
              value={formData.noOfPassengers}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={10}
              required
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Speedo <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              name="speedo"
              value={formData.speedo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={20}
              required
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm border-gray-400"
              checked={formData.hasCaravanTrailer}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  hasCaravanTrailer: e.target.checked,
                  trailerNumber: e.target.checked ? prev.trailerNumber : "",
                }))
              }
            />
            <span className="label-text font-semibold">Caravan / Trailer</span>
          </label>

          {formData.hasCaravanTrailer && (
            <div className="mt-3 md:w-1/3">
              <label className="label">
                <span className="label-text font-semibold mb-2">Trailer Number</span>
              </label>
              <input
                type="text"
                name="trailerNumber"
                value={formData.trailerNumber}
                onChange={handleChange}
                className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                maxLength={50}
              />
            </div>
          )}
        </div>
      </div>

      {/* Fault */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Fault Reported <span className="text-red-500">*</span>
            </span>
          </label>
           <select
              name="faultReported"
              value={sourceOtherMode ? "Other" : formData.faultReported}
               onChange={(e) => {
              const value = e.target.value;
              if (value === "Other") {
                setSourceOtherMode(true);
                setFormData((prev) => ({ ...prev, faultReported: "" }));
              } else {
                setSourceOtherMode(false);
                setFormData((prev) => ({ ...prev, faultReported: value }));
              }
            }}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              required
            >
              <option value="">Please Select</option>
              {INCIDENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {sourceOtherMode && (
            <input
              type="text"
              placeholder="Enter Fault Reported"
              value={formData.faultReported}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, faultReported: e.target.value }))
              }
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full mt-3"
              maxLength={100}
            />
          )}

        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Actual Fault <span className="text-red-500">*</span>
            </span>
          </label>
          <select
              name="actualFault"
              value={sourceOtherMode ? "Other" : formData.actualFault}
              required
            onChange={(e) => {
              const value = e.target.value;
              if (value === "Other") {
                setSourceOtherMode(true);
                setFormData((prev) => ({ ...prev, actualFault: "" }));
              } else {
                setSourceOtherMode(false);
                setFormData((prev) => ({ ...prev, actualFault: value }));
              }
            }}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            >
              <option value="">Please Select</option>
              {ACTUAL_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {sourceOtherMode && (
            <input
              type="text"
              placeholder="Enter Actual Fault"
              value={formData.actualFault}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, actualFault: e.target.value }))
              }
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full mt-3"
              maxLength={100}
            />
          )}
        </div>
      </div>

      {/* Checks */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Checks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CHECK_ITEMS.map(({ key, label }) => (
            <YesNoField
              key={key}
              label={label}
              value={formData.checks[key]}
              onChange={(value) => handleCheckToggle(key, value)}
            />
          ))}
        </div>
      </div>

      {/* Vehicle Condition */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">
          Vehicle Condition Checks{" "}
          <span className="text-gray-400 font-normal text-sm">
            (dents, breaks & scratches, or mark N/A)
          </span>
        </h3>
        <div className="space-y-3">
          {VEHICLE_CONDITION_SECTIONS.map(({ key, label }) => (
            <div key={key} className="flex flex-col md:flex-row md:items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer md:w-48 shrink-0">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm border-gray-400"
                  checked={formData.vehicleCondition[key].damage}
                  onChange={(e) =>
                    handleConditionChange(key, "damage", e.target.checked)
                  }
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
              {formData.vehicleCondition[key].damage && key !== "N/A" && (
                <input
                  type="text"
                  placeholder="Describe the damage"
                  value={formData.vehicleCondition[key].note}
                  onChange={(e) => handleConditionChange(key, "note", e.target.value)}
                  className="input input-sm bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
                  maxLength={200}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {renderFileUpload("file-upload-step3", "Unloaded Images", "dropoff")}

      {/* Submit Buttons */}
      <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
        <button
          type="button"
          onClick={() => setCurrentStep(2)}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <div className="flex gap-3">
          {(isEditingLiveIncident || editId) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || uploadingFiles}
              className="px-6 py-3 border border-brand-500 text-brand-600 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors font-semibold"
            >
              {loading ? "Saving..." : "Save & Return"}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || uploadingFiles}
            className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-semibold flex items-center gap-2"
          >
            {loading ? "Saving..." : uploadingFiles ? "Uploading Files..." : (
              <>
                Next
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  // Step 4 — Customer Page
  const renderStep4 = () => (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6"
    >
      <StepIndicator currentStep={currentStep} />

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
        <p className="text-brand-800 font-medium">Step 4: Customer Page</p>
        <p className="text-brand-600 text-sm mt-1">
          Finish the drop-off and collect the customer's sign-off.
        </p>
      </div>

      {/* Recovery Destination */}
      <div>
        <label className="label">
          <span className="label-text font-semibold mb-2">
            Drop-Off Destination <span className="text-red-500">*</span>
          </span>
        </label>
        <input
          type="text"
          name="recoveryDestination"
          value={formData.recoveryDestination}
          onChange={handleChange}
          className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          maxLength={200}
          required
        />
      </div>

      {/* Storage details */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">
          Is vehicle in Storage? Complete if so
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Storage Name
              </span>
            </label>
            <input
              type="text"
              name="storageName"
              value={formData.storageName}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={100}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Storage Address</span>
            </label>
            <input
              type="text"
              name="storageAddress"
              value={formData.storageAddress}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={200}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Storage Contact No. <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              name="storageContactNo"
              value={formData.storageContactNo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={30}
           
            />
          </div>
        </div>
      </div>

      {/* Property Removed / Vehicle Outcome */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Property Removed</span>
          </label>
          <div className="flex gap-6">
            {["At Scene", "At Depot", "N/A"].map((option) => (
              <label key={option} className="cursor-pointer flex items-center gap-2">
                <input
                  type="radio"
                  name="propertyRemoved"
                  value={option}
                  checked={formData.propertyRemoved === option}
                  onChange={handleChange}
                  className="radio"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Vehicle Repaired / Recovered</span>
          </label>
          <div className="flex gap-6">
            {["Repaired", "Recovered"].map((option) => (
              <label key={option} className="cursor-pointer flex items-center gap-2">
                <input
                  type="radio"
                  name="vehicleOutcome"
                  value={option}
                  checked={formData.vehicleOutcome === option}
                  onChange={handleChange}
                  className="radio"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Customer/Driver Service Acceptance */}
      <div >
        <h3 className="font-semibold text-gray-800 mb-3 ">
          Customer Acceptance
        </h3>
        <div className="space-y-4">
          {SERVICE_ACCEPTANCE_STATEMENTS.map((statement, index) => (
            <label
              key={index}
              className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm border-gray-400 mt-1"
                checked={formData.serviceAcceptance[index]}
                onChange={() => handleAcceptanceToggle(index)}
              />
              <span className="text-sm text-gray-700">
                {index + 1}. {statement}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Sign Off */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Sign Off</h3>
        <p className="text-sm text-gray-600 mb-3">
          I am totally satisfied with the recovery operator's assistance and
          acceptance of damage-free recovery / repair, and I can confirm the
          recovered vehicle(s) is parked to my satisfaction.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Customer Name <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={100}
              required
            />
            <label className="cursor-pointer flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm border-gray-400"
                checked={formData.satisfactionConfirmed}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    satisfactionConfirmed: e.target.checked,
                  }))
                }
              />
              <span className="label-text font-semibold">
                Confirms satisfaction with the service
              </span>
            </label>
          </div>
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Email Address</span>
            </label>
            <input
              type="email"
              name="storageEmail"
              value={formData.storageEmail}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={200}
            />
            <label className="cursor-pointer flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm border-gray-400"
                checked={formData.sendReportCopy}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sendReportCopy: e.target.checked,
                  }))
                }
              />
              <span className="label-text font-semibold">
                Send me a copy of this report
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Contact No.</span>
            </label>
            <input
              type="tel"
              name="customerContactNo"
              value={formData.customerContactNo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={20}
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Address</span>
            </label>
            <input
              type="text"
              name="customerAddress"
              value={formData.customerAddress}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={200}
            />
          </div>
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Customer Signature</span>
          </label>
          {formData.signatureUrl && !isRedrawingSignature ? (
            <div className="space-y-2">
              <img
                src={formData.signatureUrl}
                alt="Signature"
                className="border border-gray-300 rounded-lg bg-white h-40 object-contain"
              />
              <button
                type="button"
                onClick={() => setIsRedrawingSignature(true)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Redraw signature
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <SignaturePad ref={signaturePadRef} />
              <button
                type="button"
                onClick={() => signaturePadRef.current?.clear()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
        <button
          type="button"
          onClick={() => setCurrentStep(3)}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <div className="flex gap-3">
          {(isEditingLiveIncident || editId) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || uploadingFiles}
              className="px-6 py-3 border border-brand-500 text-brand-600 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors font-semibold"
            >
              {loading ? "Saving..." : "Save & Return"}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || uploadingFiles}
            className="px-8 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-semibold"
          >
            {loading
              ? editId
                ? "Updating..."
                : "Submitting..."
              : uploadingFiles
                ? "Uploading Files..."
                : isEditingLiveIncident
                  ? "Complete Job Sheet"
                  : editId
                    ? "Update"
                    : "Submit"}
          </button>
        </div>
      </div>
    </form>
  );

  const renderCurrentStep = () => {
    if (currentStep === 1) return renderStep1();
    if (currentStep === 2) return renderStep2();
    if (currentStep === 3) return renderStep3();
    return renderStep4();
  };

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {editId
              ? isEditingLiveIncident
                ? "Complete Job Sheet"
                : "Edit Job Sheet"
              : "Job Sheet"}
          </h2>
        </div>
        {/* Render current step */}
        {loading && !formData.scheme ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-brand-500"></span>
          </div>
        ) : (
          renderCurrentStep()
        )}
      </div>
    </StaffSidebarLayout>
  );
};

export default IncidentReportFormPage;
