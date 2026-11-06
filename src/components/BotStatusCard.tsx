import React from 'react';
import type { BotStatus } from '../types/telemetry';
import { Clock, Cpu, RefreshCw } from 'lucide-react';

interface BotStatusCardProps {
  status: BotStatus | null;
}

export const BotStatusCard: React.FC<BotStatusCardProps> = ({ status }) => {
  const state = status?.state ?? 'STANDBY';
  const mode = status?.mode ?? 'AUTONOMOUS';
  const loopHz = status?.loop_hz ?? 0;
  const uptime = status?.uptime_sec ?? 0;

  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const timeFormatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-[#2997ff]" />
          BOT CONTROLLER
        </span>
        <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
          ESP32
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">STATE</span>
          <span className={`text-xl font-bold tracking-wide mt-0.5 ${
            state === 'EMERGENCY_STOP' ? 'text-[#ff453a]' : state === 'WALKING' ? 'text-[#30d158]' : 'text-[#ffd60a]'
          }`}>
            {state}
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">CONTROL MODE</span>
          <span className="text-xl font-semibold text-neutral-200 mt-0.5">
            {mode}
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300 flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5" />
            CONTROL LOOP
          </span>
          <span className="text-xl font-mono font-semibold text-neutral-200 mt-0.5">
            {loopHz.toFixed(1)} <span className="text-sm font-normal text-neutral-300">Hz</span>
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            UPTIME
          </span>
          <span className="text-xl font-mono font-semibold text-neutral-200 mt-0.5">
            {timeFormatted}
          </span>
        </div>
      </div>
    </div>
  );
};
