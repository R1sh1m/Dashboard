import React, { useState } from 'react';
import type { MotorData } from '../types/telemetry';
import { Cog } from 'lucide-react';

interface MotorMatrixCardProps {
  motors: MotorData | null;
}

const LEGS = [
  { name: 'L1', position: 'Front left', ids: [1, 2, 3] },
  { name: 'L2', position: 'Mid left', ids: [4, 5, 6] },
  { name: 'L3', position: 'Rear left', ids: [7, 8, 9] },
  { name: 'R1', position: 'Front right', ids: [10, 11, 12] },
  { name: 'R2', position: 'Mid right', ids: [13, 14, 15] },
  { name: 'R3', position: 'Rear right', ids: [16, 17, 18] },
];

interface MotorLegButtonProps {
  leg: typeof LEGS[number];
  selected: number | null;
  onSelect: (id: number | null) => void;
}

const MotorLegButton: React.FC<MotorLegButtonProps> = React.memo(({ leg, selected, onSelect }) => {
  const isSelected = selected === leg.ids[0];
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect(isSelected ? null : leg.ids[0]);
    }
  };
  return (
    <button
      type="button"
      role="button"
      aria-pressed={isSelected}
        aria-label={`Motor leg ${leg.name} (${leg.position}), servos ${leg.ids.join(', ')}, ${isSelected ? 'selected' : 'not selected'}`}
      onClick={() => onSelect(isSelected ? null : leg.ids[0])}
      onKeyDown={handleKeyDown}
      className={`flex-1 min-w-[72px] p-2.5 rounded-lg border transition-all duration-150 ${
        isSelected
          ? 'border-[#0A84FF] bg-[#0A84FF]/20 text-white focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2'
          : 'border-white/10 text-neutral-300 hover:border-white/30 focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2'
      }`}
    >
      <div className="motor-leg-name">
        <strong>{leg.name}</strong>
        <small>{leg.position}</small>
      </div>
      <div className="text-xs font-mono text-neutral-400 mt-1">{leg.ids.join(', ')}</div>
    </button>
  );
});

export const MotorMatrixCard: React.FC<MotorMatrixCardProps> = React.memo(({ motors }) => {
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);

  const activeCount = motors?.active_count ?? 18;
  const servos = motors?.servos ?? [];

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-[#bf5af2]" />
          MOTOR MATRIX (18 SERVOS)
        </span>
        <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
          {activeCount} active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {LEGS.map((leg) => (
          <MotorLegButton
            key={leg.name}
            leg={leg}
            selected={selectedLeg}
            onSelect={setSelectedLeg}
          />
        ))}
      </div>

      <div className="glass-panel-subtle p-2.5 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm text-neutral-300 font-mono">
          <span>Avg temp</span>
          <span className="text-white font-bold">{servos.length > 0 ? servos.reduce((a, s) => a + s.temp, 0) / servos.length : 0}.1°C</span>
        </div>
        <div className="flex items-baseline justify-between text-sm text-neutral-300 font-mono">
          <span>Max temp</span>
          <span className="text-white font-bold">{motors?.max_temp_c ?? 0}.1°C</span>
        </div>
        <div className="flex items-baseline justify-between text-sm text-neutral-300 font-mono">
          <span>Fault mask</span>
          <span className={`font-mono ${motors?.fault_mask ? 'text-[#ff453a] font-bold' : 'text-[#30d158]'}`}>
            0x{motors?.fault_mask?.toString(16) ?? '0'}
          </span>
        </div>
      </div>
    </div>
  );
});

MotorMatrixCard.displayName = 'MotorMatrixCard';
