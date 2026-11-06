import React from 'react';
import type { EnvData } from '../types/telemetry';
import { Wind, Thermometer, Droplets, Gauge, AlertTriangle } from 'lucide-react';

interface EnvironmentalCardProps {
  env: EnvData | null;
}

export const EnvironmentalCard: React.FC<EnvironmentalCardProps> = ({ env }) => {
  const temp = env?.temp_c ?? 25;
  const humidity = env?.humidity_pct ?? 50;
  const pressure = env?.pressure_hpa ?? 1013.2;
  const gas = env?.gas_resistance_kohm ?? 40;
  const iaq = env?.iaq ?? 40;
  const isAnomaly = env?.anomaly_flag ?? false;

  const getIaqQuality = (val: number) => {
    if (val <= 50) return { label: 'EXCELLENT', color: '#30d158' };
    if (val <= 100) return { label: 'GOOD', color: '#30d158' };
    if (val <= 150) return { label: 'MODERATE', color: '#ffd60a' };
    if (val <= 200) return { label: 'POOR', color: '#ff9f0a' };
    return { label: 'HAZARDOUS', color: '#ff453a' };
  };

  const iaqStatus = getIaqQuality(iaq);

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-[#ffd60a]" />
          BME688 ENVIRONMENTAL SENSORS
        </span>
        {isAnomaly ? (
          <span className="text-sm font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-[#ffd60a] border border-amber-500/40 flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            GAS DISTURBANCE
          </span>
        ) : (
          <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
            NOMINAL
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300 flex items-center gap-1">
            <Thermometer className="w-3 h-3 text-[#ff9f0a]" />
            TEMPERATURE
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-3xl font-mono font-bold text-white">
              {temp.toFixed(1)}
            </span>
            <span className="text-base text-neutral-300">°C</span>
          </div>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300 flex items-center gap-1">
            <Droplets className="w-3 h-3 text-[#2997ff]" />
            HUMIDITY
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-3xl font-mono font-bold text-white">
              {humidity.toFixed(1)}
            </span>
            <span className="text-base text-neutral-300">%</span>
          </div>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300 flex items-center gap-1">
            <Gauge className="w-3 h-3 text-[#30d158]" />
            PRESSURE
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-3xl font-mono font-bold text-white">
              {pressure.toFixed(1)}
            </span>
            <span className="text-base text-neutral-300">hPa</span>
          </div>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <div className="flex items-center justify-between text-sm text-neutral-300">
            <span>GAS RESIST</span>
            <span style={{ color: iaqStatus.color }} className="font-bold text-sm">
              {iaqStatus.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-3xl font-mono font-bold text-white">
              {gas.toFixed(1)}
            </span>
            <span className="text-base text-neutral-300">kΩ</span>
            <span className="text-base font-mono ml-auto" style={{ color: iaqStatus.color }}>
              IAQ {iaq}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
