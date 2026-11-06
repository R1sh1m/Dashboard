import React from 'react';
import type { RadarData } from '../types/telemetry';
import { Target, UserCheck, UserX } from 'lucide-react';

interface RadarCardProps {
  radar: RadarData | null;
  history: Array<{ timestamp: number; distance_cm: number; energy: number; target_state: string }>;
}

export const RadarCard: React.FC<RadarCardProps> = ({ radar, history }) => {
  const isDetected = radar?.human_detected ?? false;
  const state = radar?.target_state ?? 'NO_TARGET';
  const distance = radar?.distance_cm ?? 0;
  const energy = radar?.energy ?? 0;

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-[#ff453a]" />
          LD2410B MMWAVE RADAR
        </span>
        {isDetected ? (
          <span className="text-sm font-bold px-1.5 py-0.5 rounded bg-[#FF453A]/20 text-[#FF453A] border border-[#FF453A]/40 flex items-center gap-1 animate-pulse">
            <UserCheck className="w-3 h-3" />
            HUMAN PRESENT
          </span>
        ) : (
          <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 flex items-center gap-1">
            <UserX className="w-3 h-3" />
            NO TARGET
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">TARGET STATE</span>
          <span className={`text-lg font-bold mt-0.5 ${isDetected ? 'text-[#ff453a]' : 'text-neutral-300'}`}>
            {state}
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">DISTANCE</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-mono font-bold text-white">
              {isDetected ? distance : '--'}
            </span>
            <span className="text-sm text-neutral-300">cm</span>
          </div>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">SIGNAL ENERGY</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-mono font-bold text-neutral-200">
              {isDetected ? energy : '--'}
            </span>
            <span className="text-sm text-neutral-300">%</span>
          </div>
        </div>
      </div>

      <section className="radar-history" aria-labelledby="radar-history-title">
        <div className="radar-history-heading">
          <h3 id="radar-history-title">Detection history</h3>
          <span>{history.length} events</span>
        </div>
        {history.length === 0 ? (
          <p className="radar-history-empty">No person detections recorded.</p>
        ) : (
          <ol className="radar-history-list">
            {[...history].reverse().map((event) => (
              <li key={event.timestamp}>
                <span className="radar-history-dot" aria-hidden="true" />
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                <strong>{event.target_state.replace('_', ' ')}</strong>
                <small>{event.distance_cm} cm · {event.energy}%</small>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
