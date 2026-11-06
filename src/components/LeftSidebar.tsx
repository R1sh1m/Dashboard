import React from 'react';
import {
  Bookmark,
  CloudSun,
  Home,
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
  activeNav: 'home' | 'saved' | 'telemetry';
  setActiveNav: (tab: 'home' | 'saved' | 'telemetry') => void;
  onOpenSensors: () => void;
  onOpenPanel?: (tab: SubsystemTab) => void;
  onHome: () => void;
  onSavePoi: () => void;
}

// Apple-style pill colors for ROBOT state
const ROBOT_PILL: Record<string, { bg: string; border: string; text: string; animate?: string }> = {
  STANDBY: { bg: 'rgba(255, 214, 10, 0.16)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a' },
  WALKING: { bg: 'rgba(34, 197, 94, 0.16)', border: 'rgba(34, 197, 94, 0.3)', text: '#30d158', animate: 'animate-pulse' },
  EMERGENCY_STOP: { bg: 'rgba(255, 69, 58, 0.16)', border: 'rgba(255, 69, 58, 0.3)', text: '#ff453a', animate: 'animate-ping' },
  HOMING: { bg: 'rgba(41, 151, 255, 0.16)', border: 'rgba(41, 151, 255, 0.3)', text: '#2997ff' },
  EXPLORING: { bg: 'rgba(41, 151, 255, 0.16)', border: 'rgba(41, 151, 255, 0.3)', text: '#2997ff' },
  CALIBRATING: { bg: 'rgba(255, 214, 10, 0.16)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a' },
};

// Apple-style pill colors for LINK state
const LINK_PILL: Record<SerialStatus, { bg: string; border: string; text: string; animate?: string }> = {
  DISCONNECTED: { bg: 'rgba(161, 161, 170, 0.16)', border: 'rgba(161, 161, 170, 0.3)', text: '#a1a1aa' },
  CONNECTING: { bg: 'rgba(255, 214, 10, 0.16)', border: 'rgba(255, 214, 10, 0.3)', text: '#ffd60a', animate: 'animate-pulse' },
  CONNECTED: { bg: 'rgba(48, 209, 88, 0.16)', border: 'rgba(48, 209, 88, 0.3)', text: '#30d158', animate: 'animate-pulse' },
  ERROR: { bg: 'rgba(255, 69, 58, 0.16)', border: 'rgba(255, 69, 58, 0.3)', text: '#ff453a' },
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  botState,
  isEStop,
  serialStatus,
  activeNav,
  setActiveNav,
  onOpenSensors,
  onOpenPanel = onOpenSensors,
  onHome,
  onSavePoi,
}) => {
  const robotStyle = ROBOT_PILL[botState] ?? ROBOT_PILL.STANDBY;
  const effectiveDot = isEStop
    ? 'bg-[#ff453a] animate-ping'
    : robotStyle.animate
      ? robotStyle.animate
      : 'bg-[#ffd60a]';
  const effectiveText = isEStop ? 'E-STOP' : botState;

  const linkStyle = LINK_PILL[serialStatus];

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
            ['logs', 'Telemetry logs', TerminalSquare],
          ] as [SubsystemTab, string, React.ComponentType<{ size?: number }>][]).map(([tab, label, Icon]) => (
            <button
              key={tab}
              className="sidebar-nav-item sidebar-nav-subitem"
              onClick={() => { setActiveNav('telemetry'); onOpenPanel(tab); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="flex flex-col items-end gap-2 mb-3">
          <span
            className={`pill inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium relative`}
            style={{
              backgroundColor: robotStyle.bg,
              borderColor: robotStyle.border,
              color: robotStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${effectiveDot} absolute left-3`} />
            {effectiveText}
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
