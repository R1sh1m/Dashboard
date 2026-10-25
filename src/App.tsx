import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { BotStatusCard } from './components/BotStatusCard';
import { PowerStatusCard } from './components/PowerStatusCard';
import { MotorMatrixCard } from './components/MotorMatrixCard';
import { EnvironmentalCard } from './components/EnvironmentalCard';
import { RadarCard } from './components/RadarCard';
import { WirelessLinkCard } from './components/WirelessLinkCard';
import { LogTerminal } from './components/LogTerminal';
import { PoiModal } from './components/PoiModal';
import type { TelemetryPacket, PointOfInterest, LogEntry } from './types/telemetry';
import { serialService, type SerialConnectionStatus } from './services/webSerial';
import { simulatorService } from './services/simulator';

export function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [serialStatus, setSerialStatus] = useState<SerialConnectionStatus>('DISCONNECTED');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);

  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [homePosition, setHomePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPoiModalOpen, setIsPoiModalOpen] = useState<boolean>(false);

  const addLog = (level: 'INFO' | 'WARN' | 'ERR' | 'RAW', subsystem: string, message: string) => {
    setLogs((prev) => {
      const entry: LogEntry = {
        id: `log_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
        level,
        subsystem,
        message,
      };
      return [...prev.slice(-300), entry];
    });
  };

  const handleIncomingPacket = (packet: TelemetryPacket) => {
    setTelemetry(packet);
    setLastPacketTime(Date.now());

    if (!homePosition && packet.gps.valid && packet.gps.lat && packet.gps.lng) {
      setHomePosition({ lat: packet.gps.lat, lng: packet.gps.lng });
      addLog('INFO', 'GPS', `Home Base Origin latched at ${packet.gps.lat.toFixed(6)}, ${packet.gps.lng.toFixed(6)}`);
    }

    if (packet.radar.human_detected && packet.gps.valid) {
      setPois((prev) => {
        const hasRecentHuman = prev.some(
          (p) => p.category === 'HUMAN_RADAR' && Date.now() - p.timestamp < 15000
        );
        if (!hasRecentHuman) {
          addLog('WARN', 'RADAR', `Human Presence Detected at ${packet.radar.distance_cm} cm (Energy: ${packet.radar.energy}%)`);
          return [
            ...prev,
            {
              id: `human_${Date.now()}`,
              category: 'HUMAN_RADAR',
              lat: packet.gps.lat,
              lng: packet.gps.lng,
              title: 'Human Presence (LD2410B)',
              notes: `Target: ${packet.radar.target_state} | Dist: ${packet.radar.distance_cm}cm | Energy: ${packet.radar.energy}%`,
              timestamp: Date.now(),
              meta: {
                distance_cm: packet.radar.distance_cm,
                energy: packet.radar.energy,
              },
            },
          ];
        }
        return prev;
      });
    }

    if (packet.env.anomaly_flag && packet.gps.valid) {
      setPois((prev) => {
        const hasRecentEnv = prev.some(
          (p) => p.category === 'ENV_ANOMALY' && Date.now() - p.timestamp < 20000
        );
        if (!hasRecentEnv) {
          addLog('WARN', 'BME688', `Air Quality Disturbance: IAQ ${packet.env.iaq}, Gas: ${packet.env.gas_resistance_kohm} kΩ`);
          return [
            ...prev,
            {
              id: `env_${Date.now()}`,
              category: 'ENV_ANOMALY',
              lat: packet.gps.lat,
              lng: packet.gps.lng,
              title: 'Environmental Gas Spike',
              notes: `BME688 Gas: ${packet.env.gas_resistance_kohm} kΩ | IAQ: ${packet.env.iaq}`,
              timestamp: Date.now(),
              meta: {
                gas_kohm: packet.env.gas_resistance_kohm,
                iaq: packet.env.iaq,
              },
            },
          ];
        }
        return prev;
      });
    }
  };

  useEffect(() => {
    serialService.setCallbacks({
      onPacket: (packet) => {
        handleIncomingPacket(packet);
      },
      onRawLine: (line) => {
        if (!line.startsWith('{')) {
          addLog('RAW', 'SERIAL', line);
        }
      },
      onStatusChange: (status, error) => {
        setSerialStatus(status);
        if (status === 'CONNECTED') {
          addLog('INFO', 'SERIAL', `Connected to Ground ESP32 at ${baudRate} Baud`);
        } else if (status === 'DISCONNECTED') {
          addLog('WARN', 'SERIAL', 'Ground ESP32 port closed');
        } else if (status === 'ERROR') {
          addLog('ERR', 'SERIAL', error || 'Serial communication error');
        }
      },
    });
  }, [baudRate, homePosition]);

  const handleConnectSerial = async () => {
    serialService.setBaudRate(baudRate);
    if (isSimulating) {
      simulatorService.stop();
      setIsSimulating(false);
    }
    await serialService.connect();
  };

  const handleDisconnectSerial = async () => {
    await serialService.disconnect();
  };

  const handleToggleSimulator = () => {
    if (isSimulating) {
      simulatorService.stop();
      setIsSimulating(false);
      addLog('INFO', 'SIM', 'Telemetry Simulator Stopped');
    } else {
      if (serialStatus === 'CONNECTED') {
        serialService.disconnect();
      }
      setIsSimulating(true);
      addLog('INFO', 'SIM', 'Telemetry Simulator Started (250ms cadence)');
      simulatorService.start((packet) => {
        handleIncomingPacket(packet);
      }, 250);
    }
  };

  const handleTriggerEStop = async () => {
    addLog('ERR', 'CMD', 'EMERGENCY STOP (E-STOP) BROADCAST SENT TO ESP32');
    if (serialStatus === 'CONNECTED') {
      await serialService.sendCommand('ESTOP');
    }
    if (telemetry) {
      setTelemetry({
        ...telemetry,
        bot_status: {
          ...telemetry.bot_status,
          state: 'EMERGENCY_STOP',
        },
      });
    }
  };

  const handleAddManualPoi = (newPoi: PointOfInterest) => {
    setPois((prev) => [...prev, newPoi]);
    addLog('INFO', 'POI', `Operator marked POI: ${newPoi.title} at [${newPoi.lat.toFixed(5)}, ${newPoi.lng.toFixed(5)}]`);
  };

  useEffect(() => {
    handleToggleSimulator();
    return () => {
      simulatorService.stop();
    };
  }, []);

  const curLat = telemetry?.gps.lat ?? 12.971598;
  const curLng = telemetry?.gps.lng ?? 77.594566;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#121214] text-[#f5f5f7] overflow-hidden select-none">
      <Header
        telemetry={telemetry}
        serialStatus={serialStatus}
        baudRate={baudRate}
        onBaudChange={setBaudRate}
        onConnectSerial={handleConnectSerial}
        onDisconnectSerial={handleDisconnectSerial}
        isSimulating={isSimulating}
        onToggleSimulator={handleToggleSimulator}
        onTriggerEStop={handleTriggerEStop}
        onOpenMarkPoi={() => setIsPoiModalOpen(true)}
      />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden">
        <section className="lg:col-span-7 flex flex-col gap-3 h-full overflow-hidden">
          <div className="flex-1 min-h-[320px] rounded-xl overflow-hidden relative shadow-2xl">
            <MapView
              gps={telemetry?.gps ?? null}
              pois={pois}
              homePosition={homePosition}
              lastPacketTime={lastPacketTime}
              onMarkPoiClick={() => setIsPoiModalOpen(true)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 shrink-0">
            <RadarCard radar={telemetry?.radar ?? null} />
            <EnvironmentalCard env={telemetry?.env ?? null} />
            <WirelessLinkCard link={telemetry?.link ?? null} seq={telemetry?.seq ?? 0} />
          </div>
        </section>

        <section className="lg:col-span-5 flex flex-col gap-2.5 h-full overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0">
            <BotStatusCard status={telemetry?.bot_status ?? null} />
            <PowerStatusCard power={telemetry?.power ?? null} />
          </div>

          <div className="shrink-0">
            <MotorMatrixCard motors={telemetry?.motors ?? null} />
          </div>

          <div className="flex-1 min-h-[160px] overflow-hidden">
            <LogTerminal logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </section>
      </main>

      <PoiModal
        isOpen={isPoiModalOpen}
        onClose={() => setIsPoiModalOpen(false)}
        currentLat={curLat}
        currentLng={curLng}
        onSavePoi={handleAddManualPoi}
      />
    </div>
  );
}

export default App;
