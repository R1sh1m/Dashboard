import React from 'react';
import {
  Bookmark,
  CloudSun,
  Home,
  AlertOctagon,
  Radio,
  Radar,
  Satellite,
  Settings,
  TerminalSquare,
} from 'lucide-react';
import type { SubsystemTab } from './SensorSheet';

type SerialStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

interface LeftSidebarProps {
  botState: string;
  isEStop: boolean;
  serialStatus: SerialStatus;
  loraRssi?: number;
  activeNav: 'home' | 'saved' | 'telemetry' | 'estop';
  setActiveNav: (tab: 'home' | 'saved' | 'telemetry' | 'estop') => void;
  onOpenSensors: () => void;
  onOpenPanel?: (tab: SubsystemTab) => void;
  onHome: () => void;
  onSavePoi: () => void;
  onTriggerEStop?: () => void;
  onConnectSerial?: () => void;
  onDisconnectSerial?: () => void;
}

// Status pill colors for ROBOT state
const ROBOT_PILL: Record<string, { bg: string; border: string; text: string; animate?: string }> = {
  STANDBY: { bg: 'rgba(255, 214, 10, 0.16)', border: '1px solid rgba(255, 214, 10, 0.35)', text: '#ffd60a' },
  WALKING: { bg: 'rgba(48, 209, 88, 0.16)', border: '1px solid rgba(48, 209, 88, 0.4)', text: '#30d158', animate: 'animate-pulse' },
  EMERGENCY_STOP: { bg: 'rgba(255, 69, 58, 0.18)', border: '1px solid rgba(255, 69, 58, 0.45)', text: '#ff6961', animate: 'animate-ping' },
  HOMING: { bg: 'rgba(41, 151, 255, 0.16)', border: '1px solid rgba(41, 151, 255, 0.4)', text: '#2997ff' },
  EXPLORING: { bg: 'rgba(41, 151, 255, 0.16)', border: '1px solid rgba(41, 151, 255, 0.4)', text: '#2997ff' },
  CALIBRATING: { bg: 'rgba(255, 214, 10, 0.16)', border: '1px solid rgba(255, 214, 10, 0.4)', text: '#ffd60a' },
};

