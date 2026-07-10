import { jsPDF } from "jspdf";
import lenselogo from "../assets/chellanpng.png";
import { SCHEMES } from "./schemes";
import {
  SERVICE_ACCEPTANCE_STATEMENTS,
  VEHICLE_CONDITION_SECTIONS,
  CHECK_ITEMS,
} from "./incidentForm";

// Cache for compressed logo to avoid re-processing
let cachedCompressedLogo = null;

/**
 * Compress logo image to reduce PDF size
 * Converts PNG to compressed JPEG and caches the result
 */
const getCompressedLogo = () => {
  return new Promise((resolve) => {
    if (cachedCompressedLogo) {
      resolve(cachedCompressedLogo);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // 3x display size for retina quality (logo displays at 50x25)
      canvas.width = 150;
      canvas.height = 75;
      const ctx = canvas.getContext("2d");
      // White background for transparency
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Compress to JPEG at 70% quality
      cachedCompressedLogo = canvas.toDataURL("image/jpeg", 0.7);
      resolve(cachedCompressedLogo);
    };
    img.onerror = () => {
      // Fallback to original if compression fails
      resolve(lenselogo);
    };
    img.src = lenselogo;
  });
};

/**
 * Fetch a (same-origin-CORS-enabled) image URL and convert it to a PNG data
 * URL so jsPDF can embed it. Resolves null on any failure so callers can fall
 * back to a text field instead of breaking PDF generation.
 */
