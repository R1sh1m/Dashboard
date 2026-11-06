import React, { useState } from 'react';
import type { MotorData } from '../types/telemetry';
import { Cog } from 'lucide-react';

interface MotorMatrixCardProps {
  motors: MotorData | null;
}

export const MotorMatrixCard: React.FC<MotorMatrixCardProps> = ({ motors }) => {
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);

  const activeCount = motors?.active_count ?? 18;
  const servos = motors?.servos ?? [];

  const legs = [
    { name: 'L1', position: 'Front left', ids: [1, 2, 3] },
    { name: 'L2', position: 'Mid left', ids: [4, 5, 6] },
    { name: 'L3', position: 'Rear left', ids: [7, 8, 9] },
    { name: 'R1', position: 'Front right', ids: [10, 11, 12] },
    { name: 'R2', position: 'Mid right', ids: [13, 14, 15] },
    { name: 'R3', position: 'Rear right', ids: [16, 17, 18] },
  ];

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-[#2997ff]" />
          18x ST3215 SERVO MATRIX
        </span>
        <div className="flex items-center gap-2 text-sm font-mono text-neutral-300">
          <span>ACTIVE: {activeCount}/18</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {legs.map((leg, legIdx) => {
          const legServos = servos.filter((s) => leg.ids.includes(s.id));
          return (
            <div
              key={legIdx}
              onClick={() => setSelectedLeg(selectedLeg === legIdx ? null : legIdx)}
              className="glass-panel-subtle p-2 flex flex-col gap-1 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center text-base">
                <span className="motor-leg-name">
                  <strong>{leg.name}</strong>
                  <small>{leg.position}</small>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1">
                {['C', 'F', 'T'].map((joint, jIdx) => {
                  const servo = legServos[jIdx];
                  const load = servo?.load ?? 20;
                  return (
                    <div key={jIdx} className="bg-black/20 rounded p-1 text-center flex flex-col items-center">
                      <span className="text-sm text-neutral-300">{joint}</span>
                      <span className="text-sm font-mono font-semibold text-neutral-200">
                        {load}%
                      </span>
                      <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, load)}%`,
                            backgroundColor: load > 75 ? '#ff453a' : load > 45 ? '#ffd60a' : '#2997ff',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
