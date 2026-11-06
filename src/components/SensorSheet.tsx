import React from 'react';
import {
  Activity,
  AlertOctagon,
  BatteryCharging,
  Bot,
  CloudSun,
  Radio,
  Radar,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import type { TelemetryPacket, LogEntry } from '../types/telemetry';
import type { SerialConnectionStatus } from '../services/webSerial';
import { BotStatusCard } from './BotStatusCard';
import { PowerStatusCard } from './PowerStatusCard';
import { MotorMatrixCard } from './MotorMatrixCard';
import { EnvironmentalCard } from './EnvironmentalCard';
import { RadarCard } from './RadarCard';
import { WirelessLinkCard } from './WirelessLinkCard';
import { LogTerminal } from './LogTerminal';

export type SubsystemTab = 'bot' | 'power' | 'motors' | 'env' | 'radar' | 'link' | 'logs';

const TAB_LABELS: Record<SubsystemTab, string> = {
  bot: 'Bot Status',
  power: 'Battery & Power',
  motors: '18-Servo Matrix',
  env: 'Environmental (BME688)',
  radar: 'mmWave Radar',
  link: 'LoRa Wireless Link',
  logs: 'Telemetry Logs',
};

const TAB_ICONS: Record<SubsystemTab, React.ReactNode> = {
  bot: <Bot size={15} aria-hidden="true" />,
  power: <BatteryCharging size={15} aria-hidden="true" />,
  motors: <Activity size={15} aria-hidden="true" />,
  env: <CloudSun size={15} aria-hidden="true" />,
  radar: <Radar size={15} aria-hidden="true" />,
  link: <Radio size={15} aria-hidden="true" />,
  logs: <TerminalSquare size={15} aria-hidden="true" />,
};

interface SensorSheetProps {
  isOpen: boolean;
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
  visibleTabs?: SubsystemTab[];
}

export const SensorSheet: React.FC<SensorSheetProps> = ({
  isOpen,
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
  visibleTabs = ['bot', 'power', 'motors', 'env', 'radar', 'link', 'logs'],
}) => {
  if (!isOpen) return null;

  return (
    <div className="sheet telemetry-sheet is-open" role="dialog" aria-label="Telemetry">
      <div className="sheet-header">
        <span className="sheet-title">Telemetry</span>
      </div>

      <div className="sheet-body">
        <div className="telemetry-tabs" role="tablist" aria-label="Telemetry sections">
          {visibleTabs.map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`telemetry-tab min-hit-target ${
                  activeTab === tab
                    ? 'bg-[#0A84FF] text-white shadow-sm'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                {TAB_ICONS[tab]}
                {TAB_LABELS[tab]}
              </button>
            )
          )}
        </div>

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
          <div className="flex items-center gap-2">
            <select
              value={baudRate}
              disabled={serialStatus === 'CONNECTED'}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-base font-mono text-white focus:outline-none focus:border-[#0A84FF]"
            >
              <option value={115200}>115200 Baud</option>
              <option value={921600}>921600 Baud</option>
            </select>
            {serialStatus === 'CONNECTED' ? (
              <button
                onClick={onDisconnectSerial}
                className="min-hit-target px-3 py-1.5 bg-[#ff453a]/15 text-[#ff453a] border border-[#ff453a]/35 rounded-full text-lg font-medium hover:bg-[#ff453a]/25 transition-colors flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a]" />
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                onClick={onConnectSerial}
                disabled={serialStatus === 'CONNECTING'}
                className="min-hit-target px-3 py-1.5 rounded-full bg-[#0A84FF] text-white text-lg font-medium shadow-md hover:bg-[#0A84FF] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Zap className="w-3 h-3" />
                <span>{serialStatus === 'CONNECTING' ? 'Connecting…' : 'Connect ESP32'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerEStop}
              className="min-hit-target px-3 py-1.5 bg-[#ff453a] text-white text-lg font-medium shadow-lg shadow-[#ff453a]/30 hover:bg-[#c0392b] transition-colors flex items-center gap-1.5"
              title="Broadcast Emergency Stop (E-STOP) to freeze all robot joints immediately"
            >
              <AlertOctagon className="w-3 h-3" />
              <span>E-STOP</span>
            </button>
          </div>
        </div>
      </div>
  );
};
