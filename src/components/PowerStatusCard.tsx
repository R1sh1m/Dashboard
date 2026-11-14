import React from 'react';
import type { PowerData } from '../types/telemetry';
import { BatteryCharging, Clock3, Gauge } from 'lucide-react';

interface PowerStatusCardProps {
  power: PowerData | null;
  uptimeSec?: number;
}

export const PowerStatusCard: React.FC<PowerStatusCardProps> = React.memo(({ power, uptimeSec = 0 }) => {
  const voltage = power?.voltage_v ?? 11.1;
  const current = power?.current_a ?? 0;
  const percent = power?.percent ?? 0;
  const cells = power?.cell_voltages ?? [3.7, 3.7, 3.7];

  const maxCell = Math.max(...cells);
  const minCell = Math.min(...cells);
  const deltaCell = +(maxCell - minCell).toFixed(3);
  const isImbalanced = deltaCell > 0.08;
  const isLowSoc = percent <= 20;

  const getPercentColor = (pct: number) => {
    if (pct > 50) return '#30d158';
    if (pct > 20) return '#ffd60a';
    return '#ff453a';
  };

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5" aria-live={isLowSoc ? 'polite' : 'off'} aria-atomic="true">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <BatteryCharging className="w-3.5 h-3.5 text-[#30d158]" />
          ESTIMATED SERVO POWER
        </span>
        <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
          3S LiPo · 10,000 mAh
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-mono font-bold text-white leading-none">
              {voltage.toFixed(2)}
            </span>
            <span className="text-lg text-neutral-300 font-medium">V</span>
            <span className="text-lg text-neutral-300 ml-2 font-mono">
              ({current.toFixed(2)} A)
            </span>
          </div>
          <span
            className="text-2xl font-mono font-bold"
            style={{ color: getPercentColor(percent) }}
          >
            {percent}%
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.max(0, percent))}%`,
              backgroundColor: getPercentColor(percent),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {cells.map((cellV, idx) => (
          <div key={idx} className="glass-panel-subtle p-1.5 text-center flex flex-col">
            <span className="text-sm text-neutral-300 uppercase">CELL {idx + 1}</span>
            <span className="text-lg font-mono font-semibold text-neutral-200 mt-0.5">
              {cellV.toFixed(2)}V
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm px-1 text-neutral-300 font-mono">
        <span>CELL DELTA: Δ{deltaCell}V</span>
        <span className={isImbalanced ? 'text-[#ff453a] font-bold' : 'text-[#30d158]'}>
          {isImbalanced ? 'UNBALANCED' : 'BALANCED'}
        </span>
      </div>

      <div className="power-estimate-note">
        <span><Clock3 size={13} aria-hidden="true" /> Runtime model: {uptimeSec > 0 ? `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m` : '--'}</span>
        <span><Gauge size={13} aria-hidden="true" /> Average draw: {current > 0 ? `${current.toFixed(2)} A` : '--'}</span>
      </div>
      <p className="power-estimate-caption">Estimate only; servo load and runtime drive the projection.</p>
    </div>
  );
});

PowerStatusCard.displayName = 'PowerStatusCard';
