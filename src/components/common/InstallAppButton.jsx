import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

// Floating "Install app" button.
// - Chrome/Edge/Android: uses the captured `beforeinstallprompt` event (see
//   main.jsx) to trigger the native install flow.
// - iOS Safari: has no install API, so we show the manual "Add to Home Screen"
//   steps instead.
// - Hides itself if the app is already installed (running standalone), after a
//   successful install, or once dismissed for the session.
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

const InstallAppButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(
    () => window.deferredInstallPrompt || null
  );
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("installDismissed") === "1"
  );
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onReady = () => setDeferredPrompt(window.deferredInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      window.deferredInstallPrompt = null;
    };
    // Covers the case where the event fires after this component mounts.
    window.addEventListener("installpromptready", onReady);
    window.addEventListener("beforeinstallprompt", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("installpromptready", onReady);
      window.removeEventListener("beforeinstallprompt", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
      }
      setDeferredPrompt(null);
      window.deferredInstallPrompt = null;
    } else if (isIOS()) {
      setShowIosHelp((v) => !v);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("installDismissed", "1");
  };

  // Nothing to show: already installed, dismissed, or not installable and not iOS.
  const canPrompt = !!deferredPrompt;
  const iosEligible = isIOS() && !installed;
  if (installed || dismissed || (!canPrompt && !iosEligible)) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {showIosHelp && (
        <div className="max-w-xs rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-lg">
          <p className="font-semibold text-gray-900">Install on iPhone</p>
          <p className="mt-1 flex items-center gap-1">
            Tap <Share className="inline h-4 w-4 text-brand-500" /> Share, then
            <span className="font-medium"> “Add to Home Screen.”</span>
          </p>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full bg-brand-500 text-white shadow-lg">
        <button
          onClick={handleInstall}
          className="flex items-center gap-2 rounded-full py-2.5 pl-4 pr-3 text-sm font-semibold transition-colors hover:bg-brand-600"
        >
          <Download className="h-4 w-4" />
          Install app
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-2 pr-3 text-white/80 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallAppButton;
