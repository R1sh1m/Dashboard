import React from 'react';
import type { LinkData } from '../types/telemetry';
import { Radio } from 'lucide-react';

interface WirelessLinkCardProps {
  link: LinkData | null;
  seq: number;
}

export const WirelessLinkCard: React.FC<WirelessLinkCardProps> = ({ link, seq }) => {
  const rssi = link?.rssi_dbm ?? -95;
  const snr = link?.snr_db ?? 0;
  const packetLoss = link?.packet_loss_pct ?? 0;
  const latency = link?.latency_ms ?? 0;

  const getSignalBars = (val: number) => {
    if (val >= -75) return 4;
    if (val >= -85) return 3;
    if (val >= -95) return 2;
    return 1;
  };

  const bars = getSignalBars(rssi);

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-[#bf5af2]" />
          LORA SX1262 WIRELESS LINK
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className="w-1 rounded-sm transition-all"
              style={{
                height: `${bar * 3.5 + 4}px`,
                backgroundColor: bar <= bars ? '#bf5af2' : 'rgba(255, 255, 255, 0.15)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">RSSI</span>
          <span className="text-xl font-mono font-bold text-white mt-0.5">
            {rssi} <span className="text-sm font-normal text-neutral-300">dBm</span>
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">SNR</span>
          <span className="text-xl font-mono font-bold text-white mt-0.5">
            {snr.toFixed(1)} <span className="text-sm font-normal text-neutral-300">dB</span>
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">LOSS</span>
          <span className={`text-xl font-mono font-bold mt-0.5 ${packetLoss > 2 ? 'text-[#ff453a]' : 'text-[#30d158]'}`}>
            {packetLoss.toFixed(1)}%
          </span>
        </div>

        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">LATENCY</span>
          <span className="text-xl font-mono font-bold text-neutral-200 mt-0.5">
            {latency} <span className="text-sm font-normal text-neutral-300">ms</span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-300 font-mono px-1">
        <span>PACKET SEQ: #{seq}</span>
        <span className="text-[#30d158] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" />
          ACTIVE DUAL-ESP32 LINK
        </span>
      </div>
    </div>
  );
};