// Status pill colors for LINK state (translucent glassmorphism with high contrast text)
const LINK_PILL: Record<SerialStatus, { bg: string; border: string; text: string; dot: string; animate?: string }> = {
  DISCONNECTED: { bg: 'rgba(161, 161, 170, 0.16)', border: '1px solid rgba(161, 161, 170, 0.35)', text: '#f4f4f5', dot: 'bg-zinc-400' },
  CONNECTING: { bg: 'rgba(255, 214, 10, 0.18)', border: '1px solid rgba(255, 214, 10, 0.5)', text: '#ffd60a', dot: 'bg-yellow-400', animate: 'animate-pulse' },
  CONNECTED: { bg: 'rgba(48, 209, 88, 0.18)', border: '1px solid rgba(48, 209, 88, 0.5)', text: '#30d158', dot: 'bg-emerald-400', animate: 'animate-pulse' },
  ERROR: { bg: 'rgba(255, 69, 58, 0.22)', border: '1px solid rgba(255, 69, 58, 0.65)', text: '#ffffff', dot: 'bg-red-500', animate: 'animate-pulse' },
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  botState,
  isEStop,
  serialStatus,
  loraRssi = -95,
  activeNav,
  setActiveNav,
  onOpenSensors,
  onOpenPanel = onOpenSensors,
  onHome,
  onSavePoi,
  onTriggerEStop = () => {},
  onConnectSerial,
  onDisconnectSerial,
}) => {
  const robotStyle = ROBOT_PILL[botState] ?? ROBOT_PILL.STANDBY;
  const estopStyle = ROBOT_PILL.EMERGENCY_STOP;
  const effectiveDot = isEStop
    ? 'bg-[#ff453a] animate-ping'
    : robotStyle.animate
      ? robotStyle.animate
      : 'bg-[#ffd60a]';

  const linkStyle = LINK_PILL[serialStatus];
  const loraBars = loraRssi >= -75 ? 4 : loraRssi >= -85 ? 3 : loraRssi >= -95 ? 2 : 1;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="artemis-logo-frame">
          <img src="/assets/artemis-logo.png" alt="Artemis" />
        </span>
        <strong>Dashboard</strong>
      </div>

      <div className="sidebar-body">
        <div className="sidebar-navigation" aria-label="Ground station navigation">
          <button
            className={`sidebar-nav-item${activeNav === 'home' ? ' active' : ''}`}
            onClick={() => { setActiveNav('home'); onHome(); }}
            aria-current={activeNav === 'home' ? 'page' : undefined}
          >
            <Home size={18} />
            <span>Home</span>
          </button>
          <button
            className={`sidebar-nav-item${activeNav === 'saved' ? ' active' : ''}`}
            onClick={() => { setActiveNav('saved'); onSavePoi(); }}
            aria-current={activeNav === 'saved' ? 'page' : undefined}
          >
            <Bookmark size={18} />
            <span>Points of interest</span>
          </button>
          <button
            className={`sidebar-nav-item${activeNav === 'telemetry' ? ' active' : ''}`}
            onClick={() => { setActiveNav('telemetry'); onOpenSensors(); }}
            aria-current={activeNav === 'telemetry' ? 'page' : undefined}
          >
            <Settings size={18} />
            <span>Telemetry</span>
          </button>
          {([
            ['env', 'Environment sensors', CloudSun],
            ['link', 'LoRa wireless link', Radio],
            ['gps', 'GPS', Satellite],
            ['radar', 'Radar', Radar],
            ['logs', 'Logs', TerminalSquare],
          ] as [SubsystemTab, string, React.ComponentType<{ size?: number }>][]).map(([tab, label, Icon]) => (
            <button
              key={tab}
              className="sidebar-nav-item sidebar-nav-subitem"
              onClick={() => { setActiveNav('telemetry'); onOpenPanel(tab); }}
            >
              <Icon size={16} />
              <span>{label}</span>
              {tab === 'link' && (
                <span
                  className="sidebar-lora-strength"
                  aria-label={`LoRa signal strength ${loraBars} of 4`}
                  title={`LoRa signal strength: ${loraBars} of 4`}
                >
                  <span className="sidebar-lora-bars" aria-hidden="true">
                    {[1, 2, 3, 4].map((bar) => (
                      <span key={bar} className={bar <= loraBars ? 'is-active' : ''} />
                    ))}
                  </span>
                  <span>{loraBars}/4</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="flex flex-col items-end gap-2">
          <button
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative gap-2 backdrop-blur-md transition-all hover:brightness-110 active:scale-95`}
            onClick={() => { setActiveNav('estop'); onTriggerEStop(); }}
            aria-label="Emergency stop"
            style={{
              backgroundColor: estopStyle.bg,
              border: estopStyle.border,
              color: estopStyle.text,
            }}
          >
            <AlertOctagon size={16} />
            <span>E-STOP</span>
          </button>
          <span
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative backdrop-blur-md`}
            style={{
              backgroundColor: robotStyle.bg,
              border: robotStyle.border,
              color: robotStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${effectiveDot} absolute left-3`} />
            {botState}
          </span>
          <button
            type="button"
            className="pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative cursor-pointer backdrop-blur-md transition-all hover:brightness-125 active:scale-95 shadow-sm"
            onClick={serialStatus === 'CONNECTED' ? onDisconnectSerial : onConnectSerial}
            aria-label={serialStatus === 'CONNECTED' ? 'Disconnect serial link' : 'Connect serial link'}
            title={
              serialStatus === 'CONNECTED'
                ? 'ESP32 connected (click to disconnect)'
                : serialStatus === 'ERROR'
                  ? 'Connection error: click to retry connecting to COM3'
                  : 'Click to connect ESP32 on COM3'
            }
            style={{
              backgroundColor: linkStyle.bg,
              border: linkStyle.border,
              color: linkStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${linkStyle.dot} ${linkStyle.animate || ''} absolute left-3`} />
            {serialStatus === 'DISCONNECTED' ? 'CONNECT' : serialStatus === 'ERROR' ? 'ERROR · RETRY' : serialStatus}
          </button>
        </div>
      </div>
    </aside>
  );
};
