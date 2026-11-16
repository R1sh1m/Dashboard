import React, { useState, useRef, useEffect } from 'react';
import type { MotorData } from '../types/telemetry';
import { Cog } from 'lucide-react';

interface MotorMatrixCardProps {
  motors: MotorData | null;
}

interface ServoMotion {
  pos: number;
  delta: number;
}

const LEGS = [
  { name: 'L1', position: 'Front left', ids: [1, 2, 3] },
  { name: 'L2', position: 'Mid left', ids: [4, 5, 6] },
  { name: 'L3', position: 'Rear left', ids: [7, 8, 9] },
  { name: 'R1', position: 'Front right', ids: [10, 11, 12] },
  { name: 'R2', position: 'Mid right', ids: [13, 14, 15] },
  { name: 'R3', position: 'Rear right', ids: [16, 17, 18] },
];

const JOINT_NAMES = ['Coxa', 'Femur', 'Tibia'] as const;

const formatDelta = (delta: number) => {
  if (Math.abs(delta) < 0.05) return '0.0°';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}°`;
};

const getDeltaColor = (delta: number) => {
  if (Math.abs(delta) < 0.05) return 'text-neutral-400';
  return delta > 0 ? 'text-[#30D158]' : 'text-[#0A84FF]';
};

interface MotorLegButtonProps {
  leg: typeof LEGS[number];
  selected: number | null;
  onSelect: (id: number | null) => void;
  motions: Map<number, ServoMotion>;
}

const MotorLegButton: React.FC<MotorLegButtonProps> = React.memo(({ leg, selected, onSelect, motions }) => {
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
      className={`flex-1 min-w-[72px] p-2.5 rounded-lg border transition-all duration-150 text-left ${
        isSelected
          ? 'border-[#0A84FF] bg-[#0A84FF]/20 text-white focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2'
          : 'border-white/10 text-neutral-300 hover:border-white/30 focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2'
      }`}
    >
      <div className="motor-leg-name">
        <strong>{leg.name}</strong>
        <small>{leg.position}</small>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11px] font-mono mt-1 pt-1 border-t border-white/5">
        {leg.ids.map((id, idx) => {
          const joint = JOINT_NAMES[idx];
          const motion = motions.get(id);
          const delta = motion?.delta ?? 0;
          return (
            <div key={id} className="flex flex-col items-center">
              <span className="text-[9px] text-neutral-500 font-sans">{joint[0]}</span>
              <span className={`text-[10px] font-semibold ${getDeltaColor(delta)}`}>
                {formatDelta(delta)}
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
});

export const MotorMatrixCard: React.FC<MotorMatrixCardProps> = React.memo(({ motors }) => {
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [servoMotions, setServoMotions] = useState<Map<number, ServoMotion>>(() => new Map());
  const lastPositionsRef = useRef<Map<number, number>>(new Map());

  const activeCount = motors?.active_count ?? 18;

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const currentServos = motors?.servos ?? [];
      const servoMap = new Map<number, number>();
      currentServos.forEach((s) => servoMap.set(s.id, s.pos));

      const nextMotions = new Map<number, ServoMotion>();
      for (let id = 1; id <= 18; id++) {
        const currentPos = servoMap.get(id);
        if (currentPos !== undefined) {
          const lastPos = lastPositionsRef.current.get(id);
          const delta = lastPos !== undefined ? currentPos - lastPos : 0;
          lastPositionsRef.current.set(id, currentPos);
          nextMotions.set(id, { pos: currentPos, delta });
        } else {
          const lastPos = lastPositionsRef.current.get(id) ?? 0;
          nextMotions.set(id, { pos: lastPos, delta: 0 });
        }
      }
      setServoMotions(nextMotions);
    });
    return () => cancelAnimationFrame(handle);
  }, [motors?.servos]);

  // Determine currently selected leg or default to first leg if clicked
  const activeLegInfo = LEGS.find((l) => l.ids[0] === selectedLeg) ?? null;

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
            motions={servoMotions}
          />
        ))}
      </div>

      <div className="glass-panel-subtle p-2.5 flex flex-col gap-2 rounded-lg border border-white/5">
        <div className="flex items-center justify-between text-xs text-neutral-400 uppercase tracking-wider">
          <span>
            {activeLegInfo
              ? `${activeLegInfo.name} (${activeLegInfo.position}) ROTATION`
              : 'SERVO ROTATION (RELATIVE TO LAST POSITION)'}
          </span>
          <span className="text-[10px] text-neutral-500 font-sans lowercase">
            {activeLegInfo ? 'click leg again to deselect' : 'select leg for joint view'}
          </span>
        </div>

        {/* Selected leg servo detail or general status */}
        {activeLegInfo ? (
          <div className="grid grid-cols-3 gap-2 py-1">
            {activeLegInfo.ids.map((id, idx) => {
              const joint = JOINT_NAMES[idx];
              const motion = servoMotions.get(id);
              const delta = motion?.delta ?? 0;
              const pos = motion?.pos ?? 0;
              return (
                <div key={id} className="bg-white/5 p-2 rounded-md flex flex-col gap-0.5 font-mono">
                  <div className="text-[10px] text-neutral-400 font-sans flex justify-between">
                    <span>S{id}</span>
                    <span className="text-neutral-500">{joint}</span>
                  </div>
                  <div className={`text-sm font-bold ${getDeltaColor(delta)}`}>
                    Δ {formatDelta(delta)}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Pos: {pos.toFixed(1)}°
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400 py-0.5">
            <span>Status</span>
            <span className="text-[#30D158] font-semibold">Ready · Tracking 18 joints</span>
          </div>
        )}

        <div className="flex items-baseline justify-between text-sm text-neutral-300 font-mono pt-1 border-t border-white/5">
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