const loadImageAsDataUrl = (url) => {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

/**
 * Generate PDF for any report type
 * @param {Object} report - The report data
 * @param {string} reportType - Type of report (incident, asset-damage, daily-occurrence, cctv-check)
 * @param {string} filterSchemeId - Optional scheme ID to filter CCTV sections (for client view)
 */
export const generateReportPDF = async (
  report,
  reportType,
  filterSchemeId = null,
) => {
  const doc = new jsPDF({ compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPosition = 20;

  // Helper function to add text with word wrap
  const addText = (text, x, y, options = {}) => {
    const {
      fontSize = 10,
      fontStyle = "normal",
      maxWidth = contentWidth,
    } = options;
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", fontStyle);

    if (text && text.toString().length > 0) {
      const lines = doc.splitTextToSize(text.toString(), maxWidth);
      doc.text(lines, x, y);
      return lines.length * (fontSize * 0.35); // Return height used
    }
    return 0;
  };

  // Helper to format date
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Helper to format time
  const formatTime = (timestamp) => {
    if (!timestamp) return "N/A";

    // If it's already a string in time format (HH:MM), return it
    if (typeof timestamp === "string" && /^\d{1,2}:\d{2}/.test(timestamp)) {
      return timestamp;
    }

    // Try to convert to Date object
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "N/A";
      }

      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "N/A";
    }
  };

  // Header with white background - increased height for centered logo and text
  doc.setFillColor(255, 255, 255); // White background
  doc.rect(0, 0, pageWidth, 40, "F");

  // Add compressed logo centered on top
  try {
    const compressedLogo = await getCompressedLogo();
    const logoWidth = 50; // Width
    const logoHeight = 25; // Height (adjust ratio to prevent distortion)
    const logoX = (pageWidth - logoWidth) / 2; // Center horizontally
    doc.addImage(
      compressedLogo,
      "JPEG",
      logoX,
      5,
      logoWidth,
      logoHeight,
      undefined,
      "FAST",
    );
  } catch (error) {
    console.error("Error adding logo:", error);
  }

  // Add text centered below the logo
  doc.setTextColor(0, 0, 0); // Black text
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LENSE BY CHELLAN", pageWidth / 2, 35, { align: "center" });

  yPosition = 50;
  doc.setTextColor(0, 0, 0);

  // Report Title Section
  const reportTitles = {
    incident: "K2 Vehicle Recovery Job Sheet",
    "asset-damage": "Asset Damage Report",
    "daily-occurrence": "Daily Occurrence Report",
    "cctv-check": "CCTV Check Report",
  };

  // Title with background
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition - 5, contentWidth, 12, "F");
  doc.setTextColor(0, 0, 0);
  addText(reportTitles[reportType] || "Report", margin + 5, yPosition + 3, {
    fontSize: 14,
    fontStyle: "bold",
  });
  yPosition += 15;

  // Reference ID with improved styling
  if (report.referenceId) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Reference Number: ${report.referenceId}`, margin, yPosition);
    yPosition += 6;
  }

  // Add generation date/time
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")} at ${new Date().toLocaleTimeString("en-GB")}`,
    margin,
    yPosition,
  );
  yPosition += 10;

  // Divider line
  doc.setDrawColor(0, 186, 168); // Teal color
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 12;

  // Helper to add section headers
  const addSectionHeader = (title) => {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFillColor(0, 186, 168); // Teal background
    doc.rect(margin, yPosition - 2, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 3, yPosition + 4);
    yPosition += 12;
    doc.setTextColor(0, 0, 0);
  };

  // Improved field display
  const addField = (label, value, bold = false) => {
    if (value === undefined || value === null) return;

    if (yPosition > 270) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(`${label}:`, margin, yPosition);

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    const valueText = value.toString();
    const lines = doc.splitTextToSize(valueText, contentWidth - 50);
    doc.text(lines, margin + 50, yPosition);

    yPosition += Math.max(lines.length * 5, 7);
  };

  // Basic Information Section
  addSectionHeader("BASIC INFORMATION");

  // For CCTV Check forms, date and time are already in the correct format
  if (reportType === "cctv-check") {
    if (report.date) addField("Report Date", report.date);
    if (report.time) addField("Report Time", report.time);
  } else {
    addField(
      "Report Date",
      formatDate(report.createdAt || report.timestamp || report.date),
    );
    addField(
      "Report Time",
      formatTime(report.createdAt || report.timestamp || report.time),
    );
  }

  // For CCTV check reports: show filtered scheme if client view, otherwise "All Schemes"
  if (reportType === "cctv-check") {
    if (filterSchemeId) {
      const schemeObj = SCHEMES.find((s) => s.id === filterSchemeId);
      const schemeName = schemeObj ? schemeObj.fullName : filterSchemeId;
      addField("Scheme/Location", schemeName);
    } else {
      addField("Scheme/Location", "All Schemes");
    }
  } else if (report.scheme || report.schemeId) {
    addField("Scheme/Location", report.scheme || report.schemeId);
  }

  if (report.location) {
    addField("Specific Location", report.location);
  }

  // Type-specific fields with section headers
  yPosition += 5;

  // Check if report has multiple occurrences (for daily-occurrence reports)
  const hasOccurrences =
    reportType === "daily-occurrence" &&
    report.occurrences &&
    Array.isArray(report.occurrences);

  if (hasOccurrences) {
    addSectionHeader(`DAILY OCCURRENCES (${report.occurrences.length})`);

    report.occurrences.forEach((occurrence, index) => {
      // Occurrence header
      yPosition += 3;
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, yPosition - 3, contentWidth, 10, "F");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Occurrence #${index + 1}`, margin + 3, yPosition + 3);
      yPosition += 12;

      // Occurrence details
      if (occurrence.scheme) addField("Scheme", occurrence.scheme);
      if (occurrence.date) addField("Date", formatDate(occurrence.date));
      if (occurrence.time) addField("Time", formatTime(occurrence.time));
      if (occurrence.location) addField("Location", occurrence.location);
      if (occurrence.urn) addField("URN", occurrence.urn);
      if (occurrence.recoveryRequired !== undefined) {
        addField(
          "Recovery Required",
          occurrence.recoveryRequired ? "Yes" : "No",
        );
      }
      if (occurrence.rcc) addField("RCC", occurrence.rcc);
      if (occurrence.nameInitials)
        addField("Name/Initials", occurrence.nameInitials);
      if (occurrence.description)
        addField("Description", occurrence.description);
      if (occurrence.actionTaken)
        addField("Action Taken", occurrence.actionTaken);

      yPosition += 5;
    });
  } else {
    addSectionHeader("REPORT DETAILS");
  }

  switch (reportType) {
    case "incident": {
      // Arrival Details
      const onScene = [
        report.driverOnScene && "Driver",
        report.policeOnScene && "Police",
        report.nhOnScene && "NH",
        report.ripvOnScene && "RIPV",
      ].filter(Boolean);
      addField("On Scene", onScene.length > 0 ? onScene.join(", ") : "None");
      if (report.firstName) addField("Operator", report.firstName);
      if (report.jobSource) addField("Job Source/Customer", report.jobSource);
      if (report.customerLogNo)
        addField("Customer Log No.", report.customerLogNo);
      if (report.time) addField("Time", report.time);
      if (report.timeOfArrival)
        addField("Time of Arrival", report.timeOfArrival);

      // Vehicle Details
      yPosition += 3;
      addSectionHeader("VEHICLE DETAILS");
      if (report.vehicleRegNo) addField("Reg. No.", report.vehicleRegNo, true);
      if (report.vehicleMakeModel)
        addField("Make / Model", report.vehicleMakeModel);
      if (report.vehicleColour) addField("Colour", report.vehicleColour);
      if (report.fuelType) addField("Petrol / Diesel", report.fuelType);
      if (report.manualOrAuto) addField("Manual / Auto", report.manualOrAuto);
      if (report.transmission) addField("Transmission", report.transmission);
      if (report.noOfPassengers)
        addField("No. Passengers", report.noOfPassengers);
      if (report.speedo) addField("Speedo", report.speedo);
      if (report.hasCaravanTrailer)
        addField(
          "Caravan / Trailer",
          report.trailerNumber
            ? `Yes — Trailer No. ${report.trailerNumber}`
            : "Yes",
        );
      if (report.motorcycleType)
        addField("Motorcycle Solo / Combo", report.motorcycleType);

      // Fault & Location
      yPosition += 3;
      addSectionHeader("FAULT & LOCATION");
      if (report.faultReported) addField("Fault Reported", report.faultReported);
      if (report.actualFault) addField("Actual Fault", report.actualFault);
      if (report.markerPost) addField("Marker Post", report.markerPost);
      if (report.notes) addField("Notes", report.notes);

      // Time Information
      yPosition += 3;
      addSectionHeader("TIME INFORMATION");
      if (report.timeOfArrival)
        addField("Time of Arrival", report.timeOfArrival);
      if (report.timeCompleted)
        addField("Time Completed", report.timeCompleted);
      if (report.timeSpottedToOn)
        addField("Response Time", report.timeSpottedToOn);
      if (report.timeOnsiteToCleared)
        addField("Job Duration", report.timeOnsiteToCleared);

      // Completion Details
      yPosition += 3;
      addSectionHeader("COMPLETION DETAILS");
      if (report.recoveryDestination)
        addField("Recovery Destination", report.recoveryDestination);
      if (report.storageName || report.storageAddress || report.storageContactNo) {
        if (report.storageName) addField("Storage Name", report.storageName);
        if (report.storageAddress)
          addField("Storage Address", report.storageAddress);
        if (report.storageContactNo)
          addField("Storage Contact No.", report.storageContactNo);
      }
      if (report.propertyRemoved)
        addField("Property Removed", report.propertyRemoved);
      if (report.vehicleOutcome)
        addField("Vehicle Outcome", report.vehicleOutcome, true);

      // Checks
      if (report.checks) {
        yPosition += 3;
        addSectionHeader("CHECKS");
        CHECK_ITEMS.forEach(({ key, label }) => {
          if (report.checks[key]) addField(label, report.checks[key]);
        });
      }

      // Vehicle Condition
      if (report.vehicleCondition) {
        yPosition += 3;
        addSectionHeader("VEHICLE CONDITION");
        VEHICLE_CONDITION_SECTIONS.forEach(({ key, label }) => {
          const section = report.vehicleCondition[key];
          if (!section) return;
          addField(
            label,
            section.damage ? `Damaged — ${section.note || "no note"}` : "No damage",
          );
        });
      }

      // Customer/Driver Service Acceptance
      if (report.serviceAcceptance) {
        yPosition += 3;
        addSectionHeader("CUSTOMER/DRIVER SERVICE ACCEPTANCE");
        SERVICE_ACCEPTANCE_STATEMENTS.forEach((statement, index) => {
          addField(
            `${index + 1}`,
            report.serviceAcceptance[index] ? "Accepted" : "Not accepted",
          );
        });
      }

      // Sign Off
      yPosition += 3;
      addSectionHeader("SIGN OFF");
      if (report.name) addField("Name", report.name);
      addField(
        "Confirmed Satisfaction",
        report.satisfactionConfirmed ? "Yes" : "No",
      );
      if (report.signatureUrl) {
        const signatureImage = await loadImageAsDataUrl(report.signatureUrl);
        if (signatureImage) {
          if (yPosition > 240) {
            doc.addPage();
            yPosition = 20;
          }
          const imgWidth = 70;
          const imgHeight = (signatureImage.height / signatureImage.width) * imgWidth;
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60, 60, 60);
          doc.text("Signature:", margin, yPosition);
          doc.addImage(
            signatureImage.dataUrl,
            "PNG",
            margin + 50,
            yPosition - 10,
            imgWidth,
            imgHeight,
          );
          yPosition += imgHeight + 5;
        } else {
          addField("Signature", "On file");
        }
      }
      break;
    }

    case "asset-damage":
      if (report.damageType) addField("Damage Type", report.damageType, true);
      if (report.assetName) addField("Asset Name", report.assetName);
      if (report.severity) addField("Severity", report.severity);
      if (report.description) addField("Description", report.description);
      if (report.estimatedCost)
        addField("Estimated Cost", `£${report.estimatedCost}`);
      if (report.repairStatus) addField("Repair Status", report.repairStatus);
      break;

    case "daily-occurrence":
      // Main occurrence details (skip title as it's already shown in occurrences)
      if (report.category) addField("Category", report.category);

      // Additional fields from the occurrence
      if (report.urn) addField("URN", report.urn);
      if (report.recoveryRequired !== undefined) {
        addField("Recovery Required", report.recoveryRequired ? "Yes" : "No");
      }
      if (report.rcc) addField("RCC", report.rcc);
      if (report.nameInitials) addField("Name/Initials", report.nameInitials);

      // Description and Action Taken
      if (report.description) addField("Description", report.description);
      if (report.actionTaken) addField("Action Taken", report.actionTaken);

      // Weather and Traffic
      if (report.weatherConditions)
        addField("Weather Conditions", report.weatherConditions);
      if (report.trafficFlow) addField("Traffic Flow", report.trafficFlow);
      break;

    case "cctv-check":
      // Display submitted by name
      if (report.firstName) {
        addField("Checked By", report.firstName);
      }

      // A66-WJ Section - only show if no filter OR filter matches A66-WJ
      if (
        (!filterSchemeId || filterSchemeId === "A66-WJ") &&
        ((report.a66Cameras && report.a66Cameras.length > 0) || (report.a66Comments && report.a66Comments.trim() !== ""))
      ) {
        yPosition += 3;
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, yPosition - 3, contentWidth, 10, "F");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("A66-WJ", margin + 3, yPosition + 3);
        yPosition += 12;

        if (report.a66Cameras && report.a66Cameras.length > 0) {
          const isNone = report.a66Cameras.includes("NONE");
          if (isNone) {
            addField(
              "CCTV Status",
              "NONE - All cameras working correctly",
              true,
            );
          } else {
            addField(
              "CCTV Issues Reported",
              report.a66Cameras.join(", "),
              true,
            );
          }
        }
        {
          const blackspot = report.a66Blackspot;
          const blackspotYes = blackspot === true || (Array.isArray(blackspot) && blackspot.length > 0 && blackspot[0] !== "All Working Correctly");
          addField("Blackspot Cameras", blackspotYes ? "Yes" : "No");
          addField("TSS Informed", report.a66TssInformed ? "Yes" : "No");
        }
        if (report.a66Comments && report.a66Comments.trim() !== "") {
          addField("Comments", report.a66Comments);
        }
        yPosition += 3;
      }

      // Demo Section - only show if explicitly filtered to DMO1 (never in staff full download)
      if (
        filterSchemeId === "DMO1" &&
        (report.demoCameras || report.demoComments)
      ) {
        yPosition += 3;
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, yPosition - 3, contentWidth, 10, "F");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Demo Scheme", margin + 3, yPosition + 3);
        yPosition += 12;

        if (report.demoCameras && report.demoCameras.length > 0) {
          const isNone = report.demoCameras.includes("NONE");
          if (isNone) {
            addField(
              "CCTV Status",
              "NONE - All cameras working correctly",
              true,
            );
          } else {
            addField(
              "CCTV Issues Reported",
              report.demoCameras.join(", "),
              true,
            );
          }
        }
        {
          const blackspot = report.demoBlackspot;
          const blackspotYes = blackspot === true || (Array.isArray(blackspot) && blackspot.length > 0 && blackspot[0] !== "All Working Correctly");
          addField("Blackspot Cameras", blackspotYes ? "Yes" : "No");
          addField("TSS Informed", report.demoTssInformed ? "Yes" : "No");
        }
        if (report.demoComments && report.demoComments.trim() !== "") {
          addField("Comments", report.demoComments);
        }
        yPosition += 3;
      }
      break;
  }

  // Report Information Section (Status and Submitter)
  yPosition += 5;
  addSectionHeader("REPORT INFORMATION");

  if (report.submittedBy) {
    const submitter =
      typeof report.submittedBy === "object"
        ? report.submittedBy?.name || "Staff Member"
        : report.submittedBy;
    addField("Submitted By", submitter);
  }

  if (report.lastEditedBy) {
    const editor =
      typeof report.lastEditedBy === "object"
        ? report.lastEditedBy?.name || "Staff Member"
        : report.lastEditedBy;
    addField("Last Edited By", editor);
  }

  if (report.status) {
    addField("Status", report.status, true);
  }

  // Add a note section at the bottom
  yPosition += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
    doc.text(
      `Generated on ${new Date().toLocaleDateString(
        "en-GB",
      )} at ${new Date().toLocaleTimeString("en-GB")}`,
      margin,
      doc.internal.pageSize.getHeight() - 10,
    );
  }

  // Generate filename
  const timestamp = new Date().toISOString().split("T")[0];
  const refId = report.referenceId || "report";
  const filename = `${reportType}_${refId}_${timestamp}.pdf`;

  // Save the PDF
  doc.save(filename);
};

