import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Layers, Minus, Navigation2, Plus, WifiOff } from 'lucide-react';
import { MapView, type MapViewHandle } from './components/MapView';
import { LeftSidebar } from './components/LeftSidebar';
import { PoiModal } from './components/PoiModal';
import { SensorSheet, type SubsystemTab } from './components/SensorSheet';
import type { LogEntry, PointOfInterest, TelemetryPacket } from './types/telemetry';
import { serialService, type SerialConnectionStatus } from './services/webSerial';
import { MAP_TYPE_ORDER, type MapType } from './lib/mapLayers';

export function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [serialStatus, setSerialStatus] = useState<SerialConnectionStatus>('DISCONNECTED');
  const [baudRate, setBaudRate] = useState(115200);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);
  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [homePosition, setHomePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPoiModalOpen, setIsPoiModalOpen] = useState(false);
  const [isSensorSheetOpen, setIsSensorSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SubsystemTab>('bot');
  const [visibleTabs, setVisibleTabs] = useState<SubsystemTab[]>(['bot', 'power', 'motors']);
  const [now, setNow] = useState(() => Date.now());
  const [mapType, setMapType] = useState<MapType>(() => {
    if (typeof window === 'undefined') return 'osm';
    const stored = localStorage.getItem('artemis-map-type');
    return stored === 'satellite' || stored === 'terrain' || stored === 'osm' ? stored : 'osm';
  });
  const [isLklExpanded, setIsLklExpanded] = useState(false);
  const [activeNav, setActiveNav] = useState<'home' | 'saved' | 'telemetry'>('home');
  const mapRef = useRef<MapViewHandle>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const addLog = useCallback((level: LogEntry['level'], subsystem: string, message: string) => {
    setLogs((current) => [...current.slice(-999), {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      level,
      subsystem,
      message,
    }]);
  }, []);

  const handleIncomingPacket = useCallback((packet: TelemetryPacket) => {
    setTelemetry(packet);
    setLastPacketTime(Date.now());
    setHomePosition((current) => {
      if (!current && packet.gps.valid) {
        addLog('INFO', 'GPS', `Home Base Origin latched at ${packet.gps.lat.toFixed(6)}, ${packet.gps.lng.toFixed(6)}`);
        return { lat: packet.gps.lat, lng: packet.gps.lng };
      }
      return current;
    });
    if (packet.radar.human_detected && packet.gps.valid) {
      setPois((current) => current.some((poi) => poi.category === 'HUMAN_RADAR' && Date.now() - poi.timestamp < 15000)
        ? current
        : [...current, {
          id: `human_${Date.now()}`, category: 'HUMAN_RADAR', lat: packet.gps.lat, lng: packet.gps.lng,
          title: 'Human Presence (LD2410B)',
          notes: `Target: ${packet.radar.target_state} | Dist: ${packet.radar.distance_cm}cm | Energy: ${packet.radar.energy}%`,
          timestamp: Date.now(), meta: { distance_cm: packet.radar.distance_cm, energy: packet.radar.energy },
        }]);
    }
    if (packet.env.anomaly_flag && packet.gps.valid) {
      setPois((current) => current.some((poi) => poi.category === 'ENV_ANOMALY' && Date.now() - poi.timestamp < 20000)
        ? current
        : [...current, {
          id: `env_${Date.now()}`, category: 'ENV_ANOMALY', lat: packet.gps.lat, lng: packet.gps.lng,
          title: 'Environmental Gas Spike',
          notes: `BME688 Gas: ${packet.env.gas_resistance_kohm} kΩ | IAQ: ${packet.env.iaq}`,
          timestamp: Date.now(), meta: { gas_kohm: packet.env.gas_resistance_kohm, iaq: packet.env.iaq },
        }]);
    }
  }, [addLog]);

  useEffect(() => {
    serialService.setCallbacks({
      onPacket: handleIncomingPacket,
      onRawLine: (line) => { if (!line.startsWith('{')) addLog('RAW', 'SERIAL', line); },
      onStatusChange: (status, error) => {
        setSerialStatus(status);
        if (status === 'CONNECTED') addLog('INFO', 'SERIAL', `Connected to Ground ESP32 at ${baudRate} Baud`);
        if (status === 'DISCONNECTED') addLog('WARN', 'SERIAL', 'Ground ESP32 port closed');
        if (status === 'ERROR') addLog('ERR', 'SERIAL', error || 'Serial communication error');
      },
    });
  }, [addLog, baudRate, handleIncomingPacket]);

  const connectSerial = async () => { serialService.setBaudRate(baudRate); await serialService.connect(); };
  const disconnectSerial = async () => serialService.disconnect();
  const triggerEStop = async () => {
    addLog('ERR', 'CMD', 'EMERGENCY STOP (E-STOP) BROADCAST SENT TO ESP32');
    if (serialStatus === 'CONNECTED') await serialService.sendCommand('ESTOP');
    setTelemetry((current) => current ? { ...current, bot_status: { ...current.bot_status, state: 'EMERGENCY_STOP' } } : current);
  };
  const addManualPoi = (poi: PointOfInterest) => {
    setPois((current) => [...current, poi]);
    addLog('INFO', 'POI', `Operator marked POI: ${poi.title} at [${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}]`);
  };

  const curLat = telemetry?.gps.lat ?? 12.971598;
  const curLng = telemetry?.gps.lng ?? 77.594566;
  const botState = telemetry?.bot_status.state ?? 'STANDBY';
  const isEStop = botState === 'EMERGENCY_STOP';
  const signalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
  const gpsInvalid = !telemetry?.gps?.valid;
  const cycleMapType = () => setMapType((current) => {
    const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(current) + 1) % MAP_TYPE_ORDER.length];
    localStorage.setItem('artemis-map-type', next);
    return next;
  });

  const handleHome = () => {
    setIsSensorSheetOpen(false);
    setIsPoiModalOpen(false);
    setIsLklExpanded(false);
    setActiveTab('bot');
    mapRef.current?.recenterHome();
    mapRef.current?.resetZoom();
  };

  const openTelemetryPanel = (tab: SubsystemTab) => {
    setIsPoiModalOpen(false);
    setActiveTab(tab);
    setVisibleTabs(tab === 'bot' || tab === 'power' || tab === 'motors'
      ? ['bot', 'power', 'motors']
      : [tab]);
    setIsSensorSheetOpen(true);
  };

  return (
    <div className={`maps-shell ${isSensorSheetOpen ? 'sensor-open' : ''} relative w-screen h-screen overflow-hidden bg-[#0a0a0c] text-[#f5f5f7] select-none font-sans`}>
      <div className="map-full">
        <MapView ref={mapRef} gps={telemetry?.gps ?? null} pois={pois} homePosition={homePosition} lastPacketTime={lastPacketTime} mapType={mapType} />
      </div>
      <a className="skip-link" href="#map-main">Skip to map</a>
      <main id="map-main" className="maps-ui" aria-label="Artemis ground station map">
        {/* Collapsible Last Known Location button positioned above map controls */}
        {(signalLost || gpsInvalid) && (
          <button
            className={`lkl-btn ${isLklExpanded ? 'expanded' : 'collapsed'}`}
            onClick={() => setIsLklExpanded((prev) => !prev)}
            aria-expanded={isLklExpanded}
            aria-label={isLklExpanded ? 'Collapse last known location' : 'Last known location'}
          >
            {isLklExpanded ? (
              <AlertTriangle className="lkl-icon" size={18} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <WifiOff className="lkl-icon" size={18} strokeWidth={2.5} aria-hidden="true" />
            )}
            <span className="lkl-label">
              Last known location
              {lastPacketTime ? ` · ${Math.round((now - lastPacketTime) / 1000)}s since contact` : ' · No signal'}
            </span>
          </button>
        )}
        <div className="map-controls" aria-label="Map controls">
          <button className="map-control" onClick={cycleMapType} aria-label="Change map style"><Layers size={18} /></button>
          <button className="map-control" onClick={() => mapRef.current?.recenterHome()} aria-label="Center on home base"><Navigation2 size={18} /></button>
        </div>
        <div className="zoom-controls" aria-label="Zoom controls">
          <button className="map-control" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
          <button className="map-control" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
        </div>
      </main>
      <LeftSidebar
        botState={botState}
        isEStop={isEStop}
        serialStatus={serialStatus}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onOpenSensors={() => {
          setIsPoiModalOpen(false);
          setVisibleTabs(['bot', 'power', 'motors']);
          setActiveTab('bot');
          setIsSensorSheetOpen((prev) => !prev);
        }}
        onOpenPanel={openTelemetryPanel}
        onHome={handleHome}
        onSavePoi={() => {
          setIsSensorSheetOpen(false);
          setIsPoiModalOpen((prev) => !prev);
        }}
      />
      <SensorSheet
        isOpen={isSensorSheetOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        telemetry={telemetry}
        logs={logs}
        serialStatus={serialStatus}
        baudRate={baudRate}
        setBaudRate={setBaudRate}
        onConnectSerial={connectSerial}
        onDisconnectSerial={disconnectSerial}
        onTriggerEStop={triggerEStop}
        visibleTabs={visibleTabs}
      />
      <PoiModal
        isOpen={isPoiModalOpen}
        onClose={() => setIsPoiModalOpen(false)}
        currentLat={curLat}
        currentLng={curLng}
        onSavePoi={addManualPoi}
        pois={pois}
        onSelectPoi={(poi) => mapRef.current?.goToLocation(poi.lat, poi.lng)}
      />
    </div>
  );
}

export default App;
