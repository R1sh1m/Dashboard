import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Layers, LocateFixed, Minus, MousePointer2, Navigation2, Plus, WifiOff } from 'lucide-react';
import { MapView, type MapViewHandle } from './components/MapView';
import { LeftSidebar } from './components/LeftSidebar';
import { PoiModal } from './components/PoiModal';
import { SensorSheet, type SubsystemTab } from './components/SensorSheet';
import type { GpsData, LogEntry, PointOfInterest, TelemetryPacket } from './types/telemetry';
import { serialService, type SerialConnectionStatus } from './services/webSerial';
import { poiDatabase } from './services/poiDatabase';
import { MAP_TYPE_ORDER, type MapType } from './lib/mapLayers';

export function App() {
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [gpsData, setGpsData] = useState<GpsData | null>(null);
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
  const [mapControlMode, setMapControlMode] = useState<'sensor' | 'manual'>(() => (
    typeof window !== 'undefined' && localStorage.getItem('artemis-map-control-mode') === 'manual' ? 'manual' : 'sensor'
  ));
  const autoPoiCooldownRef = useRef({ human: 0, environment: 0 });
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

  useEffect(() => {
    void poiDatabase.load()
      .then(setPois)
      .catch((error: unknown) => {
        console.error('Failed to load saved points of interest.', error);
        addLog('ERR', 'POI', 'Saved points of interest could not be loaded');
      });
  }, [addLog]);

  const handleIncomingPacket = useCallback((packet: TelemetryPacket) => {
    setTelemetry(packet);
    setGpsData(packet.gps);
    setLastPacketTime(Date.now());
    setHomePosition((current) => {
      if (!current && packet.gps.valid) {
        addLog('INFO', 'GPS', `Home Base Origin latched at ${packet.gps.lat.toFixed(6)}, ${packet.gps.lng.toFixed(6)}`);
        return { lat: packet.gps.lat, lng: packet.gps.lng };
      }
      return current;
    });
    if (packet.radar.human_detected && packet.gps.valid) {
      const timestamp = Date.now();
      if (timestamp - autoPoiCooldownRef.current.human >= 15000) {
        autoPoiCooldownRef.current.human = timestamp;
        setRadarHistory((current) => [
          ...current.slice(-19),
          {
            timestamp,
            distance_cm: packet.radar.distance_cm,
            energy: packet.radar.energy,
            target_state: packet.radar.target_state,
          },
        ]);
        const humanPoi: PointOfInterest = {
          id: `human_${timestamp}`, category: 'HUMAN_RADAR', lat: packet.gps.lat, lng: packet.gps.lng,
          title: 'Human Presence (LD2410B)',
          notes: `Target: ${packet.radar.target_state} | Dist: ${packet.radar.distance_cm}cm | Energy: ${packet.radar.energy}%`,
          timestamp, meta: { distance_cm: packet.radar.distance_cm, energy: packet.radar.energy },
        };
        setPois((current) => [...current, humanPoi]);
        void poiDatabase.save(humanPoi).catch((error: unknown) => {
          console.error('Failed to save radar point of interest.', error);
        });
      }
    }
    if (packet.env.anomaly_flag && packet.gps.valid) {
      const timestamp = Date.now();
      if (timestamp - autoPoiCooldownRef.current.environment >= 20000) {
        autoPoiCooldownRef.current.environment = timestamp;
        const environmentPoi: PointOfInterest = {
          id: `env_${timestamp}`, category: 'ENV_ANOMALY', lat: packet.gps.lat, lng: packet.gps.lng,
          title: 'Environmental Gas Spike',
          notes: `BME688 Gas: ${packet.env.gas_resistance_kohm} kΩ | IAQ: ${packet.env.iaq}`,
          timestamp, meta: { gas_kohm: packet.env.gas_resistance_kohm, iaq: packet.env.iaq },
        };
        setPois((current) => [...current, environmentPoi]);
        void poiDatabase.save(environmentPoi).catch((error: unknown) => {
          console.error('Failed to save environmental point of interest.', error);
        });
      }
    }
  }, [addLog]);

  const handleIncomingGps = useCallback((gps: GpsData) => {
    setGpsData(gps);
    setTelemetry((current) => current ? { ...current, gps } : current);
    if (gps.valid) {
      setHomePosition((current) => current ?? { lat: gps.lat, lng: gps.lng });
    }
  }, []);

  useEffect(() => {
    serialService.setCallbacks({
      onPacket: handleIncomingPacket,
      onGps: handleIncomingGps,
      onRawLine: (line) => { if (!line.startsWith('{')) addLog('RAW', 'SERIAL', line); },
      onStatusChange: (status, error) => {
        setSerialStatus(status);
        if (status === 'CONNECTED') addLog('INFO', 'SERIAL', `Connected to Ground ESP32 at ${baudRate} Baud`);
        if (status === 'DISCONNECTED') addLog('WARN', 'SERIAL', 'Ground ESP32 port closed');
        if (status === 'ERROR') addLog('ERR', 'SERIAL', error || 'Serial communication error');
      },
    });
  }, [addLog, baudRate, handleIncomingGps, handleIncomingPacket]);

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
    void poiDatabase.save(poi).catch((error: unknown) => {
      console.error('Failed to save point of interest.', error);
      addLog('ERR', 'POI', `Could not persist POI: ${poi.title}`);
    });
    setDraftPoiPosition(null);
    addLog('INFO', 'POI', `Operator marked POI: ${poi.title} at [${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}]`);
  };
  const deletePoi = (poiId: string) => {
    setPois((current) => current.filter((poi) => poi.id !== poiId));
    void poiDatabase.delete(poiId).catch((error: unknown) => {
      console.error('Failed to delete point of interest.', error);
      addLog('ERR', 'POI', `Could not delete POI: ${poiId}`);
    });
  };

  const curLat = gpsData?.lat ?? 12.971598;
  const curLng = gpsData?.lng ?? 77.594566;
  const markedHome = pois.find((poi) => poi.category === 'BASE_HOME');
  const mapHomePosition = markedHome
    ? { lat: markedHome.lat, lng: markedHome.lng }
    : homePosition;

  const botState = telemetry?.bot_status.state ?? 'STANDBY';
  const isEStop = botState === 'EMERGENCY_STOP';
  const signalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
  const gpsInvalid = !gpsData?.valid;
  const changeMapControlMode = (mode: 'sensor' | 'manual') => {
    localStorage.setItem('artemis-map-control-mode', mode);
    setMapControlMode(mode);
  };
  const cycleMapType = () => setMapType((current) => {
    const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(current) + 1) % MAP_TYPE_ORDER.length];
    localStorage.setItem('artemis-map-type', next);
    return next;
  });

  const handleCycleNav = () => {
    const points: Array<{ lat: number; lng: number }> = [];
    // Add the auto-latched home origin only if it isn't already represented
    // by a saved BASE_HOME point in the POI list.
    const hasHomePoi = pois.some((p) => p.category === 'BASE_HOME');
    if (!hasHomePoi && mapHomePosition) points.push(mapHomePosition);
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
      : tab === 'env' || tab === 'link' || tab === 'gps'
        ? ['env', 'link', 'gps']
        : [tab]);
    setIsSensorSheetOpen(true);
  };

  return (
    <div className={`maps-shell ${isSensorSheetOpen ? 'sensor-open' : ''} ${isPoiModalOpen ? 'poi-mode' : ''} relative w-screen h-screen overflow-hidden bg-[#0a0a0c] text-[#f5f5f7] select-none font-sans`}>
      <div className="map-full">
        <MapView
          ref={mapRef}
          gps={gpsData}
          pois={pois}
          homePosition={mapHomePosition}
          draftPosition={draftPoiPosition}
          draftCategory={draftPoiCategory}
          isPoiMode={isPoiModalOpen}
          onDraftPositionChange={setDraftPoiPosition}
          lastPacketTime={lastPacketTime}
          mapType={mapType}
          followGps={mapControlMode === 'sensor'}
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
          <button
            className={`map-control ${mapControlMode === 'sensor' ? 'is-active' : ''}`}
            onClick={() => changeMapControlMode(mapControlMode === 'sensor' ? 'manual' : 'sensor')}
            aria-label={mapControlMode === 'sensor' ? 'Switch to manual map movement' : 'Follow NEO-M8 GPS position'}
            aria-pressed={mapControlMode === 'sensor'}
            title={mapControlMode === 'sensor' ? 'GPS follow enabled' : 'Manual map movement'}
          >
            {mapControlMode === 'sensor' ? <LocateFixed size={18} /> : <MousePointer2 size={18} />}
          </button>
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
        gps={gpsData}
        mapControlMode={mapControlMode}
        onMapControlModeChange={changeMapControlMode}
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
