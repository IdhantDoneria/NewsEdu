'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker (production only), tracks connectivity, and
 * offers the browser's install prompt when it is available.
 */
export default function PwaRegister() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is optional */
      });
    }

    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    setInstallEvent(null);
  };

  return (
    <>
      {!online && (
        <div className="offline-bar" role="status">
          You&apos;re offline. Showing the last copy saved on this device.
        </div>
      )}
      {installEvent && !dismissed && (
        <div className="install-chip">
          <button type="button" onClick={install}>
            Install app
          </button>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss install prompt">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
