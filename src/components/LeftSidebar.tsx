import React from 'react';
import { Settings } from 'lucide-react';

type SerialStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

interface LeftSidebarProps {
  botState: string;
  isEStop: boolean;
  serialStatus: SerialStatus;
  onOpenSensors: () => void;
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
  onOpenSensors,
}) => {
  const robotStyle = ROBOT_PILL[botState] ?? ROBOT_PILL.STANDBY;
  const effectiveDot = isEStop
    ? 'bg-[#ff453a] animate-ping'
    : robotStyle.animate
      ? robotStyle.animate
      : 'bg-[#ffd60a]';
  const effectiveText = isEStop ? 'E-STOP' : robotStyle.text;

  const linkStyle = LINK_PILL[serialStatus];

  return (
    <aside className="sidebar">
      <div
        style={{
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <img
          src="/assets/artemis-logo.png"
          alt="Artemis"
          style={{
            height: 28,
            width: 'auto',
            display: 'block',
          }}
        />
        <span
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
            fontSize: '15px',
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: '-0.02em',
          }}
        >
          Artemis Dashboard
        </span>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '10px',
            color: '#8e8e93',
          }}
        >
          GROUND STATION
        </span>
      </div>

      <div className="sidebar-body">
        <div className="sidebar-row">
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#a3a3a3',
            }}
          >
            ROBOT
          </span>
          <span
            className={`pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium`}
            style={{
              backgroundColor: robotStyle.bg,
              borderColor: robotStyle.border,
              color: robotStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${effectiveDot}`} />
            {effectiveText}
          </span>
        </div>

        <div className="sidebar-row">
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#a3a3a3',
            }}
          >
            LINK
          </span>
          <span
            className={`pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium`}
            style={{
              backgroundColor: linkStyle.bg,
              borderColor: linkStyle.border,
              color: linkStyle.text,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${linkStyle.animate || ''}`} />
            {linkStyle.text}
          </span>
        </div>

        <div className="h-12 flex items-end">
          <button
            onClick={onOpenSensors}
            className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-medium text-neutral-300 flex items-center justify-center gap-2 hover:bg-white/10 hover:text-white transition-colors active:scale-97"
          >
            <Settings className="w-4 h-4" />
            Sensors
          </button>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc]/40" />
          v1.0.0
        </div>
      </div>
    </aside>
  );
};
