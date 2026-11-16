import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Layers, LocateFixed, Minus, MousePointer2, Navigation2, Plus, Menu, X } from 'lucide-react';
import { MapView, type MapViewHandle } from './components/MapView';
import { LeftSidebar } from './components/LeftSidebar';
import { PoiModal } from './components/PoiModal';
import { SensorSheet, type SubsystemTab } from './components/SensorSheet';
import type { GpsData, LogEntry, PointOfInterest, TelemetryPacket } from './types/telemetry';
import { telemetryClient } from './services/telemetryClient';
import type { SerialConnectionStatus } from './services/telemetryTransport';
import { poiDatabase } from './services/poiDatabase';
import { MAP_TYPE_ORDER, type MapType } from './lib/mapLayers';

// GPS move threshold in meters. Below this, the rover is treated as stationary (standby).
const GPS_MOVE_THRESHOLD_M = 0.5;

// Minimum distance (meters) between two auto-pins of the same category before
// a new one is accepted. Prevents map clustering when the rover is stationary
// or barely moving while a sensor trigger is sustained.
const POI_MIN_SPACING_M = 5;

// Haversine distance between two lat/lng points in meters.
const haversineDistanceM = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEstopActive, setIsEstopActive] = useState(false);
  // True when any modal overlay (telemetry sheet or POI drawer) is open.
  // Drives the dimmed .sheet-overlay behind them.
  const isSheetOverlayOpen = isSensorSheetOpen || isPoiModalOpen;
  const [isSendingRadarConfig, setIsSendingRadarConfig] = useState(false);
  // Radar configuration (LD2410B) — operator-tunable sensitivity, range, blind zone,
  // engineering mode. Sent to the rover via serial CMD_RADAR_* commands.
  const [radarSettings, setRadarSettings] = useState({
    mov_sens: 8,
    stat_sens: 8,
    range_gate: 8,
    blind_zone_cm: 0,
    eng_mode: true,
  });
  const [lastKnownPosition, setLastKnownPosition] = useState<{ lat: number; lng: number } | null>({ lat: 12.974842, lng: 79.165479 });
  const [activeNav, setActiveNav] = useState<'home' | 'saved' | 'telemetry' | 'estop'>('home');
  const [poiCycleIdx, setPoiCycleIdx] = useState(0);
  const [mapControlMode, setMapControlMode] = useState<'sensor' | 'manual'>(() => (
    typeof window !== 'undefined' && localStorage.getItem('artemis-map-control-mode') === 'manual' ? 'manual' : 'sensor'
  ));
  const autoPoiCooldownRef = useRef({ human: 0, environment: 0 });
  const lastRadarHistoryAt = useRef<number>(0);
  // Previous GPS position, touched only in GPS reception callbacks, used to
  // derive STANDBY vs WALKING solely from GPS sensor data (position changing).
  const prevGpsPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastTelemetryPacketAt = useRef<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);
  // useTransition defers non-critical UI updates (POI list, radar history,
  // environmental/motor/link cards) so the main thread stays responsive at
  // 10-20 Hz telemetry. Critical state (serial status, GPS position, E-STOP)
  // updates synchronously.
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Escape closes any open drawer/sheet/POI modal on all screen sizes.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
        setIsSensorSheetOpen(false);
        setIsPoiModalOpen(false);
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
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
    lastTelemetryPacketAt.current = Date.now();
    setTelemetry(packet);
    setGpsData(packet.gps);
    setLastPacketTime(Date.now());
    if (packet.gps.lat !== 0 && packet.gps.lng !== 0) {
      setLastKnownPosition({ lat: packet.gps.lat, lng: packet.gps.lng });
    }
    // Update movement state based on GPS position change.
    if (packet.gps.valid) {
      const prev = prevGpsPos.current;
      const moving = prev ? haversineDistanceM(prev.lat, prev.lng, packet.gps.lat, packet.gps.lng) > GPS_MOVE_THRESHOLD_M : false;
      setIsMoving(moving);
      prevGpsPos.current = { lat: packet.gps.lat, lng: packet.gps.lng };
    } else {
      prevGpsPos.current = null;
      setIsMoving(false);
    }
    setHomePosition((current) => {
      if (!current && packet.gps.valid) {
        addLog('INFO', 'GPS', `Home Base Origin latched at ${packet.gps.lat.toFixed(6)}, ${packet.gps.lng.toFixed(6)}`);
        return { lat: packet.gps.lat, lng: packet.gps.lng };
      }
      return current;
    });
    // Robust distance & energy resolution (firmware sends distance_cm/energy, full LD2410 sends mov/stat)
    const radarDist = packet.radar.distance_cm ??
      (packet.radar.mov_distance_cm || packet.radar.stat_distance_cm || 0);
    const radarEnergy = packet.radar.energy ??
      (packet.radar.mov_energy || packet.radar.stat_energy || 0);
    const isTargetDetected = packet.radar.human_detected ||
      packet.radar.target_state !== 'NO_TARGET' ||
      radarEnergy > 0;

    // Detection history: record detection events throttled to 800ms, independent of GPS
    const nowMs = Date.now();
    if (isTargetDetected && nowMs - lastRadarHistoryAt.current >= 800) {
      lastRadarHistoryAt.current = nowMs;
      startTransition(() => {
        setRadarHistory((current) => [
          ...current.slice(-19),
          {
            timestamp: nowMs,
            distance_cm: radarDist,
            energy: radarEnergy,
            target_state: packet.radar.target_state,
          },
        ]);
      });
    }

    // Auto-POI pinning: only if GPS fix is valid
    if (packet.radar.human_detected && packet.gps.valid) {
      const timestamp = Date.now();
      if (timestamp - autoPoiCooldownRef.current.human >= 15000) {
        const newLat = packet.gps.lat;
        const newLng = packet.gps.lng;
        startTransition(() => {
          setPois((current) => {
            // Spatial dedup: skip if another HUMAN_RADAR pin is within POI_MIN_SPACING_M
            const tooClose = current.some(
              (p) =>
                p.category === 'HUMAN_RADAR' &&
                haversineDistanceM(p.lat, p.lng, newLat, newLng) < POI_MIN_SPACING_M,
            );
            if (tooClose) return current;
            autoPoiCooldownRef.current.human = timestamp;
            const humanPoi: PointOfInterest = {
              id: `human_${timestamp}`,
              category: 'HUMAN_RADAR',
              lat: newLat,
              lng: newLng,
              title: 'Human Presence (LD2410B)',
              notes: `Target: ${packet.radar.target_state} | Dist: ${radarDist}cm | Energy: ${radarEnergy}%`,
              timestamp,
              meta: { distance_cm: radarDist, energy: radarEnergy },
            };
            void poiDatabase.save(humanPoi).catch((error: unknown) => {
              console.error('Failed to save radar point of interest.', error);
            });
            return [...current, humanPoi];
          });
        });
      }
    }
    if (packet.env.anomaly_flag && packet.gps.valid) {
      const timestamp = Date.now();
      if (timestamp - autoPoiCooldownRef.current.environment >= 20000) {
        const newLat = packet.gps.lat;
        const newLng = packet.gps.lng;
        startTransition(() => {
          setPois((current) => {
            // Spatial dedup: skip if another ENV_ANOMALY pin is within POI_MIN_SPACING_M
            const tooClose = current.some(
              (p) =>
                p.category === 'ENV_ANOMALY' &&
                haversineDistanceM(p.lat, p.lng, newLat, newLng) < POI_MIN_SPACING_M,
            );
            if (tooClose) return current;
            autoPoiCooldownRef.current.environment = timestamp;
            const environmentPoi: PointOfInterest = {
              id: `env_${timestamp}`,
              category: 'ENV_ANOMALY',
              lat: newLat,
              lng: newLng,
              title: 'Environmental Gas Spike',
              notes: `BME688 Gas: ${packet.env.gas_resistance_kohm} kΩ | IAQ: ${packet.env.iaq}`,
              timestamp,
              meta: { gas_kohm: packet.env.gas_resistance_kohm, iaq: packet.env.iaq },
            };
            void poiDatabase.save(environmentPoi).catch((error: unknown) => {
              console.error('Failed to save environmental point of interest.', error);
            });
            return [...current, environmentPoi];
          });
        });
      }
    }
  }, [addLog]);

  const handleIncomingGps = useCallback((gps: GpsData) => {
    /*
     * The ground bridge emits authoritative JSON telemetry. Raw NMEA may
     * arrive on a direct GPS connection too, but must not overwrite a newer
     * packet with partial fields such as sats=0 or hdop=99.
     */
    if (lastTelemetryPacketAt.current !== null && Date.now() - lastTelemetryPacketAt.current < 2000) {
      return;
    }
    setGpsData(gps);
    setTelemetry((current) => current ? { ...current, gps } : current);
    if (gps.lat !== 0 && gps.lng !== 0) {
      setLastKnownPosition({ lat: gps.lat, lng: gps.lng });
      setHomePosition((current) => current ?? { lat: gps.lat, lng: gps.lng });
    }
    // Update movement state based on position change.
    if (gps.valid) {
      const prev = prevGpsPos.current;
      const moving = prev ? haversineDistanceM(prev.lat, prev.lng, gps.lat, gps.lng) > GPS_MOVE_THRESHOLD_M : false;
      setIsMoving(moving);
      prevGpsPos.current = { lat: gps.lat, lng: gps.lng };
    } else {
      prevGpsPos.current = null;
      setIsMoving(false);
    }
  }, []);

  useEffect(() => {
    telemetryClient.setCallbacks({
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
    void telemetryClient.connect();
  }, [addLog, baudRate, handleIncomingGps, handleIncomingPacket]);

  const connectSerial = async () => { telemetryClient.setBaudRate(baudRate); await telemetryClient.connect(); };
  const disconnectSerial = async () => telemetryClient.disconnect();
  const triggerEStop = async () => {
    addLog('ERR', 'CMD', 'EMERGENCY STOP (E-STOP) BROADCAST SENT TO ESP32');
    let estopSent = false;
    if (serialStatus === 'CONNECTED') {
      estopSent = await telemetryClient.sendCommand('ESTOP');
    }
    // Sever the connection with the Ground ESP32 on e-stop only after
    // attempting to send the command. Honor the send result explicitly.
    await telemetryClient.disconnect();
    addLog(
      'WARN',
      'SERIAL',
      estopSent ? 'E-STOP command sent; connection severed' : 'E-STOP command FAILED to send; connection severed',
    );
    if (!estopSent) {
      addLog('ERR', 'CMD', 'E-STOP: no acknowledgment — verify rover state manually');
    }
    setIsEstopActive(true);
    setTelemetry((current) => current ? { ...current, bot_status: { ...current.bot_status, state: 'EMERGENCY_STOP' } } : current);
  };
  const handleSidebarEStop = () => {
    setIsSidebarOpen(false);
    setIsSensorSheetOpen(false);
    setIsPoiModalOpen(false);
    void triggerEStop();
  };

  // Closes every overlay (sidebar, telemetry sheet, POI modal) — used by
  // Escape and by tapping the sheet overlay backdrop.
  const handleOverlayClose = () => {
    setIsSidebarOpen(false);
    setIsSensorSheetOpen(false);
    setIsPoiModalOpen(false);
  };
  /** Send LD2410B radar configuration to the rover via serial -> LoRa PKT_CMD. */
  const sendRadarConfig = async () => {
    if (serialStatus !== 'CONNECTED') {
      addLog('WARN', 'SERIAL', 'Radar config: not connected to rover');
      return false;
    }
    setIsSendingRadarConfig(true);
    const ok1 = await telemetryClient.sendCommand(`RADAR_SENS ${radarSettings.mov_sens} ${radarSettings.stat_sens}`);
    await new Promise((r) => setTimeout(r, 120));
    const ok2 = await telemetryClient.sendCommand(`RADAR_RANGE ${radarSettings.range_gate}`);
    await new Promise((r) => setTimeout(r, 120));
    const ok3 = await telemetryClient.sendCommand(`RADAR_BLIND ${radarSettings.blind_zone_cm}`);
    await new Promise((r) => setTimeout(r, 120));
    const ok4 = await telemetryClient.sendCommand(`RADAR_ENG ${radarSettings.eng_mode ? 1 : 0}`);
    setIsSendingRadarConfig(false);
    addLog(
      'INFO',
      'RADAR',
      `Config sent: sens=${radarSettings.mov_sens}/${radarSettings.stat_sens} range=${radarSettings.range_gate}m blind=${radarSettings.blind_zone_cm}cm eng=${radarSettings.eng_mode}`,
    );
    return ok1 && ok2 && ok3 && ok4;
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

  const curLat = gpsData?.lat ?? 12.974842;
  const curLng = gpsData?.lng ?? 79.165479;
  const markedHome = pois.find((poi) => poi.category === 'BASE_HOME');
  const mapHomePosition = markedHome
    ? { lat: markedHome.lat, lng: markedHome.lng }
    : homePosition;

  const reportedState = telemetry?.bot_status.state ?? 'STANDBY';
  // STANDBY vs WALKING is determined solely by GPS sensor data; all other
  // states (HOMING, EXPLORING, CALIBRATING, EMERGENCY_STOP) come from telemetry.
  const gpsBasedState = isMoving ? 'WALKING' : 'STANDBY';
  const botState =
    reportedState === 'STANDBY' || reportedState === 'WALKING'
      ? gpsBasedState
      : reportedState;
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

  const handleLklClick = () => {
    setIsLklExpanded((prev) => !prev);
    mapRef.current?.recenterLkl();
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
          lastKnownPosition={lastKnownPosition}
          isWarning={signalLost || gpsInvalid}
        />
      </div>
      {/* Off-canvas sidebar toggle — mobile only (hidden on desktop via CSS) */}
      <button
        className="sidebar-hamburger"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        aria-label="Open sidebar"
        aria-expanded={isSidebarOpen}
      >
        {isSidebarOpen ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <Menu size={20} aria-hidden="true" />
        )}
      </button>
      <a className="skip-link" href="#map-main">Skip to map</a>
      <main id="map-main" className="maps-ui" aria-label="Artemis ground station map">
        {/* Collapsible Last Known Location button positioned above map controls */}
        {(signalLost || gpsInvalid) && (
          <button
            className={`lkl-btn ${isLklExpanded ? 'expanded' : 'collapsed'}`}
            onClick={handleLklClick}
            aria-expanded={isLklExpanded}
            aria-label={isLklExpanded ? 'Collapse last known location' : 'Last known location'}
          >
            <AlertTriangle className="lkl-icon" size={18} strokeWidth={2.5} aria-hidden="true" />
            <span className="lkl-label">
              {lastKnownPosition
                ? `Last known: ${lastKnownPosition.lat.toFixed(5)}°N, ${lastKnownPosition.lng.toFixed(5)}°E`
                : 'Last known location'}
              {lastPacketTime ? ` (${Math.round((now - lastPacketTime) / 1000)}s ago)` : ' · No signal'}
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
      {/* Persistent E-STOP banner — shown until operator manually resets */}
      {isEstopActive && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#ff453a]/90 border-b border-[#ff453a]/50 text-center p-4 text-white font-bold text-lg">
          E-STOP ACTIVE — Connection severed. Manually reset to restore control.
        </div>
      )}
      {/* Dimmed backdrop behind the telemetry sheet and POI modal on mobile */}
      {isSheetOverlayOpen && (
        <div
          className={`sheet-overlay ${isSheetOverlayOpen ? 'open' : ''}`}
          onClick={handleOverlayClose}
          aria-hidden="true"
        />
      )}
      <LeftSidebar
        botState={botState}
        isEStop={isEStop}
        serialStatus={serialStatus}
        loraRssi={telemetry?.link?.rssi_dbm}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
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
        onConnectSerial={connectSerial}
        onDisconnectSerial={disconnectSerial}
      />
      <SensorSheet
        isOpen={isSensorSheetOpen}
        onClose={() => setIsSensorSheetOpen(false)}
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
        radarSettings={radarSettings}
        onRadarSettingsChange={(s) => setRadarSettings(s)}
        onSendRadarConfig={sendRadarConfig}
        isSendingRadarConfig={isSendingRadarConfig}
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
