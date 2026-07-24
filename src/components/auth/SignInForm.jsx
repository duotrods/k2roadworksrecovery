import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { authService } from "../../services/authService";
import { userService } from "../../services/userService";
import { firestoreService } from "../../services/firestoreService";
import { getAuthErrorMessage } from "../../utils/errorHandling";
import { DASHBOARD_ROUTES } from "../../utils/constants";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getLockoutState() {
  const attempts = parseInt(localStorage.getItem("signin_attempts") || "0", 10);
  const lockedUntil = parseInt(localStorage.getItem("signin_locked_until") || "0", 10);
  return { attempts, lockedUntil };
}

const SignInForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get("redirect");

  // Validate dashboard redirects to match the user's role
  const isValidRedirect = (redirect, userRole) => {
    if (!redirect?.startsWith("/")) return false;
    if (!redirect.includes("/dashboard")) return true; // Non-dashboard routes are always OK
    // For dashboard routes, check if they match the user's role's base path
    const basePath = DASHBOARD_ROUTES[userRole];
    return basePath && redirect.startsWith(basePath);
  };

  useEffect(() => {
    const { lockedUntil } = getLockoutState();
    if (lockedUntil > Date.now()) startCountdown(lockedUntil);
    return () => clearInterval(timerRef.current);
  }, []);

  function startCountdown(lockedUntil) {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setCountdown(0);
        localStorage.removeItem("signin_attempts");
        localStorage.removeItem("signin_locked_until");
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  const handleEmailSignIn = async (e) => {
    e.preventDefault();

    const { lockedUntil } = getLockoutState();
    if (lockedUntil > Date.now()) return;

    setLoading(true);

    try {
      const user = await authService.signInWithEmail(email, password);
      localStorage.removeItem("signin_attempts");
      localStorage.removeItem("signin_locked_until");
      const profile = await userService.getUserDocument(user.uid);
      // Fire-and-forget — don't block navigation for logging (still
      // Firestore-based; harmless no-op until login_logs is ported)
      firestoreService.logUserLogin(user.uid, profile?.displayName, user.email, profile?.role).catch(console.error);
      toast.success("Welcome back!");
      const dashboardRoute = DASHBOARD_ROUTES[profile?.role] || "/dashboard";
      // Use redirect only if it's valid for the user's role
      const validRedirect = redirectParam && isValidRedirect(redirectParam, profile?.role) ? redirectParam : dashboardRoute;
      navigate(validRedirect);
    } catch (error) {
      const newAttempts = (getLockoutState().attempts || 0) + 1;
      localStorage.setItem("signin_attempts", newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem("signin_locked_until", until);
        startCountdown(until);
        toast.error("Too many failed attempts. Locked for 15 minutes.");
      } else {
        toast.error(getAuthErrorMessage(error.code));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 sm:p-8 bg-white rounded-xl shadow-lg">
      <h3>Sign In</h3>
      <p className="mb-6 font-medium label label-text">Hello! Let's continue your work with LENSE.</p>

      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-semibold mb-2">Email</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input input-lg w-full bg-white border-gray-300 rounded-lg hover:bg-gray-100 mb-2"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input input-lg w-full border bg-white border-gray-300 rounded-lg hover:bg-gray-100 pr-12"
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

        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-xs text-brand-500 hover:text-brand-600"
          >
            Forgot Password?
          </Link>
        </div>

        {countdown > 0 && (
          <p className="text-center text-sm text-red-500">
            Too many attempts. Try again in{" "}
            <span className="font-semibold">
              {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
            </span>
          </p>
        )}

        <button
          type="submit"
          disabled={loading || countdown > 0}
          className="px-4 py-3 border font-semibold border-gray-300 rounded-lg bg-brand-500 hover:bg-brand-600 text-white w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        Don't have an account?{" "}
        <Link
          to="/signup"
          className="text-brand-500 hover:text-brand-600 font-semibold"
        >
          Sign Up
        </Link>
      </p>
    </div>
  );
};

export default SignInForm;
