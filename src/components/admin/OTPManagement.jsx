import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { inviteCodeService } from "../../services/inviteCodeService";
import { useAuth } from "../../hooks/useAuth";
import { SCHEMES } from "../../utils/schemes";
import {
  Copy,
  Plus,
  CheckCircle,
  XCircle,
  RefreshCw,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const OTPManagement = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("client"); // "client" or "staff"
  const [clientOTPs, setClientOTPs] = useState([]);
  const [staffInviteCodes, setStaffInviteCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    schemeId: "",
    schemeName: "",
    expiresInDays: 30,
    maxUses: 1,
  });

  // Pagination state for client OTPs
  const [clientHasMore, setClientHasMore] = useState(true);
  const [clientTotalCount, setClientTotalCount] = useState(0);
  const [clientCurrentPage, setClientCurrentPage] = useState(1);

  // Pagination state for staff invite codes
  const [staffHasMore, setStaffHasMore] = useState(true);
  const [staffTotalCount, setStaffTotalCount] = useState(0);
  const [staffCurrentPage, setStaffCurrentPage] = useState(1);

  const codesPerPage = 10;

  useEffect(() => {
    loadClientCodes(1);
    loadStaffCodes(1);
  }, []);

  const loadClientCodes = async (page) => {
    setLoading(true);
    try {
      const result = await inviteCodeService.getClientCodesPaginated(page, codesPerPage);
      setClientOTPs(result.otps);
      setClientHasMore(result.hasMore);
      setClientTotalCount(result.total);
      setClientCurrentPage(page);
    } catch (error) {
      console.error("Failed to load client codes:", error);
      toast.error("Failed to load client codes");
    } finally {
      setLoading(false);
    }
  };

  const loadStaffCodes = async (page) => {
    setLoading(true);
    try {
      const result = await inviteCodeService.getStaffCodesPaginated(page, codesPerPage);
      setStaffInviteCodes(result.codes);
      setStaffHasMore(result.hasMore);
      setStaffTotalCount(result.total);
      setStaffCurrentPage(page);
    } catch (error) {
      console.error("Failed to load staff codes:", error);
      toast.error("Failed to load staff codes");
    } finally {
      setLoading(false);
    }
  };

  const loadAllCodes = () => {
    loadClientCodes(1);
    loadStaffCodes(1);
  };

  const handleCreateClientOTP = async (e) => {
    e.preventDefault();

    if (!formData.schemeId || !formData.schemeName) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const otpCode = await inviteCodeService.createClientCode(
        formData.schemeId.toUpperCase(),
        formData.schemeName,
        userProfile.uid,
        userProfile.displayName,
      );

      toast.success(`Client Access Code created: ${otpCode}`);
      setFormData({
        schemeId: "",
        schemeName: "",
        expiresInDays: 30,
        maxUses: 1,
      });
      setShowCreateModal(false);
      loadAllCodes();
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error("Failed to create access code");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaffInvite = async (e) => {
    e.preventDefault();

    setLoading(true);
    try {
      const inviteCode = await inviteCodeService.createStaffInviteCode(
        userProfile.uid,
        userProfile.displayName,
        formData.expiresInDays,
        formData.maxUses,
      );

      toast.success(`Staff Invite Code created: ${inviteCode}`);
      setFormData({
        schemeId: "",
        schemeName: "",
        expiresInDays: 30,
        maxUses: 1,
      });
      setShowCreateModal(false);
      loadAllCodes();
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error("Failed to create staff invite code");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    const date = expiresAt.seconds
      ? new Date(expiresAt.seconds * 1000)
      : new Date(expiresAt);
    return date < new Date();
  };

  // Shared three-state status for every access code. "Used" takes precedence
  // over "Expired" — a consumed code reads Used even if its date later passes.
  const getCodeStatus = (code) => {
    if (code.isUsed) return "used";
    if (isExpired(code.expiresAt)) return "expired";
    return "available";
  };

  const renderStatus = (code) => {
    const status = getCodeStatus(code);
    if (status === "used") {
      return (
        <span className="flex items-center gap-1 text-sm text-gray-500">
          <XCircle className="w-4 h-4" />
          Used
        </span>
      );
    }
    if (status === "expired") {
      return (
        <span className="flex items-center gap-1 text-sm text-red-500">
          <XCircle className="w-4 h-4" />
          Expired
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-sm text-green-600">
        <CheckCircle className="w-4 h-4" />
        Available
      </span>
    );
  };

  const displayCodes = activeTab === "client" ? clientOTPs : staffInviteCodes;
  const availableCount = displayCodes.filter(
    (code) => getCodeStatus(code) === "available",
  ).length;

  // Pagination handlers for client codes
  const clientTotalPages = Math.ceil(clientTotalCount / codesPerPage);

  const handleClientNextPage = () => {
    if (clientHasMore) loadClientCodes(clientCurrentPage + 1);
  };

  const handleClientPrevPage = () => {
    if (clientCurrentPage > 1) loadClientCodes(clientCurrentPage - 1);
  };

  // Pagination handlers for staff codes
  const staffTotalPages = Math.ceil(staffTotalCount / codesPerPage);

  const handleStaffNextPage = () => {
    if (staffHasMore) loadStaffCodes(staffCurrentPage + 1);
  };

  const handleStaffPrevPage = () => {
    if (staffCurrentPage > 1) loadStaffCodes(staffCurrentPage - 1);
  };

  return (
    <div className="max-w-8xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Access Code Management
          </h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">
            Generate and manage codes for client and staff registration
          </p>
        </div>
        <div className="flex justify-between gap-2">
          <button
            onClick={loadAllCodes}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Generate New Code
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab("client")}
          className={`flex items-center gap-2 px-4 py-3 text-[13px] sm:text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "client"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Building2 className="w-5 h-5" />
          Client Access Codes
        </button>
        <button
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 px-4 py-3 text-[13px] sm:text-[14px] font-semibold border-b-2 transition-colors ${
            activeTab === "staff"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-5 h-5" />
          Staff Invite Codes
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Total Codes</p>
          <p className="text-2xl font-bold text-gray-800">
            {activeTab === "client" ? clientTotalCount : staffTotalCount}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Available (Current Page)</p>
          <p className="text-2xl font-bold text-green-600">{availableCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">Used (Current Page)</p>
          <p className="text-2xl font-bold text-gray-400">
            {displayCodes.filter((code) => code.isUsed).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Desktop: table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-brand-500 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Code
                </th>
                {activeTab === "client" ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Scheme
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Expires
                    </th>
                  </>
                ) : activeTab === "staff" ? (
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                    Expires
                  </th>
                ) : null}
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeTab === "client"
                ? clientOTPs.map((otp) => (
                    <tr key={otp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          {otp.otpCode}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {otp.schemeId}
                          </p>
                          <p className="text-xs text-gray-500">
                            {otp.schemeName}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p
                          className={`text-sm ${isExpired(otp.expiresAt) ? "text-red-500" : "text-gray-500"}`}
                        >
                          {formatDate(otp.expiresAt)}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderStatus(otp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(otp.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => copyToClipboard(otp.otpCode)}
                          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                      </td>
                    </tr>
                  ))
                : staffInviteCodes.map((code) => (
                      <tr key={code.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                            {code.inviteCode}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p
                            className={`text-sm ${isExpired(code.expiresAt) ? "text-red-500" : "text-gray-500"}`}
                          >
                            {formatDate(code.expiresAt)}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {renderStatus(code)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(code.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => copyToClipboard(code.inviteCode)}
                            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                          >
                            <Copy className="w-4 h-4" />
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: one card per code instead of a side-scrolling table */}
        <div className="sm:hidden p-3 space-y-3">
          {activeTab === "client"
            ? clientOTPs.map((otp) => (
                <div key={otp.id} className="border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                      {otp.otpCode}
                    </code>
                    <button
                      onClick={() => copyToClipboard(otp.otpCode)}
                      className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                  <p className="font-semibold text-gray-800">{otp.schemeId}</p>
                  <p className="text-xs text-gray-500">{otp.schemeName}</p>
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="text-gray-400">Expires:</span>{" "}
                    <span className={isExpired(otp.expiresAt) ? "text-red-500" : ""}>
                      {formatDate(otp.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    {renderStatus(otp)}
                    <span className="text-xs text-gray-400">
                      Created {formatDate(otp.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            : staffInviteCodes.map((code) => (
                <div key={code.id} className="border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                      {code.inviteCode}
                    </code>
                    <button
                      onClick={() => copyToClipboard(code.inviteCode)}
                      className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="text-gray-400">Expires:</span>{" "}
                    <span className={isExpired(code.expiresAt) ? "text-red-500" : ""}>
                      {formatDate(code.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    {renderStatus(code)}
                    <span className="text-xs text-gray-400">
                      Created {formatDate(code.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
        </div>

        {displayCodes.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-500">No codes generated yet</p>
          </div>
        )}

        {/* Pagination */}
        {activeTab === "client" && clientTotalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-600">
              Showing page {clientCurrentPage} of {clientTotalPages} (
              {clientTotalCount} total codes)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClientPrevPage}
                disabled={clientCurrentPage === 1}
                className="btn btn-sm btn-outline"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium">
                Page {clientCurrentPage} of {clientTotalPages}
              </span>
              <button
                onClick={handleClientNextPage}
                disabled={
                  !clientHasMore || clientCurrentPage === clientTotalPages
                }
                className="btn btn-sm btn-outline"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "staff" && staffTotalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-600">
              Showing page {staffCurrentPage} of {staffTotalPages} (
              {staffTotalCount} total codes)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStaffPrevPage}
                disabled={staffCurrentPage === 1}
                className="btn btn-sm btn-outline"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium">
                Page {staffCurrentPage} of {staffTotalPages}
              </span>
              <button
                onClick={handleStaffNextPage}
                disabled={!staffHasMore || staffCurrentPage === staffTotalPages}
                className="btn btn-sm btn-outline"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h5 className="text-xl font-bold text-gray-800 mb-4">
              {activeTab === "client"
                ? "Generate Client Access Code"
                : "Generate Staff Invite Code"}
            </h5>
            <form
              onSubmit={
                activeTab === "client"
                  ? handleCreateClientOTP
                  : handleCreateStaffInvite
              }
              className="space-y-4"
            >
              {activeTab === "client" && (
                <div className="form-control">
                    <label className="label">
                    <span className="label-text font-semibold">
                      Select Scheme
                    </span>
                  </label>
                  <select
                    value={formData.schemeId}
                    onChange={(e) => {
                      const selectedScheme = SCHEMES.find(
                        (s) => s.id === e.target.value,
                      );
                      setFormData({
                        ...formData,
                        schemeId: selectedScheme ? selectedScheme.id : "",
                        schemeName: selectedScheme ? selectedScheme.fullName : "",
                      });
                    }}
                    className="select select-bordered select-md mt-2 w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                    required
                  >
                    <option value="">Please Select a Scheme</option>
                    {SCHEMES.map((scheme) => (
                      <option key={scheme.id} value={scheme.id}>
                        {scheme.fullName}
                      </option>
                    ))}
                   </select>           
                  <label className="label">
                    <span className="label-text-alt text-gray-500 text-[14px]">
                      {formData.schemeId &&
                        `Code will be generated for: ${formData.schemeId}`}
                    </span>
                  </label>
               </div>          
              )}
              {activeTab !== "client" && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">
                      Expires In (Days)
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formData.expiresInDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expiresInDays: parseInt(e.target.value),
                      })
                    }
                    className="input input-bordered mt-2 w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
                    required
                  />
                  <label className="label">
                    <span className="label-text-alt text-gray-500 text-[14px]">
                      Code will expire in {formData.expiresInDays} days. Each
                      code is single-use only.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({
                      schemeId: "",
                      schemeName: "",
                      expiresInDays: 30,
                      maxUses: 1,
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
                >
                  {loading ? "Generating..." : "Generate Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OTPManagement;
