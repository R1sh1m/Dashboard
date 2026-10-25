import React from 'react';
import { Radio, Zap, AlertOctagon, Cpu, Play, Square, MapPin } from 'lucide-react';
import type { TelemetryPacket } from '../types/telemetry';
import type { SerialConnectionStatus } from '../services/webSerial';

interface HeaderProps {
  telemetry: TelemetryPacket | null;
  serialStatus: SerialConnectionStatus;
  baudRate: number;
  onBaudChange: (baud: number) => void;
  onConnectSerial: () => void;
  onDisconnectSerial: () => void;
  isSimulating: boolean;
  onToggleSimulator: () => void;
  onTriggerEStop: () => void;
  onOpenMarkPoi: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  telemetry,
  serialStatus,
  baudRate,
  onBaudChange,
  onConnectSerial,
  onDisconnectSerial,
  isSimulating,
  onToggleSimulator,
  onTriggerEStop,
  onOpenMarkPoi,
}) => {
  const botState = telemetry?.bot_status.state ?? 'STANDBY';
  const isEStop = botState === 'EMERGENCY_STOP';
  const uptimeSec = telemetry?.bot_status.uptime_sec ?? 0;
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const uptimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const rssi = telemetry?.link.rssi_dbm ?? -99;
  const snr = telemetry?.link.snr_db ?? 0;

  return (
    <header className="glass-header h-14 px-4 flex items-center justify-between z-30 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0066cc] to-[#2997ff] flex items-center justify-center shadow-md">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[14px] tracking-tight text-white">ARTEMIS</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">GROUND STATION</span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
              <span>HEXAPOD 18-DOF</span>
              <span>•</span>
              <span>UPTIME {uptimeStr}</span>
            </div>
          </div>
        </div>

        <div className={`px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide flex items-center gap-1.5 ${
          isEStop ? 'badge-critical' : botState === 'WALKING' ? 'badge-nominal' : 'badge-warning'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isEStop ? 'bg-[#ff453a] animate-ping' : botState === 'WALKING' ? 'bg-[#30d158] animate-pulse' : 'bg-[#ffd60a]'
          }`} />
          {botState}
        </div>
      </div>

      <div className="hidden md:flex items-center gap-4 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[12px]">
        <div className="flex items-center gap-1.5 text-neutral-300">
          <Radio className="w-3.5 h-3.5 text-[#bf5af2]" />
          <span className="font-mono text-[11px]">SX1262 LoRa</span>
        </div>
        <div className="h-3 w-px bg-white/15" />
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className={rssi > -80 ? 'text-[#30d158]' : rssi > -100 ? 'text-[#ffd60a]' : 'text-[#ff453a]'}>
            RSSI: {rssi} dBm
          </span>
          <span className="text-neutral-400">SNR: {snr.toFixed(1)} dB</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenMarkPoi}
          className="btn-apple-secondary text-[12px] py-1 px-2.5"
          title="Mark Point of Interest on map at current coordinates"
        >
          <MapPin className="w-3.5 h-3.5 text-[#30d158]" />
          <span>Mark POI</span>
        </button>

        <button
          onClick={onToggleSimulator}
          className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border flex items-center gap-1.5 transition-all ${
            isSimulating
              ? 'bg-[#bf5af2]/20 border-[#bf5af2]/50 text-[#bf5af2]'
              : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
          }`}
          title="Toggle built-in mock telemetry simulator for testing"
        >
          {isSimulating ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          <span>{isSimulating ? 'Stop Sim' : 'Simulate'}</span>
        </button>

        <select
          value={baudRate}
          disabled={serialStatus === 'CONNECTED'}
          onChange={(e) => onBaudChange(Number(e.target.value))}
          className="bg-black/30 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-neutral-200 focus:outline-none focus:border-[#2997ff]"
        >
          <option value={115200}>115200 Baud</option>
          <option value={921600}>921600 Baud</option>
        </select>

        {serialStatus === 'CONNECTED' ? (
          <button
            onClick={onDisconnectSerial}
            className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full text-[12px] font-medium hover:bg-red-500/30 transition-all flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>Disconnect</span>
          </button>
        ) : (
          <button
            onClick={onConnectSerial}
            disabled={serialStatus === 'CONNECTING'}
            className="btn-apple-primary text-[12px] py-1 px-3"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{serialStatus === 'CONNECTING' ? 'Connecting...' : 'Connect ESP32'}</span>
          </button>
        )}

        <button
          onClick={onTriggerEStop}
          className="btn-danger text-[12px] py-1 px-3"
          title="Broadcast Emergency Stop (E-STOP) to freeze all robot joints immediately"
        >
          <AlertOctagon className="w-3.5 h-3.5" />
          <span>E-STOP</span>
        </button>
      </div>
    </header>
  );
};
