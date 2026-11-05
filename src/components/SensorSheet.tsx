import React from 'react';
import { X, Zap, AlertOctagon } from 'lucide-react';
import type { TelemetryPacket, LogEntry } from '../types/telemetry';
import type { SerialConnectionStatus } from '../services/webSerial';
import { BotStatusCard } from './BotStatusCard';
import { PowerStatusCard } from './PowerStatusCard';
import { MotorMatrixCard } from './MotorMatrixCard';
import { EnvironmentalCard } from './EnvironmentalCard';
import { RadarCard } from './RadarCard';
import { WirelessLinkCard } from './WirelessLinkCard';
import { LogTerminal } from './LogTerminal';

type SubsystemTab = 'bot' | 'power' | 'motors' | 'env' | 'radar' | 'link' | 'logs';

const TAB_LABELS: Record<SubsystemTab, string> = {
  bot: 'Bot Status',
  power: 'Battery & Power',
  motors: '18-Servo Matrix',
  env: 'Environmental (BME688)',
  radar: 'mmWave Radar',
  link: 'LoRa Wireless Link',
  logs: 'Telemetry Logs',
};

interface SensorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SubsystemTab;
  setActiveTab: (tab: SubsystemTab) => void;
  telemetry: TelemetryPacket | null;
  logs: LogEntry[];
  serialStatus: SerialConnectionStatus;
  baudRate: number;
  setBaudRate: (baud: number) => void;
  onConnectSerial: () => void;
  onDisconnectSerial: () => void;
  onTriggerEStop: () => void;
}

export const SensorSheet: React.FC<SensorSheetProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  telemetry,
  logs,
  serialStatus,
  baudRate,
  setBaudRate,
  onConnectSerial,
  onDisconnectSerial,
  onTriggerEStop,
}) => {
  if (!isOpen) return null;

  const rssi = telemetry?.link.rssi_dbm ?? -99;

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />

      <div className="sheet telemetry-sheet is-open" role="dialog" aria-label="Telemetry">
        <div className="sheet-header">
          <span className="sheet-title">Telemetry</span>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/6 text-white flex items-center justify-center hover:bg-white/12 transition-colors"
            aria-label="Close sensor panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="sheet-body">
          {/* Tab selector row */}
          <div className="rounded-lg bg-white/5 px-1 flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {(['bot', 'power', 'motors', 'env', 'radar', 'link', 'logs'] as SubsystemTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                    activeTab === tab
                      ? 'bg-[#007AFF] text-white shadow-sm'
                      : 'text-neutral-400 hover:bg-white/10'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              )
            )}
          </div>

          {/* Active subsystem card body */}
          <div className="flex-1 overflow-y-auto p-1 space-y-3">
            {activeTab === 'bot' && <BotStatusCard status={telemetry?.bot_status ?? null} />}
            {activeTab === 'power' && <PowerStatusCard power={telemetry?.power ?? null} />}
            {activeTab === 'motors' && <MotorMatrixCard motors={telemetry?.motors ?? null} />}
            {activeTab === 'env' && <EnvironmentalCard env={telemetry?.env ?? null} />}
            {activeTab === 'radar' && <RadarCard radar={telemetry?.radar ?? null} />}
            {activeTab === 'link' && (
              <WirelessLinkCard link={telemetry?.link ?? null} seq={telemetry?.seq ?? 0} />
            )}
            {activeTab === 'logs' && (
              <div className="h-[300px]">
                <LogTerminal logs={logs} onClearLogs={() => {}} />
              </div>
            )}
          </div>
        </div>

        <div className="sheet-footer">
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
            <span>LoRa Link</span>
            <span className={`font-bold ${rssi > -80 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
              {rssi} dBm
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={baudRate}
              disabled={serialStatus === 'CONNECTED'}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-[#007AFF]"
            >
              <option value={115200}>115200 Baud</option>
              <option value={921600}>921600 Baud</option>
            </select>
            {serialStatus === 'CONNECTED' ? (
              <button
                onClick={onDisconnectSerial}
                className="px-3 py-1.5 bg-[#ff453a]/15 text-[#ff453a] border border-[#ff453a]/35 rounded-full text-[12px] font-medium hover:bg-[#ff453a]/25 transition-colors flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a]" />
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                onClick={onConnectSerial}
                disabled={serialStatus === 'CONNECTING'}
                className="px-3 py-1.5 rounded-full bg-[#007AFF] text-white text-[12px] font-medium shadow-md hover:bg-[#0071e3] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Zap className="w-3 h-3" />
                <span>{serialStatus === 'CONNECTING' ? 'Connecting…' : 'Connect ESP32'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerEStop}
              className="px-3 py-1.5 bg-[#ff453a] text-white text-[12px] font-medium shadow-lg shadow-[#ff453a]/30 hover:bg-[#c0392b] transition-colors flex items-center gap-1.5"
              title="Broadcast Emergency Stop (E-STOP) to freeze all robot joints immediately"
            >
              <AlertOctagon className="w-3 h-3" />
              <span>E-STOP</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
