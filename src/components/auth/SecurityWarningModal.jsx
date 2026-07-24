import { useState } from "react";
import importantImg from "../../assets/important.svg";

const STORAGE_KEY = "hasSeenSecurityWarning";

// Shown once per login to every authenticated user EXCEPT admin. Mounted in
// ProtectedRoute at z-[60] so it sits above the
// other dashboard dialogs (NoticeBoard at z-50) and is the first
// thing the user must acknowledge. The session flag is cleared on logout
// (authService.signOut) so it reappears on the next login.
const SecurityWarningModal = ({ role }) => {
  const [open, setOpen] = useState(
    () => role !== "admin" && !sessionStorage.getItem(STORAGE_KEY)
  );

  if (role === "admin" || !open) return null;

  const acknowledge = () => {
    sessionStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
        {/* Hero illustration */}
        <img
          src={importantImg}
          alt=""
          aria-hidden="true"
          className="w-64 h-auto mx-auto mb-5"
        />

        {/* Heading — kept on one line; use a div so the global h2 type scale doesn't apply */}
        <div className="text-xl font-bold text-gray-900 text-center whitespace-nowrap mb-3">
          Important — Account Security
        </div>

        {/* Notice text */}
        <p className="text-sm text-gray-600 leading-relaxed text-center text-pretty mb-6">
          User accounts are issued to authorised individuals only.{" "}
          <span className="font-semibold text-gray-800">
            Sharing login credentials is prohibited.
          </span>{" "}
          Any unauthorised access, data disclosure or footage leak arising from
          shared credentials remains the responsibility of the account holder and
          their organisation.
        </p>

        {/* Acknowledge */}
        <button
          onClick={acknowledge}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors"
        >
          I Understand &amp; Continue
        </button>
      </div>
    </div>
  );
};

export default SecurityWarningModal;
