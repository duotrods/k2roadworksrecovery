import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Upload, X, ChevronRight } from "lucide-react";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { useAuth } from "../../hooks/useAuth";
import { getStaffBasePath } from "../../utils/constants";
import { staffService } from "../../services/staffService";
import { sendIncidentAlertNotification } from "../../services/emailService";

const r2Client = new S3Client({
  region: "auto",
  endpoint: import.meta.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import StepIndicator from "../../components/staff/incident/StepIndicator";
import SignaturePad from "../../components/staff/incident/SignaturePad";
import { compressImage } from "../../utils/imageCompression";
import { getSchemesForUser } from "../../utils/schemes";
import {
  formatDateToBritish,
  calculateTimeDifferences,
  SERVICE_ACCEPTANCE_STATEMENTS,
  VEHICLE_CONDITION_SECTIONS,
  CHECK_ITEMS,
  createEmptyVehicleCondition,
  createEmptyChecks,
} from "../../utils/incidentForm";

// Builds a fresh Job Sheet form: Part 1 (arrival) fields default to
// "just met this job" state, Part 2 (completion) fields default empty.
const emptyFormData = (userProfile) => ({
  // Part 1 — Arrival
  driverOnScene: false,
  policeOnScene: false,
  nhOnScene: false,
  ripvOnScene: false,
  firstName: userProfile?.displayName || "",
  scheme: "",
  jobSource: "",
  customerLogNo: "",
  date: formatDateToBritish(new Date()),
  time: new Date().toTimeString().slice(0, 5),
  timeOfArrival: "",
  vehicleRegNo: "",
  vehicleMakeModel: "",
  vehicleColour: "",
  fuelType: "",
  manualOrAuto: "",
  transmission: "",
  noOfPassengers: "",
  speedo: "",
  hasCaravanTrailer: false,
  trailerNumber: "",
  motorcycleType: "",
  faultReported: "",
  actualFault: "",
  markerPost: "",
  notes: "",
  // Part 2 — Completion
  timeCompleted: "",
  recoveryDestination: "",
  storageName: "",
  storageAddress: "",
  storageContactNo: "",
  propertyRemoved: "",
  vehicleOutcome: "",
  checks: createEmptyChecks(),
  vehicleCondition: createEmptyVehicleCondition(),
  serviceAcceptance: SERVICE_ACCEPTANCE_STATEMENTS.map(() => false),
  name: "",
  satisfactionConfirmed: false,
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
  const [files, setFiles] = useState([]);

  // Step management: 1 = arrival (Part 1), 2 = completion (Part 2)
  const [currentStep, setCurrentStep] = useState(1);
  const [isEditingLiveIncident, setIsEditingLiveIncident] = useState(false);
  const [liveIncidentId, setLiveIncidentId] = useState(null);
  const [existingReferenceId, setExistingReferenceId] = useState(null);

  const [formData, setFormData] = useState(() => emptyFormData(userProfile));
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
      const reports = await staffService.getIncidentReports(null);
      const report = reports.find((r) => r.id === editId);

      if (report) {
        setExistingReferenceId(report.referenceId || null);
        setFormData({
          driverOnScene: report.driverOnScene || false,
          policeOnScene: report.policeOnScene || false,
          nhOnScene: report.nhOnScene || false,
          ripvOnScene: report.ripvOnScene || false,
          firstName: report.firstName || "",
          scheme: report.scheme || "",
          jobSource: report.jobSource || "",
          customerLogNo: report.customerLogNo || "",
          date: report.date || "",
          time: report.time || "",
          timeOfArrival: report.timeOfArrival || "",
          vehicleRegNo: report.vehicleRegNo || "",
          vehicleMakeModel: report.vehicleMakeModel || "",
          vehicleColour: report.vehicleColour || "",
          fuelType: report.fuelType || "",
          manualOrAuto: report.manualOrAuto || "",
          transmission: report.transmission || "",
          noOfPassengers: report.noOfPassengers || "",
          speedo: report.speedo || "",
          hasCaravanTrailer: report.hasCaravanTrailer || false,
          trailerNumber: report.trailerNumber || "",
          motorcycleType: report.motorcycleType || "",
          faultReported: report.faultReported || "",
          actualFault: report.actualFault || "",
          markerPost: report.markerPost || "",
          notes: report.notes || "",
          timeCompleted: report.timeCompleted || "",
          recoveryDestination: report.recoveryDestination || "",
          storageName: report.storageName || "",
          storageAddress: report.storageAddress || "",
          storageContactNo: report.storageContactNo || "",
          propertyRemoved: report.propertyRemoved || "",
          vehicleOutcome: report.vehicleOutcome || "",
          checks: { ...createEmptyChecks(), ...(report.checks || {}) },
          vehicleCondition: {
            ...createEmptyVehicleCondition(),
            ...(report.vehicleCondition || {}),
          },
          serviceAcceptance:
            report.serviceAcceptance || SERVICE_ACCEPTANCE_STATEMENTS.map(() => false),
          name: report.name || "",
          satisfactionConfirmed: report.satisfactionConfirmed || false,
          signatureUrl: report.signatureUrl || "",
          files: report.files || [],
        });
        setIsRedrawingSignature(false);

        // If editing a live job, go directly to Part 2
        if (report.status === "live") {
          setCurrentStep(2);
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

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
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

  const handleDrop = (e) => {
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

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index) => {
    setFormData((prev) => ({
      ...prev,
      files: (prev.files || []).filter((_, i) => i !== index),
    }));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return [];

    setUploadingFiles(true);
    const uploadPromises = files.map(async (file) => {
      const compressedFile = await compressImage(file);
      const key = `incident-reports/${userProfile.uid}/${Date.now()}_${file.name}`;
      const arrayBuffer = await compressedFile.arrayBuffer();

      await r2Client.send(
        new PutObjectCommand({
          Bucket: import.meta.env.VITE_R2_BUCKET,
          Key: key,
          Body: new Uint8Array(arrayBuffer),
          ContentType: file.type,
        }),
      );

      const downloadUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`;

      return {
        fileName: file.name,
        fileUrl: key,
        downloadUrl,
        fileSize: compressedFile.size,
        fileType: file.type,
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    setUploadingFiles(false);
    return uploadedFiles;
  };

  // Uploads a freshly-drawn signature to R2 and returns its URL. If nothing
  // new was drawn, keeps whatever signature URL is already on the form.
  const uploadSignatureIfNeeded = async () => {
    const pad = signaturePadRef.current;
    if (!pad || pad.isEmpty()) return formData.signatureUrl || "";

    const blob = await pad.toBlob();
    if (!blob) return formData.signatureUrl || "";

    const key = `incident-reports/${userProfile.uid}/${Date.now()}_signature.png`;
    const arrayBuffer = await blob.arrayBuffer();

    await r2Client.send(
      new PutObjectCommand({
        Bucket: import.meta.env.VITE_R2_BUCKET,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: "image/png",
      }),
    );

    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`;
  };

  // Part 1: Submit as Live Job
  const handleStep1Submit = async (e) => {
    e.preventDefault();

    if (
      !formData.scheme ||
      !formData.date ||
      !formData.firstName ||
      !formData.timeOfArrival
    ) {
      toast.error("Please fill in all required fields for Part 1");
      return;
    }

    setLoading(true);

    try {
      const uploadedFiles = await uploadFiles();

      const step1Data = {
        ...formData,
        firstName: formData.firstName.trim(),
        markerPost: formData.markerPost.trim(),
        files: uploadedFiles,
      };

      // Submit as live job
      const { id: newIncidentId, referenceId: newRefId } =
        await staffService.submitIncidentReport(
          step1Data,
          userProfile.uid,
          userProfile.displayName,
          "live", // Status = live
        );

      toast.success("Job Sheet started! Please complete it once the job is done.");

      // Store the new job ID and continue to Part 2
      setLiveIncidentId(newIncidentId);
      setExistingReferenceId(newRefId);
      setIsEditingLiveIncident(true);
      setCurrentStep(2);
    } catch (error) {
      console.error("Error submitting Part 1:", error);
      toast.error("Failed to start Job Sheet. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Save progress on Part 2 without completing — keeps status as "live"
  // Operator can return to the form later and find all fields already filled
  const handleSave = async () => {
    const incidentId = editId || liveIncidentId;
    if (!incidentId) return;

    setLoading(true);
    try {
      const uploadedFiles = await uploadFiles();
      const signatureUrl = await uploadSignatureIfNeeded();
      const updateData = { ...formData, signatureUrl };

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

  // Part 2: Complete the Job Sheet (or regular submit for non-live workflow)
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
        name: formData.name.trim(),
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

        if (isEditingLiveIncident) {
          await sendIncidentAlertNotification(
            {
              ...updateData,
              id: incidentId,
              referenceId: existingReferenceId,
              submittedBy: userProfile.displayName,
            },
            false,
          );
          toast.success("Job Sheet completed successfully!");
        } else {
          toast.success("Job Sheet updated successfully!");
        }
        navigate(basePath);
      } else {
        // Submit new form (regular flow - not using two-part)
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
        await sendIncidentAlertNotification(
          {
            ...dataWithTimings,
            id: newIncidentId,
            referenceId: newReferenceId,
            submittedBy: userProfile.displayName,
          },
          false,
        );

        toast.success("Job Sheet submitted successfully!");

        // Reset form
        setFormData(emptyFormData(userProfile));
        setFiles([]);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to submit form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Reusable Yes/No radio pair for the Part 2 operational checks.
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

  const renderFileUpload = (inputId) => (
    <div>
      <label className="label">
        <span className="label-text font-semibold">Upload Files</span>
      </label>
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id={inputId}
          accept="image/*,video/*,.pdf"
        />
        <label htmlFor={inputId} className="cursor-pointer">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-brand-600 font-semibold mb-1">Browse Files</p>
          <p className="text-gray-500 text-sm">Drag and drop files here</p>
        </label>

        {formData.files?.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Saved files</p>
            {formData.files.map((file, index) => (
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

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {formData.files?.length > 0 && <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">New files</p>}
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-gray-50 p-2 rounded"
              >
                <span className="text-sm text-gray-700">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
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

  // Render Part 1 Form (Arrival)
  const renderStep1 = () => (
    <form
      onSubmit={handleStep1Submit}
      className="bg-white rounded-xl shadow-md p-8 space-y-6"
    >
      <StepIndicator currentStep={currentStep} />

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
        <p className="text-brand-700 font-medium">Part 1: Arrival Details</p>
        <p className="text-brand-600 text-sm mt-1">
          Fill in the details on arrival at the scene. You can complete the
          rest of the Job Sheet once the job is done.
        </p>
      </div>

      {/* On-scene checkboxes */}
      <div>
        <label className="label">
          <span className="label-text font-semibold mb-2">On Scene</span>
        </label>
        <div className="flex flex-wrap gap-6">
          {[
            ["driverOnScene", "Driver on scene"],
            ["policeOnScene", "Police on scene"],
            ["nhOnScene", "NH on scene"],
            ["ripvOnScene", "RIPV on scene"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
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

      {/* Job Source / Customer Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Job Source/Customer</span>
          </label>
          <input
            type="text"
            name="jobSource"
            value={formData.jobSource}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            maxLength={100}
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Customer Log No.</span>
          </label>
          <input
            type="text"
            name="customerLogNo"
            value={formData.customerLogNo}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            maxLength={50}
          />
        </div>
      </div>

      {/* Date of Receipt, Time, Time of Arrival */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <span className="label-text font-semibold mb-2">Time</span>
          </label>
          <input
            type="time"
            name="time"
            value={formData.time}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          />
        </div>

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
      </div>

      {/* Notes */}
      <div>
        <label className="label">
          <span className="label-text font-semibold mb-2">Notes</span>
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={4}
          className="textarea bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          maxLength={2000}
        />
      </div>

      {renderFileUpload("file-upload")}

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
              "Creating..."
            ) : uploadingFiles ? (
              "Uploading..."
            ) : (
              <>
                Create Job Sheet
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  // Render Part 2 Form (Completion)
  const renderStep2 = () => (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-md p-8 space-y-6"
    >
      {isEditingLiveIncident && <StepIndicator currentStep={currentStep} />}

      {isEditingLiveIncident && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
          <p className="text-brand-800 font-medium">Part 2: Complete Job Sheet</p>
          <p className="text-brand-600 text-sm mt-1">
            Fill in the remaining details to complete this Job Sheet.
          </p>
        </div>
      )}

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

      {/* Vehicle Details */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Vehicle Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Reg. No.</span>
            </label>
            <input
              type="text"
              name="vehicleRegNo"
              value={formData.vehicleRegNo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={20}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Make / Model</span>
            </label>
            <input
              type="text"
              name="vehicleMakeModel"
              value={formData.vehicleMakeModel}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={100}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Colour</span>
            </label>
            <input
              type="text"
              name="vehicleColour"
              value={formData.vehicleColour}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={50}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Petrol / Diesel</span>
            </label>
            <select
              name="fuelType"
              value={formData.fuelType}
              onChange={handleChange}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            >
              <option value="">Please Select</option>
              <option value="Petrol">Petrol</option>
              <option value="Diesel">Diesel</option>
            </select>
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Manual / Auto</span>
            </label>
            <select
              name="manualOrAuto"
              value={formData.manualOrAuto}
              onChange={handleChange}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            >
              <option value="">Please Select</option>
              <option value="Manual">Manual</option>
              <option value="Auto">Auto</option>
            </select>
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Transmission</span>
            </label>
            <input
              type="text"
              name="transmission"
              value={formData.transmission}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={50}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">No. Passengers</span>
            </label>
            <input
              type="text"
              name="noOfPassengers"
              value={formData.noOfPassengers}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={10}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Speedo</span>
            </label>
            <input
              type="text"
              name="speedo"
              value={formData.speedo}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={20}
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Motorcycle Solo / Combo</span>
            </label>
            <select
              name="motorcycleType"
              value={formData.motorcycleType}
              onChange={handleChange}
              className="select bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            >
              <option value="">Not applicable</option>
              <option value="Solo">Solo</option>
              <option value="Combo">Combo</option>
            </select>
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

      {/* Fault Reported / Actual Fault / Location */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Fault Reported</span>
          </label>
          <input
            type="text"
            name="faultReported"
            value={formData.faultReported}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            maxLength={200}
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Actual Fault</span>
          </label>
          <input
            type="text"
            name="actualFault"
            value={formData.actualFault}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
            maxLength={200}
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Location / Marker Post <span className="text-red-500">*</span>
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
      </div>

      {/* Time Completed */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Time of Arrival</span>
          </label>
          <input
            type="time"
            name="timeOfArrival"
            value={formData.timeOfArrival}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          />
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Time Completed</span>
          </label>
          <input
            type="time"
            name="timeCompleted"
            value={formData.timeCompleted}
            onChange={handleChange}
            className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          />
        </div>
      </div>

      {/* Recovery Destination */}
      <div>
        <label className="label">
          <span className="label-text font-semibold mb-2">Recovery Destination</span>
        </label>
        <input
          type="text"
          name="recoveryDestination"
          value={formData.recoveryDestination}
          onChange={handleChange}
          className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
          maxLength={200}
        />
      </div>

      {/* Storage details */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">
          Only complete if vehicle taken into storage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="label">
              <span className="label-text font-semibold mb-2">Name</span>
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
              <span className="label-text font-semibold mb-2">Address</span>
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
              <span className="label-text font-semibold mb-2">Contact No.</span>
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
            {["At Scene", "At Depot"].map((option) => (
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
            <span className="label-text font-semibold mb-2">Vehicle</span>
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
          Vehicle Condition{" "}
          <span className="text-gray-400 font-normal text-sm">
            (dents, breaks & scratches)
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
              {formData.vehicleCondition[key].damage && (
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

      {/* Customer/Driver Service Acceptance */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">
          Customer / Driver Service Acceptance Statements
        </h3>
        <div className="space-y-3">
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
              <span className="label-text font-semibold mb-2">Name</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input bg-white border-gray-300 rounded-lg hover:bg-gray-100 w-full"
              maxLength={100}
            />
          </div>
          <div className="flex items-end">
            <label className="cursor-pointer flex items-center gap-2">
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
        </div>

        <div>
          <label className="label">
            <span className="label-text font-semibold mb-2">Signature</span>
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

      {renderFileUpload("file-upload-step2")}

      {/* Submit Buttons */}
      <div className="flex justify-between gap-4 mt-8 pt-6 border-t">
        <button
          type="button"
          onClick={() => {
            if (!editId && !isEditingLiveIncident) {
              setCurrentStep(1);
            } else {
              navigate(-1);
            }
          }}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {!editId && !isEditingLiveIncident ? "Back to Part 1" : "Cancel"}
        </button>
        <div className="flex gap-3">
          {/* Save & Return — only shown on live jobs so operator can return later */}
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
            className={`px-8 py-3 text-white rounded-lg disabled:opacity-50 transition-colors font-semibold ${
              isEditingLiveIncident
                ? "bg-brand-500 hover:bg-brand-700"
                : "bg-brand-500 hover:bg-brand-600"
            }`}
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
        {/* Render appropriate part */}
        {loading && !formData.scheme ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-brand-500"></span>
          </div>
        ) : currentStep === 1 && !editId ? (
          renderStep1()
        ) : (
          renderStep2()
        )}
      </div>
    </StaffSidebarLayout>
  );
};

export default IncidentReportFormPage;
