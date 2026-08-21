import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Edit, Trash2, Download } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getStaffBasePath } from "../../utils/constants";
import { staffService } from "../../services/staffService";
import StaffSidebarLayout from "../../components/layout/StaffSidebarLayout";
import { generateReportPDF } from "../../utils/pdfGenerator";

const CabinSafetyCheckView = () => {
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
      const foundForm = await staffService.getCabinHealthSafetyCheckById(id);

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
    navigate(`${basePath}/forms/cabin-safety-check?edit=${id}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this Cabin Health & Safety Check? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await staffService.deleteCabinHealthSafetyCheck(
        id,
        userProfile.uid,
        userProfile.displayName,
      );
      toast.success("Cabin Health & Safety Check deleted successfully");
      navigate(basePath);
    } catch (error) {
      console.error("Failed to delete form:", error);
      toast.error("Failed to delete form");
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateReportPDF(form, "cabin-safety", null);
      toast.success("Downloaded Cabin Health & Safety report as PDF");
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

  const sections = [...new Set((form.checklist || []).map((row) => row.section))];

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">
                Cabin Health & Safety Check Details
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Reference: {form.referenceId || form.id.slice(0, 12)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleDownloadPDF}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleEdit}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-8 space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Cabin No / Plot No
                </label>
                <p className="text-gray-800">{form.cabinOrPlotNo || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Inspection Completed By
                </label>
                <p className="text-gray-800">
                  {form.inspectionCompletedBy || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Site Location
                </label>
                <p className="text-gray-800">{form.siteLocation || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Inspection Date
                </label>
                <p className="text-gray-800">
                  {form.inspectionDate || "N/A"}
                </p>
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

          {/* Checklist sections */}
          {sections.map((sectionName) => (
            <div
              key={sectionName}
              className="p-4 md:p-6 bg-gray-50 rounded-xl border border-gray-200"
            >
              <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">
                {sectionName}
              </h4>
              {/* Mobile: stacked cards so the view never scrolls sideways */}
              <div className="md:hidden space-y-3">
                {form.checklist
                  .filter((row) => row.section === sectionName)
                  .map((row, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg border border-gray-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-gray-800">
                          {row.question}
                        </p>
                        <span className="text-sm font-semibold shrink-0">
                          {row.answer || "—"}
                        </span>
                      </div>
                      {row.comments && (
                        <p className="text-xs text-gray-600 mt-2">
                          <span className="font-semibold text-gray-500">
                            Comments:{" "}
                          </span>
                          {row.comments}
                        </p>
                      )}
                      {row.actionOwner && (
                        <p className="text-xs text-gray-600 mt-1">
                          <span className="font-semibold text-gray-500">
                            Action Owner:{" "}
                          </span>
                          {row.actionOwner}
                        </p>
                      )}
                      {row.completed && (
                        <p className="text-xs text-gray-600 mt-1">
                          <span className="font-semibold text-gray-500">
                            Completed:{" "}
                          </span>
                          {row.completed}
                        </p>
                      )}
                    </div>
                  ))}
              </div>

              {/* Desktop: full table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Question</th>
                      <th className="text-center">Answer</th>
                      <th className="text-left">Comments / Actions</th>
                      <th className="text-left">Action Owner</th>
                      <th className="text-left">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.checklist
                      .filter((row) => row.section === sectionName)
                      .map((row, idx) => (
                        <tr key={idx}>
                          <td className="max-w-xs">{row.question}</td>
                          <td className="text-center font-semibold">
                            {row.answer || "—"}
                          </td>
                          <td>{row.comments || "—"}</td>
                          <td>{row.actionOwner || "—"}</td>
                          <td>{row.completed || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Photos */}
          {form.images?.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">
                Photos
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {form.images.map((image, index) => (
                  <a
                    key={index}
                    href={image.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={image.downloadUrl}
                      alt={image.fileName || `Photo ${index + 1}`}
                      className="w-full h-32 object-cover"
                    />
                  </a>
                ))}
              </div>
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

export default CabinSafetyCheckView;
