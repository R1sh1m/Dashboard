/**
 * ConnectionToast — small, non-intrusive popup that tells the operator where
 * the dashboard can be reached.
 *
 * Polls /api/status for the server's LAN IP and port, then shows:
 *   • Local URL:  http://localhost:<port>
 *   • LAN URL:    http://<lanIp>:<port>
 *
 * The toast reappears (and updates) whenever the underlying IP or port changes,
 * so it stays accurate as the laptop's network configuration changes.
 *
 * Follows Apple HIG: 44×44 dismiss target, 11px min text, #0A84FF accent,
 * aria labels, keyboard accessible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const POLL_INTERVAL_MS = 5000;

interface StatusPayload {
  lanIp?: string;
  serverPort?: number;
  bridgeStatus?: string;
}

export function ConnectionToast() {
  const [visible, setVisible] = useState(false);
  const [localUrl, setLocalUrl] = useState('');
  const [lanUrl, setLanUrl] = useState('');
  const [ip, setIp] = useState<string | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as StatusPayload;

      const newIp = data.lanIp ?? null;
      const newPort = data.serverPort ?? null;

      // Build URLs whenever we have a port (localhost is always valid).
      if (newPort) {
        setLocalUrl(`http://localhost:${newPort}`);
      }
      if (newIp && newPort) {
        setLanUrl(`http://${newIp}:${newPort}`);
      }

      // Show the toast on first successful fetch, and re-show whenever the IP
      // or port changes so it stays accurate as the network changes.
      const ipChanged = newIp !== null && newIp !== ip;
      const portChanged = newPort !== null && newPort !== port;
      if ((ipChanged || portChanged) && !visible) {
        setVisible(true);
      }
      if (newIp !== null) setIp(newIp);
      if (newPort !== null) setPort(newPort);
    } catch {
      // Silently ignore — the server may not be up yet.
    }
  }, [ip, port, visible]);

  // Poll for status updates so the displayed IP stays current.
  // The initial fetch is deferred (setTimeout 0) so the resulting setState
  // calls are not synchronous within the effect.
  useEffect(() => {
    const initial = window.setTimeout(fetchStatus, 0);
    const timer = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [fetchStatus]);

  // Auto-dismiss after a short while on first show, but leave it dismissible
  // manually too. Re-show logic lives in fetchStatus.
  useEffect(() => {
    if (!visible) return;
    dismissRef.current = window.setTimeout(() => {
      setVisible(false);
    }, 8000);
    return () => {
      if (dismissRef.current) window.clearTimeout(dismissRef.current);
    };
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-[260px] max-w-xs border border-[#0A84FF]/30 shadow-lg"
      role="status"
      aria-live="polite"
      aria-label="Dashboard connection information"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
        <div className="w-8 h-8 rounded-full bg-[#0A84FF]/20 flex items-center justify-center shrink-0">
          <span className="text-[#0A84FF] font-bold text-xs">A</span>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-col sm:gap-0.5">
          <p className="text-xs font-medium text-[#f5f5f7] leading-tight">
            Dashboard available at
          </p>
          {localUrl && (
            <p className="text-xs font-mono text-[#0A84FF] break-all leading-tight">
              {localUrl}
            </p>
          )}
          {lanUrl && (
            <p className="text-xs font-mono text-neutral-300 break-all leading-tight">
              LAN: {lanUrl}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss connection info"
        className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-500 hover:text-[#f5f5f7] hover:bg-neutral-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