/**
 * Generate PDF for CCTV recording details
 * @param {Object} recording - The CCTV recording data
 */
export const generateCCTVRecordingPDF = async (recording) => {
  const doc = new jsPDF({ compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPosition = 20;

  // Helper to format date
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Header with white background - increased height for centered logo and text
  doc.setFillColor(255, 255, 255); // White background
  doc.rect(0, 0, pageWidth, 40, "F");

  // Add compressed logo centered on top
  try {
    const compressedLogo = await getCompressedLogo();
    const logoWidth = 50; // Width
    const logoHeight = 25; // Height (adjust ratio to prevent distortion)
    const logoX = (pageWidth - logoWidth) / 2; // Center horizontally
    doc.addImage(
      compressedLogo,
      "JPEG",
      logoX,
      5,
      logoWidth,
      logoHeight,
      undefined,
      "FAST",
    );
  } catch (error) {
    console.error("Error adding logo:", error);
  }

  // Add text centered below the logo
  doc.setTextColor(0, 0, 0); // Black text
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LENSE BY CHELLAN", pageWidth / 2, 35, { align: "center" });

  yPosition = 50;
  doc.setTextColor(0, 0, 0);

  // Title with background
  const contentWidth = pageWidth - margin * 2;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition - 5, contentWidth, 12, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CCTV Recording Details", margin + 5, yPosition + 3);
  yPosition += 15;

  // Add generation date/time
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")} at ${new Date().toLocaleTimeString("en-GB")}`,
    margin,
    yPosition,
  );
  yPosition += 8;

  // Divider
  doc.setDrawColor(0, 186, 168);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 12;

  // Helper to add section headers
  const addSectionHeader = (title) => {
    doc.setFillColor(0, 186, 168);
    doc.rect(margin, yPosition - 2, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 3, yPosition + 4);
    yPosition += 12;
    doc.setTextColor(0, 0, 0);
  };

  // Improved field display
  const addField = (label, value) => {
    if (!value) return;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(`${label}:`, margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const valueText = value.toString();
    const lines = doc.splitTextToSize(valueText, contentWidth - 50);
    doc.text(lines, margin + 50, yPosition);
    yPosition += Math.max(lines.length * 5, 7);
  };

  // Recording Information Section
  addSectionHeader("RECORDING INFORMATION");

  addField("Camera Number", recording.cameraNumber);
  addField("Location", recording.location);
  addField("Scheme", recording.scheme);
  addField(
    "Recording Date & Time",
    formatDate(recording.uploadedAt || recording.dateTime),
  );

  // File Details Section
  yPosition += 5;
  addSectionHeader("FILE DETAILS");

  addField("File Name", recording.fileName);
  addField(
    "File Size",
    recording.fileSize
      ? `${(recording.fileSize / 1024 / 1024).toFixed(2)} MB`
      : "N/A",
  );
  addField("Duration", recording.duration || "N/A");

  // Notes Section
  if (recording.notes) {
    yPosition += 5;
    addSectionHeader("ADDITIONAL NOTES");

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const notes = doc.splitTextToSize(recording.notes, contentWidth);
    doc.text(notes, margin, yPosition);
    yPosition += notes.length * 6;
  }

  // Add a divider line at the bottom
  yPosition += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Generated on ${new Date().toLocaleDateString(
      "en-GB",
    )} at ${new Date().toLocaleTimeString("en-GB")}`,
    margin,
    doc.internal.pageSize.getHeight() - 10,
  );

  // Save
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `cctv_${recording.cameraNumber}_${timestamp}.pdf`;
  doc.save(filename);
};
