import React from 'react';
import {
  Bookmark,
  CloudSun,
  Home,
  AlertOctagon,
  Radio,
  Radar,
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
}

// Apple-style pill colors for ROBOT state
const ROBOT_PILL: Record<string, { bg: string; border: string; text: string; animate?: string }> = {
  STANDBY: { bg: 'rgba(255, 214, 10, 0.16)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a' },
  WALKING: { bg: 'rgba(34, 197, 94, 0.81)', border: 'rgba(34, 197, 94, 0.3)', text: '#30d158', animate: 'animate-pulse' },
  EMERGENCY_STOP: { bg: 'rgba(255, 69, 58, 0.16)', border: 'rgba(255, 69, 58, 0.3)', text: '#ff453a', animate: 'animate-ping' },
  HOMING: { bg: 'rgba(41, 151, 255, 0.81)', border: 'rgba(41, 151, 255, 0.3)', text: '#2997ff' },
  EXPLORING: { bg: 'rgba(41, 151, 255, 0.81)', border: 'rgba(41, 151, 255, 0.3)', text: '#2997ff' },
  CALIBRATING: { bg: 'rgba(255, 214, 10, 0.81)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a' },
};

// Apple-style pill colors for LINK state
const LINK_PILL: Record<SerialStatus, { bg: string; border: string; text: string; animate?: string }> = {
  DISCONNECTED: { bg: 'rgba(161, 161, 170, 0.16)', border: 'rgba(161, 161, 170, 0.3)', text: '#a1a1aa' },
  CONNECTING: { bg: 'rgba(255, 214, 10, 0.81)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a', animate: 'animate-pulse' },
  CONNECTED: { bg: 'rgba(48, 209, 88, 0.81)', border: 'rgba(48, 209, 88, 0.3)', text: '#30d158', animate: 'animate-pulse' },
  ERROR: { bg: 'rgba(255, 69, 58, 0.81)', border: 'rgba(255, 69, 58, 0.3)', text: '#ff453a' },
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
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative gap-2`}
            onClick={() => { setActiveNav('estop'); onTriggerEStop(); }}
            aria-label="Emergency stop"
            style={{
              backgroundColor: estopStyle.bg,
              borderColor: estopStyle.border,
              color: estopStyle.text,
            }}
          >
            <AlertOctagon size={16} />
            <span>E-STOP</span>
          </button>
          <span
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative`}
            style={{
              backgroundColor: robotStyle.bg,
              borderColor: robotStyle.border,
              color: robotStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${effectiveDot} absolute left-3`} />
            {botState}
          </span>
          <span
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative`}
            style={{
              backgroundColor: linkStyle.bg,
              borderColor: linkStyle.border,
              color: linkStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${linkStyle.animate || ''} absolute left-3`} />
            {serialStatus}
          </span>
        </div>
      </div>
    </aside>
  );
};
