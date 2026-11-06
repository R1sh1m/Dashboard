import React from 'react';
import {
  Activity,
  BatteryCharging,
  Bot,
  CloudSun,
  CheckCircle2,
  Radio,
  Radar,
  TerminalSquare,
} from 'lucide-react';
import type { TelemetryPacket, LogEntry, LogLevel } from '../types/telemetry';
import type { SerialConnectionStatus } from '../services/webSerial';
import { BotStatusCard } from './BotStatusCard';
import { PowerStatusCard } from './PowerStatusCard';
import { MotorMatrixCard } from './MotorMatrixCard';
import { EnvironmentalCard } from './EnvironmentalCard';
import { RadarCard } from './RadarCard';
import { WirelessLinkCard } from './WirelessLinkCard';
import { LogControls, LogTerminal } from './LogTerminal';

export type SubsystemTab = 'bot' | 'power' | 'motors' | 'env' | 'radar' | 'link' | 'logs';

const TAB_LABELS: Record<SubsystemTab, string> = {
  bot: 'Bot Status',
  power: 'Battery & Power',
  motors: '18-Servo Matrix',
  env: 'Environmental (BME688)',
  radar: 'mmWave Radar',
  link: 'LoRa Wireless Link',
  logs: 'Logs',
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
  radarHistory: Array<{ timestamp: number; distance_cm: number; energy: number; target_state: string }>;
  serialStatus: SerialConnectionStatus;
  baudRate: number;
  setBaudRate: (baud: number) => void;
  onConnectSerial: () => void;
  onDisconnectSerial: () => void;
  onClearLogs: () => void;
  visibleTabs?: SubsystemTab[];
}

export const SensorSheet: React.FC<SensorSheetProps> = ({
  isOpen,
  activeTab,
  setActiveTab,
  telemetry,
  logs,
  radarHistory,
  serialStatus,
  baudRate,
  setBaudRate,
  onConnectSerial,
  onDisconnectSerial,
  onClearLogs,
  visibleTabs = ['bot', 'power', 'motors', 'env', 'radar', 'link', 'logs'],
}) => {
  const [filterLevel, setFilterLevel] = React.useState<LogLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [autoScroll, setAutoScroll] = React.useState(true);
  if (!isOpen) return null;
  const isCombinedSensors = visibleTabs.includes('env') && visibleTabs.includes('link');
  const isCoreTelemetry = visibleTabs.some((tab) => tab === 'bot' || tab === 'power' || tab === 'motors');
  const sheetTitle = TAB_LABELS[activeTab];

  const exportLogs = () => {
    const data = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(logs, null, 2))}`;
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = `artemis_logs_${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="sheet telemetry-sheet is-open" role="dialog" aria-label="Telemetry">
      <div className="sheet-header">
        <span className={`sheet-title${activeTab === 'logs' ? ' sheet-title-live-logs' : ''}`}>
          {activeTab === 'logs' && <TerminalSquare size={15} aria-hidden="true" />}
          {activeTab === 'logs' ? 'LIVE LOGS' : sheetTitle}
          {activeTab === 'logs' && <span className="log-count">({logs.length})</span>}
        </span>
        {activeTab === 'logs' && (
          <LogControls
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
            onExport={exportLogs}
            onClear={onClearLogs}
          />
        )}
        {isCoreTelemetry && (
          <div className="sheet-header-controls">
            <label className="baud-control">
              <span>Baud</span>
              <select
                value={baudRate}
                disabled={serialStatus === 'CONNECTED'}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                aria-label="Serial baud rate"
              >
                <option value={115200}>115200</option>
                <option value={921600}>921600</option>
              </select>
            </label>
            <button
              type="button"
              className={`serial-indicator ${serialStatus.toLowerCase()}`}
              onClick={serialStatus === 'CONNECTED' ? onDisconnectSerial : onConnectSerial}
              disabled={serialStatus === 'CONNECTING'}
              aria-label={serialStatus === 'CONNECTED' ? 'Disconnect ESP32' : 'Connect ESP32'}
              title={serialStatus === 'CONNECTED' ? 'ESP32 connected' : 'Connect ESP32'}
            >
              <CheckCircle2 size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="sheet-body">
        {isCoreTelemetry && (
          <div className="telemetry-tabs" role="tablist" aria-label="Telemetry sections">
            {visibleTabs.map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`telemetry-tab min-hit-target ${
                    activeTab === tab ? 'is-selected' : ''
                  } telemetry-tab-primary`}
                >
                  {TAB_ICONS[tab]}
                  {TAB_LABELS[tab]}
                </button>
              )
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1 space-y-3">
          {activeTab === 'bot' && <BotStatusCard status={telemetry?.bot_status ?? null} />}
          {activeTab === 'power' && <PowerStatusCard power={telemetry?.power ?? null} uptimeSec={telemetry?.bot_status.uptime_sec} />}
          {activeTab === 'motors' && <MotorMatrixCard motors={telemetry?.motors ?? null} />}
          {isCombinedSensors && (activeTab === 'env' || activeTab === 'link') && (
            <div className="sensor-pair">
              <EnvironmentalCard env={telemetry?.env ?? null} />
              <WirelessLinkCard link={telemetry?.link ?? null} seq={telemetry?.seq ?? 0} />
            </div>
          )}
          {!isCombinedSensors && activeTab === 'env' && <EnvironmentalCard env={telemetry?.env ?? null} />}
          {!isCombinedSensors && activeTab === 'link' && <WirelessLinkCard link={telemetry?.link ?? null} seq={telemetry?.seq ?? 0} />}
          {activeTab === 'radar' && <RadarCard radar={telemetry?.radar ?? null} history={radarHistory} />}
          {activeTab === 'logs' && (
            <div className="log-terminal-wrap">
              <LogTerminal
                logs={logs}
                filterLevel={filterLevel}
                setFilterLevel={setFilterLevel}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                autoScroll={autoScroll}
              />
            </div>
          )}
          </div>
        </div>
      </div>
  );
};
