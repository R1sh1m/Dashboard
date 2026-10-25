import React, { useState } from 'react';
import type { MotorData } from '../types/telemetry';
import { Cog } from 'lucide-react';

interface MotorMatrixCardProps {
  motors: MotorData | null;
}

export const MotorMatrixCard: React.FC<MotorMatrixCardProps> = ({ motors }) => {
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);

  const activeCount = motors?.active_count ?? 18;
  const maxTemp = motors?.max_temp_c ?? 40;
  const servos = motors?.servos ?? [];

  const legs = [
    { name: 'L1 (Front-Left)', ids: [1, 2, 3] },
    { name: 'L2 (Mid-Left)', ids: [4, 5, 6] },
    { name: 'L3 (Rear-Left)', ids: [7, 8, 9] },
    { name: 'R1 (Front-Right)', ids: [10, 11, 12] },
    { name: 'R2 (Mid-Right)', ids: [13, 14, 15] },
    { name: 'R3 (Rear-Right)', ids: [16, 17, 18] },
  ];

  const getTempColor = (t: number) => {
    if (t > 55) return '#ff453a';
    if (t > 45) return '#ffd60a';
    return '#30d158';
  };

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-[#2997ff]" />
          18x ST3215 SERVO MATRIX
        </span>
        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-300">
          <span>ACTIVE: {activeCount}/18</span>
          <span>•</span>
          <span style={{ color: getTempColor(maxTemp) }}>MAX: {maxTemp.toFixed(1)}°C</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {legs.map((leg, legIdx) => {
          const legServos = servos.filter((s) => leg.ids.includes(s.id));
          const legAvgTemp = legServos.length
            ? +(legServos.reduce((a, b) => a + b.temp, 0) / legServos.length).toFixed(1)
            : 35;

          return (
            <div
              key={legIdx}
              onClick={() => setSelectedLeg(selectedLeg === legIdx ? null : legIdx)}
              className="glass-panel-subtle p-2 flex flex-col gap-1 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-neutral-200">{leg.name}</span>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: getTempColor(legAvgTemp) }}
                >
                  {legAvgTemp}°C
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1">
                {['C', 'F', 'T'].map((joint, jIdx) => {
                  const servo = legServos[jIdx];
                  const load = servo?.load ?? 20;
                  return (
                    <div key={jIdx} className="bg-black/20 rounded p-1 text-center flex flex-col items-center">
                      <span className="text-[9px] text-neutral-400">{joint}</span>
                      <span className="text-[10px] font-mono font-semibold text-neutral-200">
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
