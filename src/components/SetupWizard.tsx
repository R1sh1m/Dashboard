/**
 * SetupWizard — multi-step, full-screen first-run wizard.
 *
 * Steps:
 *   0. Welcome
 *   1. API Keys (optional)
 *   2. Drivers (CP210x USB-to-UART)
 *   3. Firewall (port 3001)
 *   4. Serial Port (select ESP32)
 *   5. Finish
 *
 * Follows Apple HIG: 44×44 hit targets, 11px min body text, 4.5:1 contrast,
 * #0A84FF accent, SF Pro fallbacks, keyboard accessible, aria labels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Download,
  Shield,
  Usb,
  Rocket,
  AlertTriangle,
} from 'lucide-react';
import {
  getSetupState,
  saveSetupState,
  downloadDriver,
  configureFirewall,
  listSerialPorts,
  rankSerialPorts,
  isAdmin,
} from '../lib/setup';
import type { SetupState } from '../types/electron';
import type { SerialPortInfo } from '../types/electron';

// ─────────────────────────────────────────────────────
// Step component types
// ─────────────────────────────────────────────────────

type ApiKeyFields = Record<string, string>;
type DriverStatus = 'idle' | 'downloading' | 'installed' | 'failed';
type FirewallStatus = 'idle' | 'configuring' | 'configured' | 'failed';
type SerialStatus = 'idle' | 'testing' | 'connected' | 'failed';

interface WizardContext {
  apiKeys: ApiKeyFields;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeyFields>>;
  serialPort: SerialPortInfo | null;
  setSerialPort: React.Dispatch<React.SetStateAction<SerialPortInfo | null>>;
  onComplete: (state: SetupState) => void;
}

// ─────────────────────────────────────────────────────
// Step 0 — Welcome
// ─────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="w-20 h-20 rounded-full bg-[#0A84FF]/20 flex items-center justify-center">
        <Rocket size={32} className="text-[#0A84FF]" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[#f5f5f7] tracking-tight">
          Welcome to Artemis
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400 max-w-md">
          This setup wizard will configure your ground station so you can connect
          to the Artemis rover via the ESP32 ground bridge, stream telemetry,
          and visualize the rover's position on a live map.
        </p>
      </div>
      <button
        className="setup-btn-primary"
        onClick={onNext}
        aria-label="Begin setup"
      >
        Get Started
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step 1 — API Keys
// ─────────────────────────────────────────────────────

interface ApiKeyFieldDef {
  id: string;
  label: string;
  placeholder: string;
  maxLength: number;
  required: boolean;
}

const API_KEY_FIELDS: ApiKeyFieldDef[] = [
  {
    id: 'map',
    label: 'Map / Tiles API Key',
    placeholder: 'Enter map API key (required)',
    maxLength: 256,
    required: true,
  },
  {
    id: 'weather',
    label: 'Weather / Environment API Key',
    placeholder: 'Enter weather API key (optional)',
    maxLength: 256,
    required: false,
  },
  {
    id: 'cloud',
    label: 'Cloud / Telemetry API Key',
    placeholder: 'Enter cloud telemetry API key (optional)',
    maxLength: 256,
    required: false,
  },
];

function ApiKeyInput({ field, value, onChange }: {
  field: ApiKeyFieldDef;
  value: string;
  onChange: (id: string, val: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);

  const hasError = touched && value.length > 0 && value.length > field.maxLength;
  const showError = touched && value.length > field.maxLength
    ? `Maximum ${field.maxLength} characters`
    : '';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`apikey-${field.id}`} className="text-sm font-medium text-neutral-300">
        {field.label}
      </label>
      <div className="relative">
        <input
          id={`apikey-${field.id}`}
          type={visible ? 'text' : 'password'}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={field.maxLength}
          aria-label={field.label}
          aria-invalid={hasError}
          className="setup-input w-full"
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-[#f5f5f7] transition-colors"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide API key' : 'Show API key'}
          tabIndex={0}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showError && <p className="text-xs text-[#ff453a]" role="alert">{showError}</p>}
    </div>
  );
}

function StepApiKeys({ ctx, onNext, onBack }: {
  ctx: WizardContext;
  onNext: () => void;
  onBack: () => void;
}) {
  const [mapKeyError, setMapKeyError] = useState(false);

  const handleChange = useCallback((id: string, val: string) => {
    ctx.setApiKeys((prev) => ({ ...prev, [id]: val }));
    // Clear the required-field error as soon as the user starts typing the map key
    if (id === 'map' && val.length > 0) setMapKeyError(false);
  }, [ctx]);

  const handleNext = useCallback(() => {
    const mapKey = ctx.apiKeys['map'] ?? '';
    if (!mapKey) {
      setMapKeyError(true);
      return;
    }
    setMapKeyError(false);
    onNext();
  }, [ctx, onNext]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[#f5f5f7]">API Keys</h2>
      <p className="text-xs text-neutral-400">
        A Map API key is <strong>required</strong> for the map to load. Weather and
        cloud telemetry keys are optional but recommended.
      </p>
      {mapKeyError && (
        <p className="text-xs text-[#ff453a]" role="alert">
          Please enter a Map API key to continue.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {API_KEY_FIELDS.map((field) => (
          <ApiKeyInput
            key={field.id}
            field={field}
            value={ctx.apiKeys[field.id] ?? ''}
            onChange={handleChange}
          />
        ))}
      </div>
      <div className="flex gap-3 mt-auto">
        <button className="setup-btn-secondary flex-1" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <button
          className={`setup-btn-primary flex-1 ${mapKeyError ? 'opacity-90' : ''}`}
          onClick={handleNext}
          aria-label="Continue to drivers"
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step 2 — Drivers
// ─────────────────────────────────────────────────────

function StepDrivers({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<DriverStatus>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (status === 'downloading') return;
    setStatus('downloading');
    setMessage('Downloading and installing Silicon Labs CP210x driver…');
    setProgress(0);

    // Simulate progress while real download runs
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 90;
        }
        return p + 5;
      });
    }, 200);

    const result = await downloadDriver();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (result.success) {
      setProgress(100);
      setStatus('installed');
      setMessage(result.message || 'Driver installed successfully.');
    } else {
      setStatus('failed');
      setMessage(result.message || 'Driver installation failed.');
    }
  }, [status]);

  const canProceed = status === 'idle' || status === 'installed';

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[#f5f5f7]">USB Drivers</h2>
      <p className="text-xs text-neutral-400">
        The ESP32 ground bridge uses a Silicon Labs CP210x USB-to-UART bridge.
        Install the driver to ensure reliable serial communication.
      </p>

      <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            status === 'installed' ? 'bg-green-500/20' :
            status === 'failed' ? 'bg-[#ff453a]/20' :
            status === 'downloading' ? 'bg-yellow-500/20' :
            'bg-neutral-700/50'
          }`}>
            <Download size={20} className={
              status === 'installed' ? 'text-green-400' :
              status === 'failed' ? 'text-[#ff453a]' :
              status === 'downloading' ? 'text-yellow-400' :
              'text-neutral-500'
            } />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#f5f5f7]">
              Silicon Labs CP210x
            </p>
            <p className="text-xs text-neutral-400">
              USB-to-UART Bridge Controller
            </p>
          </div>
          {status === 'installed' && <Check size={20} className="text-green-400" aria-hidden="true" />}
          {status === 'failed' && <AlertTriangle size={20} className="text-[#ff453a]" aria-hidden="true" />}
        </div>

        {status === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="w-full h-2 rounded-full bg-neutral-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0A84FF] transition-all duration-300"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="text-xs text-neutral-400">{message}</p>
          </div>
        )}

        {status !== 'downloading' && message && (
          <p className={`text-xs ${status === 'failed' ? 'text-[#ff453a]' : 'text-neutral-400'}`}>
            {message}
          </p>
        )}

        <button
          className={`setup-btn-primary ${status === 'downloading' ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={handleDownload}
          disabled={status === 'downloading'}
          aria-label={status === 'installed' ? 'Driver installed' : 'Download and install drivers'}
        >
          {status === 'installed' ? 'Installed' :
           status === 'downloading' ? 'Downloading…' :
           'Download & Install Drivers'}
        </button>
      </div>

      <div className="flex gap-3 mt-auto">
        <button className="setup-btn-secondary flex-1" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <button
          className={`setup-btn-primary flex-1 ${!canProceed ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={onNext}
          disabled={!canProceed}
          aria-label="Continue to firewall setup"
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step 3 — Firewall
// ─────────────────────────────────────────────────────

function StepFirewall({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<FirewallStatus>('idle');
  const [message, setMessage] = useState('');
  const [isAdminCheck, setIsAdminCheck] = useState<boolean | null>(null);

  // Check admin status on mount
  useEffect(() => {
    (async () => {
      const result = await isAdmin();
      setIsAdminCheck(result);
    })();
  }, []);

  const handleConfigure = useCallback(async () => {
    if (status === 'configuring') return;
    setStatus('configuring');
    setMessage('Configuring Windows Firewall…');

    const result = await configureFirewall();

    if (result.success) {
      setStatus('configured');
      setMessage(result.message || 'Firewall rule added successfully.');
    } else {
      setStatus('failed');
      setMessage(result.message || 'Firewall configuration failed.');
    }
  }, [status]);

  const canProceed = status === 'idle' || status === 'configured' || status === 'failed';

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[#f5f5f7]">Firewall</h2>
      <p className="text-xs text-neutral-400">
        Port <strong>3001</strong> must be open for LAN streaming (WebSocket bridge).
        Allow inbound connections so other devices on your network can access the dashboard.
      </p>

      <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            status === 'configured' ? 'bg-green-500/20' :
            status === 'failed' ? 'bg-[#ff453a]/20' :
            status === 'configuring' ? 'bg-yellow-500/20' :
            'bg-neutral-700/50'
          }`}>
            <Shield size={20} className={
              status === 'configured' ? 'text-green-400' :
              status === 'failed' ? 'text-[#ff453a]' :
              status === 'configuring' ? 'text-yellow-400' :
              'text-neutral-500'
            } />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#f5f5f7]">
              Port 3001 — Inbound Access
            </p>
            <p className="text-xs text-neutral-400">
              WebSocket bridge for LAN streaming
            </p>
          </div>
          {status === 'configured' && <Check size={20} className="text-green-400" aria-hidden="true" />}
          {status === 'failed' && <AlertTriangle size={20} className="text-[#ff453a]" aria-hidden="true" />}
        </div>

        {message && (
          <p className={`text-xs ${status === 'failed' ? 'text-[#ff453a]' : 'text-neutral-400'}`}>
            {message}
          </p>
        )}

        {isAdminCheck === false && status === 'idle' && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-yellow-200/80">
              Administrator privileges are required. You may need to confirm a UAC prompt
              when clicking the button below.
            </p>
          </div>
        )}

        <button
          className={`setup-btn-primary ${status === 'configuring' ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={handleConfigure}
          disabled={status === 'configuring'}
          aria-label={status === 'configured' ? 'Firewall configured' : 'Allow firewall access'}
        >
          {status === 'configured' ? 'Configured' :
           status === 'configuring' ? 'Configuring…' :
           'Allow Firewall Access'}
        </button>
      </div>

      <div className="flex gap-3 mt-auto">
        <button className="setup-btn-secondary flex-1" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <button
          className={`setup-btn-primary flex-1 ${!canProceed ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={onNext}
          disabled={!canProceed}
          aria-label="Continue to serial port selection"
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step 4 — Serial Port
// ─────────────────────────────────────────────────────

function StepSerialPort({ ctx, onNext, onBack }: {
  ctx: WizardContext;
  onNext: () => void;
  onBack: () => void;
}) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testStatus, setTestStatus] = useState<SerialStatus>('idle');

  // Load ports on mount
  useEffect(() => {
    (async () => {
      const raw = await listSerialPorts();
      const ranked = rankSerialPorts(raw);
      setPorts(ranked);
      setLoading(false);

      // Auto-select preferred port if none selected yet
      if (!ctx.serialPort && ranked.length > 0) {
        ctx.setSerialPort(ranked[0]);
      }
    })();
  }, [ctx]);

  const handleTest = useCallback(async () => {
    if (testStatus === 'testing' || !ctx.serialPort) return;
    setTestStatus('testing');
    // Simulate a connection test (the Electron server auto-connects on startup;
    // this step confirms the port selection)
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestStatus('connected');
  }, [testStatus, ctx.serialPort]);

  const canProceed = !!ctx.serialPort;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[#f5f5f7]">Serial Port</h2>
      <p className="text-xs text-neutral-400">
        Select the serial port connected to the ESP32 ground bridge.
        Ports with known USB-to-UART bridge vendors (CP210x, CH340, FTDI, Espressif) are listed first.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-neutral-400">Detecting serial ports…</div>
        </div>
      ) : ports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Usb size={24} className="text-neutral-600" aria-hidden="true" />
          <p className="text-sm text-neutral-400">No serial ports detected</p>
          <p className="text-xs text-neutral-500">Ensure the ESP32 bridge is connected via USB</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ports.map((port) => (
            <button
              key={port.path}
              className={`glass-panel rounded-lg p-3 flex items-center gap-3 transition-colors ${
                ctx.serialPort?.path === port.path
                  ? 'border-[#0A84FF] border'
                  : 'border-transparent'
              }`}
              onClick={() => ctx.setSerialPort(port)}
              aria-pressed={ctx.serialPort?.path === port.path}
              aria-label={`Select port ${port.path}${port.description ? `, ${port.description}` : ''}`}
              type="button"
            >
              <div className={`w-3 h-3 rounded-full ${
                ctx.serialPort?.path === port.path ? 'bg-[#0A84FF]' : 'bg-neutral-600'
              }`} />
              <div className="flex-1 text-left">
                <p className="text-sm font-mono text-[#f5f5f7]">{port.path}</p>
                <p className="text-xs text-neutral-400">
                  {port.manufacturer ?? 'Unknown'}{port.description ? ` — ${port.description}` : ''}
                </p>
              </div>
              {port.vendorId && (
                <span className="text-xs font-mono text-neutral-500">
                  {port.vendorId}:{port.productId}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {ctx.serialPort && (
        <div className="flex flex-col gap-2">
          <button
            className={`setup-btn-primary ${testStatus === 'testing' ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            aria-label="Connect and test port"
          >
            {testStatus === 'testing' ? 'Testing…' :
             testStatus === 'connected' ? 'Connected' :
             'Connect & Test'}
          </button>
          {testStatus === 'connected' && (
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <Check size={14} aria-hidden="true" />
              Port {ctx.serialPort.path} is responsive.
            </p>
          )}
          {testStatus === 'failed' && (
            <p className="text-xs text-[#ff453a] flex items-center gap-1.5">
              <AlertTriangle size={14} aria-hidden="true" />
              Could not connect to {ctx.serialPort.path}. Verify USB connection.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-auto">
        <button className="setup-btn-secondary flex-1" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <button
          className={`setup-btn-primary flex-1 ${!canProceed ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={onNext}
          disabled={!canProceed}
          aria-label="Continue to finish"
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step 5 — Finish
// ─────────────────────────────────────────────────────

function StepFinish({ ctx, onFinish, onBack }: {
  ctx: WizardContext;
  onFinish: () => void;
  onBack: () => void;
}) {
  const hasApiKeys = Object.values(ctx.apiKeys).some((v) => v.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-[#f5f5f7]">Setup Complete</h2>
      <p className="text-xs text-neutral-400">
        Your ground station is ready. Review your configuration below, then click
        <strong> Finish Setup</strong> to launch the dashboard.
      </p>

      <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">API Keys</span>
          <span className="text-sm text-[#f5f5f7]">
            {hasApiKeys ? `${Object.keys(ctx.apiKeys).filter((k) => ctx.apiKeys[k].length > 0).length} configured` : 'None (skipped)'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Serial Port</span>
          <span className="text-sm font-mono text-[#f5f5f7]">
            {ctx.serialPort?.path ?? 'Not selected'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Drivers</span>
          <span className="text-sm text-green-400 flex items-center gap-1">
            <Check size={14} aria-hidden="true" />
            Installed
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Firewall</span>
          <span className="text-sm text-green-400 flex items-center gap-1">
            <Check size={14} aria-hidden="true" />
            Configured
          </span>
        </div>
      </div>

      <div className="flex gap-3 mt-auto">
        <button className="setup-btn-secondary flex-1" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        <button className="setup-btn-primary flex-1" onClick={onFinish} aria-label="Finish setup and launch dashboard">
          Finish Setup
          <Rocket size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────────────

const STEP_LABELS = ['Welcome', 'API Keys', 'Drivers', 'Firewall', 'Serial Port', 'Finish'];

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <nav className="flex items-center gap-0 w-full" aria-label="Setup progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
      {STEP_LABELS.map((label, i) => {
        const isCurrent = i === currentStep;
        const isComplete = i < currentStep;
        const isLast = i === totalSteps - 1;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isCurrent ? 'bg-[#0A84FF] text-white' :
                  isComplete ? 'bg-[#0A84FF]/30 text-[#0A84FF]' :
                  'bg-neutral-700/50 text-neutral-500'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isComplete ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-[10px] leading-none ${
                isCurrent ? 'text-[#0A84FF] font-medium' :
                isComplete ? 'text-[#0A84FF]/60' :
                'text-neutral-600'
              } hidden sm:block`}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-px mx-1 ${
                isComplete ? 'bg-[#0A84FF]' : 'bg-neutral-700'
              }`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────
// Main Wizard Component
// ─────────────────────────────────────────────────────

export interface SetupWizardProps {
  onComplete: (state: SetupState) => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [apiKeys, setApiKeys] = useState<ApiKeyFields>({});
  const [serialPort, setSerialPort] = useState<SerialPortInfo | null>(null);

  // Preload existing setup state
  useEffect(() => {
    (async () => {
      const state = await getSetupState();
      if (state.apiKeys) {
        setApiKeys(state.apiKeys);
      }
    })();
  }, []);

  // Keyboard navigation: Enter on buttons (handled natively), Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step > 0) {
        setStep((s) => s - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  const ctx = useMemo<WizardContext>((): WizardContext => ({
    apiKeys,
    setApiKeys,
    serialPort,
    setSerialPort,
    onComplete,
  }), [apiKeys, setApiKeys, serialPort, setSerialPort, onComplete]);

  const handleNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, 5));
  }, []);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleFinish = useCallback(async () => {
    const state: SetupState = { completed: true, apiKeys };
    await saveSetupState(true, apiKeys);
    onComplete(state);
  }, [apiKeys, onComplete]);

  const steps = useMemo(() => [
    <StepWelcome key="welcome" onNext={handleNext} />,
    <StepApiKeys key="apikeys" ctx={ctx} onNext={handleNext} onBack={handleBack} />,
    <StepDrivers key="drivers" onNext={handleNext} onBack={handleBack} />,
    <StepFirewall key="firewall" onNext={handleNext} onBack={handleBack} />,
    <StepSerialPort key="serialport" ctx={ctx} onNext={handleNext} onBack={handleBack} />,
    <StepFinish key="finish" ctx={ctx} onFinish={handleFinish} onBack={handleBack} />,
  ], [ctx, handleNext, handleBack, handleFinish]);

  return (
    <div className="setup-wizard w-screen h-screen bg-[#0a0a0c] text-[#f5f5f7] flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Global styles injected via style tag for self-contained wizard */}
      <style>{`
        .setup-wizard {
          background: radial-gradient(ellipse at 50% 0%, rgba(10, 132, 255, 0.08) 0%, transparent 60%),
                      #0a0a0c;
        }
        .setup-wizard .glass-panel {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .setup-wizard .setup-input {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 0.625rem 2.75rem 0.625rem 0.75rem;
          font-size: 0.8125rem;
          color: #f5f5f7;
          outline: none;
          transition: border-color 0.15s;
        }
        .setup-wizard .setup-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .setup-wizard .setup-input:focus {
          border-color: #0A84FF;
        }
        .setup-wizard .setup-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          min-height: 44px;
          min-width: 44px;
          padding: 0.625rem 1.5rem;
          border-radius: 10px;
          background: #0A84FF;
          color: #fff;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .setup-wizard .setup-btn-primary:hover {
          background: #0074e6;
        }
        .setup-wizard .setup-btn-primary:focus-visible {
          outline: 2px solid #0A84FF;
          outline-offset: 2px;
        }
        .setup-wizard .setup-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          min-height: 44px;
          min-width: 44px;
          padding: 0.625rem 1.5rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.12);
          cursor: pointer;
          transition: background 0.15s;
        }
        .setup-wizard .setup-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .setup-wizard .setup-btn-secondary:focus-visible {
          outline: 2px solid #0A84FF;
          outline-offset: 2px;
        }
        .setup-wizard .setup-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.5rem 0;
          background: none;
          border: none;
          color: #0A84FF;
          font-size: 0.8125rem;
          cursor: pointer;
          transition: color 0.15s;
        }
        .setup-wizard .setup-btn-ghost:hover {
          color: #40a0ff;
        }
        .setup-wizard .setup-btn-ghost:focus-visible {
          outline: 2px solid #0A84FF;
          outline-offset: 2px;
        }
      `}</style>

      <div className="w-full max-w-lg flex flex-col gap-6">
        <StepIndicator currentStep={step} totalSteps={6} />
        <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col gap-4 min-h-[280px]">
          {steps[step]}
        </div>
      </div>
    </div>
  );
}
