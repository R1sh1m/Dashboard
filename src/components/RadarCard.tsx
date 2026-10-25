import React from 'react';
import type { RadarData } from '../types/telemetry';
import { Target, UserCheck, UserX } from 'lucide-react';

interface RadarCardProps {
  radar: RadarData | null;
}

export const RadarCard: React.FC<RadarCardProps> = ({ radar }) => {
  const isDetected = radar?.human_detected ?? false;
  const state = radar?.target_state ?? 'NO_TARGET';
  const distance = radar?.distance_cm ?? 0;
  const energy = radar?.energy ?? 0;

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-[#ff453a]" />
          LD2410B MMWAVE RADAR
        </span>
        {isDetected ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-[#ff453a] border border-red-500/40 flex items-center gap-1 animate-pulse">
            <UserCheck className="w-3 h-3" />
            HUMAN PRESENT
          </span>
        ) : (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-400 flex items-center gap-1">
            <UserX className="w-3 h-3" />
            NO TARGET
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-[10px] text-neutral-400">TARGET STATE</span>
          <span className={`text-[12px] font-bold mt-0.5 ${isDetected ? 'text-[#ff453a]' : 'text-neutral-300'}`}>
            {state}
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-[10px] text-neutral-400">DISTANCE</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[15px] font-mono font-bold text-white">
              {isDetected ? distance : '--'}
            </span>
            <span className="text-[10px] text-neutral-400">cm</span>
          </div>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-[10px] text-neutral-400">SIGNAL ENERGY</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[15px] font-mono font-bold text-neutral-200">
              {isDetected ? energy : '--'}
            </span>
            <span className="text-[10px] text-neutral-400">%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
