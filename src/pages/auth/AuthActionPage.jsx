import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import headerLogo from '../../assets/headerlogo.svg';

// Landing page for Supabase's password-recovery email link. Unlike
// Firebase's oobCode flow (verify code -> then reset), Supabase establishes
// an authenticated "recovery" session automatically once the browser lands
// back here (fires a PASSWORD_RECOVERY auth event) — the new password is set
// directly via supabase.auth.updateUser(), no separate code-verification step.
const AuthActionPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, resetPassword, success, error
  const [message, setMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('resetPassword');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus((current) => {
        if (current !== 'loading') return current;
        if (session) return 'resetPassword';
        return 'error';
      });
      if (!session) {
        setMessage('This link is invalid or has expired. Please request a new one.');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handlePasswordReset = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }

    setIsResetting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setStatus('success');
      setMessage('Your password has been reset successfully!');
    } catch (error) {
      console.error('Password reset error:', error);
      setStatus('error');
      setMessage('Failed to reset password. The link may have expired.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={headerLogo} alt="Lens by Chellan" className="h-12 mx-auto mb-4" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-800 text-center mb-6">
            Reset Password
          </h3>

          {/* Loading State */}
          {status === 'loading' && (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Processing your request...</p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <p className="text-gray-700 mb-6">{message}</p>
              <button
                onClick={() => navigate('/signin')}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <p className="text-gray-700 mb-6">{message}</p>
              <button
                onClick={() => navigate('/signin')}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Password Reset Form */}
          {status === 'resetPassword' && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <p className="text-gray-600 text-center mb-4">
                Enter a new password below.
              </p>

              {message && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {message}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={isResetting}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          Need help? Contact support.
        </p>
      </div>
    </div>
  );
};

export default AuthActionPage;
