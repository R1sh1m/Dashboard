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
  const signalColor = bars >= 3 ? '#30d158' : bars === 2 ? '#ffd60a' : '#ff453a';

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Radio
            className="w-3.5 h-3.5"
            style={{ color: signalColor }}
            aria-label={`LoRa signal ${bars} of 4`}
          />
          LORA SX1262 WIRELESS LINK
        </span>
        <span className="wireless-signal-label" style={{ color: signalColor }}>
          {bars}/4 signal
        </span>
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

      <div className="flex items-center text-sm text-neutral-300 font-mono px-1">
        <span>PACKET SEQ: #{seq}</span>
      </div>
    </div>
  );
};
