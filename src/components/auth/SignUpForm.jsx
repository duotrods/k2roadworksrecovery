import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { authService } from "../../services/authService";
import { getAuthErrorMessage } from "../../utils/errorHandling";
import { USER_ROLES, ROLE_LABELS } from "../../utils/constants";

const SignUpForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: USER_ROLES.CLIENT,
    company: "",
    phone: "",
    otpCode: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password should be at least 6 characters");
      return;
    }

    // Trim text fields before submission
    const trimmed = {
      ...formData,
      displayName: formData.displayName.trim(),
      company: formData.company.trim(),
      otpCode: formData.otpCode.trim(),
      phone: formData.phone.trim(),
    };
    Object.assign(formData, trimmed);

    // Validate OTP code for both clients and staff
    if (!formData.otpCode.trim()) {
      const codeType = formData.role === USER_ROLES.CLIENT ? "Scheme Access Code" : "Invite Code";
      toast.error(`${codeType} is required for registration`);
      return;
    }

    setLoading(true);

    try {
      // eslint-disable-next-line no-unused-vars
      const { password, confirmPassword, otpCode, ...userData } = formData;

      // Use OTP-based registration for both clients and staff
      if (formData.role === USER_ROLES.CLIENT) {
        await authService.signUpClientWithOTP(
          formData.email,
          formData.password,
          userData,
          formData.otpCode
        );
      } else if (formData.role === USER_ROLES.STAFF) {
        await authService.signUpStaffWithOTP(
          formData.email,
          formData.password,
          userData,
          formData.otpCode
        );
      } else {
        await authService.signUpWithEmail(
          formData.email,
          formData.password,
          userData
        );
      }

      toast.success("Account created! Please verify your email.");
      navigate("/signin");
    } catch (error) {
      toast.error(getAuthErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const getCodeLabel = (role) => {
    switch (role) {
      case USER_ROLES.CLIENT: return 'Client Access Code';
      default: return 'Staff Invite Code';
    }
  };

  const getCodePlaceholder = (role) => {
    switch (role) {
      case USER_ROLES.CLIENT: return 'e.g., A417-2024-ABC123';
      default: return 'e.g., STAFF-2024-XYZ789';
    }
  };

  return (
    <div className="w-full max-w-md p-6 sm:p-8 bg-white rounded-xl shadow-lg">
      <h3 className="text-2xl font-bold text-gray-800">Create Account</h3>
      <p className="mb-6 mt-1 text-sm font-medium text-gray-500">
        Let's create your account for LENSE.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">Full Name</span>
          </label>
          <input
            type="text"
            name="displayName"
            value={formData.displayName}
            onChange={handleChange}
            className="input  w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
            maxLength={100}
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">Email</span>
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="input  w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">Password</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="input w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 pr-12"
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Confirm Password
            </span>
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">I am a:</span>
          </label>
          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="select w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
            required
          >
            <option value={USER_ROLES.CLIENT}>
              {ROLE_LABELS[USER_ROLES.CLIENT]}
            </option>
            <option value={USER_ROLES.STAFF}>
              {ROLE_LABELS[USER_ROLES.STAFF]}
            </option>
          </select>
        </div>

        {/* Access Code — label and placeholder differ per role */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">
              {getCodeLabel(formData.role)}
            </span>
          </label>
          <input
            type="text"
            name="otpCode"
            value={formData.otpCode}
            onChange={handleChange}
            placeholder={getCodePlaceholder(formData.role)}
            className="input w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
            required
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Enter the access code provided by your administrator
          </p>
        </div>

        {formData.role === USER_ROLES.CLIENT && (
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold mb-2">
                Company Name
              </span>
            </label>
            <input
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
              className="input  w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
              maxLength={100}
              required
            />
          </div>
        )}

        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">
              Phone Number (Optional)
            </span>
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="input  w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100"
            maxLength={20}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-3 border border-gray-300 rounded-lg font-semibold bg-brand-500 hover:bg-brand-600 text-white w-full"
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link
          to="/signin"
          className="text-brand-500 hover:text-brand-600 font-semibold"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
};

export default SignUpForm;
