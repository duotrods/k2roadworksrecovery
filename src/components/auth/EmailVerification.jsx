import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { authService } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../config/supabase';

const EmailVerification = () => {
  const [loading, setLoading] = useState(false);
  const [checkingVerified, setCheckingVerified] = useState(false);
  const { currentUser } = useAuth();

  const handleResend = async () => {
    setLoading(true);
    try {
      await authService.resendVerificationEmail();
      toast.success('Verification email sent!');
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error('Failed to send email. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    setCheckingVerified(true);
    try {
      // Force a fresh session from the server so email_confirmed_at is up to date
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      if (data.user?.email_confirmed_at) {
        // Reload the page — AuthContext will re-init with the fresh session
        window.location.reload();
      } else {
        toast.error('Email not verified yet. Please check your inbox and click the link.');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setCheckingVerified(false);
    }
  };

  const handleSignOut = async () => {
    await authService.signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="mb-2">Verify Your Email</h2>
          <p className="text-gray-600">
            We've sent a verification email to <strong>{currentUser?.email}</strong>.
            Please check your inbox and click the verification link.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleCheckVerified}
            disabled={checkingVerified}
            className="btn bg-brand-500 hover:bg-brand-600 text-white w-full"
          >
            {checkingVerified ? 'Checking...' : "I've Verified My Email"}
          </button>

          <button
            onClick={handleResend}
            disabled={loading}
            className="btn btn-outline w-full"
          >
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>

          <button onClick={handleSignOut} className="btn btn-ghost w-full">
            Sign Out
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Check your spam folder if you don't see the email.
        </p>
      </div>
    </div>
  );
};

export default EmailVerification;
