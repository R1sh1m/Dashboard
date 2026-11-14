import React from 'react';
import type { RadarData } from '../types/telemetry';
import { Target, UserCheck, UserX, Activity, Clock, BarChart3 } from 'lucide-react';

interface RadarCardProps {
  radar: RadarData | null;
  history: Array<{ timestamp: number; distance_cm: number; energy: number; target_state: string }>;
}

const GATE_LABELS = ['2m', '3m', '4m', '5m', '6m', '7m', '8m'];

function gateBar(energy: number) {
  const pct = Math.max(0, Math.min(100, energy));
  return (
    <div className="w-full bg-white/5 rounded-full h-2">
      <div
        className="h-2 rounded-full transition-all duration-100"
        style={{
          width: `${pct}%`,
          backgroundColor: pct > 60 ? '#ff453a' : pct > 30 ? '#ffd60a' : '#30d158',
        }}
      />
    </div>
  );
}

export const RadarCard: React.FC<RadarCardProps> = React.memo(({ radar, history }) => {
  const isDetected = radar?.human_detected ?? false;
  const state = radar?.target_state ?? 'NO_TARGET';
  const movDist = radar?.mov_distance_cm ?? 0;
  const movEnergy = radar?.mov_energy ?? 0;
  const statDist = radar?.stat_distance_cm ?? 0;
  const statEnergy = radar?.stat_energy ?? 0;
  const engValid = radar?.eng_valid ?? false;
  const presentSince = radar?.present_since ?? null;

  // Presence duration
  const presentSec = presentSince && isDetected
    ? Math.floor((Date.now() - presentSince) / 1000)
    : 0;

  // Determine primary display distance/energy based on state
  const showMoving = state === 'MOVING' || state === 'COMBINED';
  const showStationary = state === 'STATIONARY' || state === 'COMBINED';

  const stateColor = state === 'NO_TARGET' ? '#6b7280' :
    state === 'MOVING' ? '#0A84FF' :
      state === 'STATIONARY' ? '#ffd60a' : '#ff453a';

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-3" aria-live="polite" aria-atomic="true">
      {/* Header with state badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target className="w-4 h-4 text-[#ff453a]" />
          <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
            LD2410B MMWAVE RADAR
          </span>
        </div>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 ${isDetected
            ? 'bg-[#FF453A]/20 text-[#FF453A] border border-[#FF453A]/40 animate-pulse'
            : 'bg-white/10 text-neutral-400'
            }` as string}
          aria-live="assertive"
          aria-atomic="true"
        >
          {isDetected ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
          {state === 'NO_TARGET' ? 'NO TARGET' : state}
        </span>
      </div>

      {/* Moving target panel */}
      {showMoving && (
        <div className="glass-panel-subtle p-2.5 rounded-lg border border-white/5">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium text-[#0A84FF] flex items-center gap-1">
              <Activity className="w-3 h-3" aria-hidden="true" /> MOVING TARGET
            </span>
            <span className="text-xs font-mono text-neutral-400">{movDist} cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs text-neutral-300">Energy</span>
            {gateBar(movEnergy)}
            <span className="w-12 text-xs font-mono text-neutral-300">{movEnergy}</span>
          </div>
        </div>
      )}

      {/* Stationary target panel */}
      {showStationary && (
        <div className="glass-panel-subtle p-2.5 rounded-lg border border-white/5">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium text-[#ffd60a] flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" /> STATIONARY TARGET
            </span>
            <span className="text-xs font-mono text-neutral-400">{statDist} cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs text-neutral-300">Energy</span>
            {gateBar(statEnergy)}
            <span className="w-12 text-xs font-mono text-neutral-300">{statEnergy}</span>
          </div>
        </div>
      )}

      {/* Engineering mode: range-gate profile */}
      {engValid && radar?.eng_mov_gates && radar?.eng_stat_gates && (
        <div className="glass-panel-subtle p-2.5 rounded-lg border border-white/5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-neutral-300 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" aria-hidden="true" /> RANGE-GATE PROFILE (ENG MODE)
            </span>
            <span className="text-[#30d158] font-mono">VALID</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {GATE_LABELS.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className="text-neutral-500">{label}</span>
                <div className="w-full h-3 bg-white/5 rounded">
                  <div
                    className="h-full rounded"
                    style={{
                      width: '100%',
                      backgroundColor:
                        radar.eng_mov_gates[i] > 60
                          ? '#ff453a'
                          : radar.eng_mov_gates[i] > 30
                            ? '#ffd60a'
                            : '#30d158',
                      opacity: Math.max(0.3, radar.eng_mov_gates[i] / 100),
                    }}
                  />
                </div>
                <div className="w-full h-3 bg-white/5 rounded mt-0.5">
                  <div
                    className="h-full rounded"
                    style={{
                      width: '100%',
                      backgroundColor:
                        radar.eng_stat_gates[i] > 60
                          ? '#ff453a'
                          : radar.eng_stat_gates[i] > 30
                            ? '#ffd60a'
                            : '#30d158',
                      opacity: Math.max(0.3, radar.eng_stat_gates[i] / 100),
                    }}
                  />
                </div>
                <span className="text-neutral-400">
                  {radar.eng_mov_gates[i]}/{radar.eng_stat_gates[i]}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
            <span>Moving</span>
            <span>Stationary</span>
          </div>
        </div>
      )}

      {/* Presence duration + summary metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="glass-panel-subtle p-2 rounded-lg border border-white/5">
          <div className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">PRESENCE</div>
          <div className="text-sm font-mono {isDetected ? 'text-[#0A84FF] font-bold' : 'text-neutral-400'}">
            {isDetected ? `${presentSec}s` : '—'}
          </div>
        </div>
        <div className="glass-panel-subtle p-2 rounded-lg border border-white/5">
          <div className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">STATE</div>
          <div className="text-sm font-mono" style={{ color: stateColor }}>
            {state}
          </div>
        </div>
      </div>

      {/* History mini-chart (last 10 detections) */}
      {history.length > 0 && (
        <div className="glass-panel-subtle p-2.5 rounded-lg border border-white/5">
          <div className="text-xs text-neutral-400 uppercase tracking-wider mb-1.5">DETECTION HISTORY</div>
          <div className="flex items-end gap-1 h-12">
            {history.slice(-10).map((h, i) => {
              const pct = Math.max(10, (h.energy / 100) * 100);
              return (
                <div
                  key={i}
                  className="flex flex-col items-center justify-end gap-0.5 w-full"
                  title={`Dist: ${h.distance_cm}cm | Energy: ${h.energy}% | ${h.target_state}`}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: h.energy > 60 ? '#ff453a' : h.energy > 30 ? '#ffd60a' : '#30d158',
                    }}
                  />
                  <span className="text-[10px] text-neutral-500">{h.distance_cm}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

RadarCard.displayName = 'RadarCard';
