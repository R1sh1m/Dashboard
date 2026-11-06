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
  const [draftPoiPosition, setDraftPoiPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [draftPoiCategory, setDraftPoiCategory] = useState<PointOfInterest['category']>('MANUAL_MARK');
  const [homePosition, setHomePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [radarHistory, setRadarHistory] = useState<Array<{
    timestamp: number;
    distance_cm: number;
    energy: number;
    target_state: string;
  }>>([]);
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
  const [activeNav, setActiveNav] = useState<'home' | 'saved' | 'telemetry' | 'estop'>('home');
  const [poiCycleIdx, setPoiCycleIdx] = useState(0);
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
      setRadarHistory((current) => [
        ...current.slice(-19),
        {
          timestamp: Date.now(),
          distance_cm: packet.radar.distance_cm,
          energy: packet.radar.energy,
          target_state: packet.radar.target_state,
        },
      ]);
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
  const handleSidebarEStop = () => {
    setIsSensorSheetOpen(false);
    setIsPoiModalOpen(false);
    void triggerEStop();
  };
  const addManualPoi = (poi: PointOfInterest) => {
    setPois((current) => [
      ...current.filter((currentPoi) => poi.category !== 'BASE_HOME' || currentPoi.category !== 'BASE_HOME'),
      poi,
    ]);
    setDraftPoiPosition(null);
    addLog('INFO', 'POI', `Operator marked POI: ${poi.title} at [${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}]`);
  };
  const deletePoi = (poiId: string) => {
    setPois((current) => current.filter((poi) => poi.id !== poiId));
  };

  const curLat = telemetry?.gps.lat ?? 12.971598;
  const curLng = telemetry?.gps.lng ?? 77.594566;
  const markedHome = pois.find((poi) => poi.category === 'BASE_HOME');
  const mapHomePosition = markedHome
    ? { lat: markedHome.lat, lng: markedHome.lng }
    : homePosition;

  // Reset POI cycle index when the set of points changes
  useEffect(() => {
    setPoiCycleIdx(0);
  }, [pois, mapHomePosition]);

  const botState = telemetry?.bot_status.state ?? 'STANDBY';
  const isEStop = botState === 'EMERGENCY_STOP';
  const signalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
  const gpsInvalid = !telemetry?.gps?.valid;
  const cycleMapType = () => setMapType((current) => {
    const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(current) + 1) % MAP_TYPE_ORDER.length];
    localStorage.setItem('artemis-map-type', next);
    return next;
  });

  const handleCycleNav = () => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (mapHomePosition) points.push(mapHomePosition);
    pois.forEach((p) => points.push({ lat: p.lat, lng: p.lng }));
    if (points.length === 0) return;
    const nextIdx = (poiCycleIdx + 1) % points.length;
    const pt = points[nextIdx];
    mapRef.current?.goToLocation(pt.lat, pt.lng);
    setPoiCycleIdx(nextIdx);
  };

  const handleHome = () => {
    setIsSensorSheetOpen(false);
    setIsPoiModalOpen(false);
    setIsLklExpanded(false);
    setActiveTab('bot');
    mapRef.current?.recenterHome();
  };

  const openTelemetryPanel = (tab: SubsystemTab) => {
    setIsPoiModalOpen(false);
    setActiveTab(tab);
    setVisibleTabs(tab === 'bot' || tab === 'power' || tab === 'motors'
      ? ['bot', 'power', 'motors']
      : tab === 'env' || tab === 'link'
        ? ['env', 'link']
        : [tab]);
    setIsSensorSheetOpen(true);
  };

  return (
    <div className={`maps-shell ${isSensorSheetOpen ? 'sensor-open' : ''} ${isPoiModalOpen ? 'poi-mode' : ''} relative w-screen h-screen overflow-hidden bg-[#0a0a0c] text-[#f5f5f7] select-none font-sans`}>
      <div className="map-full">
        <MapView
          ref={mapRef}
          gps={telemetry?.gps ?? null}
          pois={pois}
          homePosition={mapHomePosition}
          draftPosition={draftPoiPosition}
          draftCategory={draftPoiCategory}
          isPoiMode={isPoiModalOpen}
          onDraftPositionChange={setDraftPoiPosition}
          lastPacketTime={lastPacketTime}
          mapType={mapType}
        />
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
          <button className="map-control" onClick={handleCycleNav} aria-label="Cycle through marked points"><Navigation2 size={18} /></button>
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
        loraRssi={telemetry?.link?.rssi_dbm}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onOpenSensors={() => {
          setIsPoiModalOpen(false);
          setVisibleTabs(['bot', 'power', 'motors']);
          setActiveTab('bot');
          setIsSensorSheetOpen((prev) => !prev);
        }}
        onOpenPanel={openTelemetryPanel}
        onTriggerEStop={handleSidebarEStop}
        onHome={handleHome}
        onSavePoi={() => {
          setDraftPoiPosition({ lat: curLat, lng: curLng });
          setDraftPoiCategory('MANUAL_MARK');
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
        radarHistory={radarHistory}
        serialStatus={serialStatus}
        baudRate={baudRate}
        setBaudRate={setBaudRate}
        onConnectSerial={connectSerial}
        onDisconnectSerial={disconnectSerial}
        onClearLogs={() => setLogs([])}
        visibleTabs={visibleTabs}
      />
      <PoiModal
        isOpen={isPoiModalOpen}
        onClose={() => {
          setDraftPoiPosition(null);
          setIsPoiModalOpen(false);
        }}
        currentLat={draftPoiPosition?.lat ?? curLat}
        currentLng={draftPoiPosition?.lng ?? curLng}
        onSavePoi={addManualPoi}
        onDeletePoi={deletePoi}
        pois={pois}
        onSelectPoi={(poi) => mapRef.current?.goToLocation(poi.lat, poi.lng)}
        onCategoryChange={setDraftPoiCategory}
      />
    </div>
  );
}

export default App;
