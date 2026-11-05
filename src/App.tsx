import { useState, useEffect, useCallback, useRef } from 'react';
import { MapView, type MapViewHandle } from './components/MapView';
import { LeftSidebar } from './components/LeftSidebar';
import { Header } from './components/Header';
import { SensorSheet } from './components/SensorSheet';
import { PoiModal } from './components/PoiModal';
import type { TelemetryPacket, PointOfInterest, LogEntry } from './types/telemetry';
import { serialService, type SerialConnectionStatus } from './services/webSerial';
import { simulatorService } from './services/simulator';
import {
  AlertTriangle,
  Activity,
  Bookmark,
  Car,
  ChevronRight,
  Compass,
  LocateFixed,
  MapPinned,
  Menu,
  Plus,
  Minus,
  Crosshair,
  Navigation2,
  Layers,
  Radio,
  Route,
  Search,
  Settings2,
} from 'lucide-react';
import { MAP_TYPE_ORDER, type MapType } from './lib/mapLayers';


type SubsystemTab = 'bot' | 'power' | 'motors' | 'env' | 'radar' | 'link' | 'logs';

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

  const [activeTab, setActiveTab] = useState<SubsystemTab>('bot');
  const [isSensorSheetOpen, setIsSensorSheetOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [now, setNow] = useState<number>(0);

  // Persisted map type (dark → satellite → osm → terrain)
  const [mapType, setMapType] = useState<MapType>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('artemis-map-type');
    return (stored === 'dark' || !stored ? 'osm' : stored) as MapType;
  });

  const mapRef = useRef<MapViewHandle>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const addLog = useCallback((level: 'INFO' | 'WARN' | 'ERR' | 'RAW', subsystem: string, message: string) => {
    setLogs((prev) => {
      const entry: LogEntry = {
        id: `log_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
        level,
        subsystem,
        message,
      };
      return [...prev.slice(-999), entry];
    });
  }, []);

  const handleIncomingPacket = useCallback((packet: TelemetryPacket) => {
    setTelemetry(packet);
    setLastPacketTime(Date.now());

    setHomePosition((currentHomePosition) => {
      if (!currentHomePosition && packet.gps.valid && packet.gps.lat && packet.gps.lng) {
        addLog('INFO', 'GPS', `Home Base Origin latched at ${packet.gps.lat.toFixed(6)}, ${packet.gps.lng.toFixed(6)}`);
        return { lat: packet.gps.lat, lng: packet.gps.lng };
      }
      return currentHomePosition;
    });

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
                gas_kohm: packet.radar.energy,
                iaq: packet.env.iaq,
              },
            },
          ];
        }
        return prev;
      });
    }
  }, [addLog]);

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
  }, [baudRate, addLog, handleIncomingPacket]);

  const handleIncomingPacketRef = useRef(handleIncomingPacket);
  useEffect(() => {
    handleIncomingPacketRef.current = handleIncomingPacket;
  });

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

  // Auto-start simulator for immediate out-of-the-box usability
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSimulating(true);
      addLog('INFO', 'SIM', 'Telemetry Simulator Started (250ms cadence)');
      simulatorService.start((packet) => {
        handleIncomingPacket(packet);
      }, 250);
    }, 0);

    return () => {
      clearTimeout(timer);
      simulatorService.stop();
    };
  }, [addLog, handleIncomingPacket]);

  const curLat = telemetry?.gps.lat ?? 12.971598;
  const curLng = telemetry?.gps.lng ?? 77.594566;

  const botState = telemetry?.bot_status.state ?? 'STANDBY';
  const isEStop = botState === 'EMERGENCY_STOP';
  const gpsStatus = telemetry?.gps.valid ? 'Live GPS' : 'Last known';
  const mapLabel = mapType === 'osm' ? 'Explore' : mapType.charAt(0).toUpperCase() + mapType.slice(1);

  return (
    <div className="maps-shell relative w-screen h-screen overflow-hidden bg-[#0a0a0c] text-[#f5f5f7] select-none font-sans">
      {/* 1. Full-Screen Edge-to-Edge Map (dark tiles, sits behind chrome) */}
      <div className="map-full">
        <MapView
          ref={mapRef}
          gps={telemetry?.gps ?? null}
          pois={pois}
          homePosition={homePosition}
          lastPacketTime={lastPacketTime}
          mapType={mapType}
        />
      </div>

      <a className="skip-link" href="#map-main">Skip to map</a>
      <main id="map-main" className="maps-ui" aria-label="Artemis ground station map">
        <header className="maps-topbar">
          <div className="brand-lockup">
            <button className="icon-button mobile-menu" aria-label="Open navigation"><Menu size={18} /></button>
            <img src="/assets/artemis-logo.png" alt="Artemis" />
            <div><strong>Artemis</strong><span>Ground Station</span></div>
          </div>
          <nav className="maps-nav" aria-label="Primary">
            <button className="nav-link active">Explore</button>
            <button className="nav-link" onClick={() => setIsSensorSheetOpen(true)}>Telemetry</button>
            <button className="nav-link" onClick={() => setIsPoiModalOpen(true)}>Mark POI</button>
          </nav>
          <div className="top-status">
            <span className={`status-dot ${isEStop ? 'critical' : ''}`} />
            <span>{isEStop ? 'Emergency stop' : isSimulating ? 'Simulation live' : serialStatus.toLowerCase()}</span>
            <button className="icon-button" onClick={() => setIsSensorSheetOpen(true)} aria-label="Open ground station controls"><Settings2 size={17} /></button>
          </div>
        </header>

        <section className="explore-sheet" aria-label="Map search and places">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Search ground station map" placeholder="Search Artemis map" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            {searchQuery && <button className="clear-search" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>}
            <button className="voice-button" aria-label="Search by voice"><Radio size={16} /></button>
          </div>
          <div className="category-row" role="list" aria-label="Map categories">
            {[
              ['All', Compass],
              ['POIs', MapPinned],
              ['Telemetry', Activity],
              ['Route', Route],
              ['Saved', Bookmark],
            ].map(([label, Icon]) => (
              <button key={label as string} className={`category-pill ${activeCategory === label ? 'selected' : ''}`} onClick={() => setActiveCategory(label as string)} role="listitem">
                <Icon size={16} /><span>{label as string}</span>
              </button>
            ))}
          </div>
          <div className="places-content">
            {searchQuery ? (
              <div className="empty-search"><Search size={20} /><strong>Search around Artemis</strong><span>Inspect nearby telemetry and marked points on the map.</span></div>
            ) : (
              <>
                <div className="sheet-heading">
                  <div><span className="eyebrow">Live map</span><h1>{activeCategory === 'All' ? 'Explore Artemis' : activeCategory}</h1></div>
                  <button className="text-button" onClick={() => setIsSensorSheetOpen(true)}>View all <ChevronRight size={14} /></button>
                </div>
                <div className="place-list">
                  <button className="place-card selected-place" onClick={() => mapRef.current?.recenterRobot()}>
                    <span className="place-icon blue"><LocateFixed size={18} /></span>
                    <span className="place-copy"><strong>Artemis Hexapod</strong><small>{gpsStatus} · {curLat.toFixed(5)}, {curLng.toFixed(5)}</small></span>
                    <span className="place-meta">{telemetry?.gps.speed_mps?.toFixed(1) ?? '0.0'} m/s</span>
                  </button>
                  <button className="place-card" onClick={() => mapRef.current?.recenterHome()}>
                    <span className="place-icon green"><MapPinned size={18} /></span>
                    <span className="place-copy"><strong>Home Base Station</strong><small>LoRa link base · {homePosition ? 'Origin latched' : 'Waiting for GPS'}</small></span>
                    <ChevronRight size={17} className="place-arrow" />
                  </button>
                  <button className="place-card" onClick={() => setIsSensorSheetOpen(true)}>
                    <span className="place-icon orange"><Activity size={18} /></span>
                    <span className="place-copy"><strong>System telemetry</strong><small>{telemetry ? 'All sensor streams available' : 'Waiting for telemetry'}</small></span>
                    <ChevronRight size={17} className="place-arrow" />
                  </button>
                </div>
                <div className="quick-actions">
                  <button onClick={() => setIsSensorSheetOpen(true)}><Car size={16} /> Directions</button>
                  <button onClick={() => setIsPoiModalOpen(true)}><Bookmark size={16} /> Save location</button>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="map-controls" aria-label="Map controls">
          <button className="map-control" onClick={() => setMapType((prev) => { const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(prev) + 1) % MAP_TYPE_ORDER.length]; localStorage.setItem('artemis-map-type', next); return next; })} aria-label={`Change map style, currently ${mapLabel}`}><Layers size={18} /></button>
          <button className="map-control" onClick={() => mapRef.current?.recenterRobot()} aria-label="Center on rover"><Crosshair size={18} /></button>
          <button className="map-control" onClick={() => mapRef.current?.recenterHome()} aria-label="Center on home base"><Navigation2 size={18} /></button>
        </div>
        <div className="zoom-controls" aria-label="Zoom controls">
          <button className="map-control" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
          <button className="map-control" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
        </div>
      </main>

      <div className="coordinate-pill" aria-live="polite">
        <span className="status-dot" />
        <strong>{gpsStatus}</strong>
        <span>{curLat.toFixed(5)}, {curLng.toFixed(5)}</span>
      </div>
      <div className="telemetry-glance" aria-label="Telemetry summary">
        <div><span>Battery</span><strong>{telemetry?.power.percent ?? '--'}%</strong></div>
        <div><span>Mode</span><strong>{botState.replace('_', ' ')}</strong></div>
        <div><span>Map</span><strong>{mapLabel}</strong></div>
      </div>

      {/* 2. Persistent left sidebar (Apple Maps style) — logo + state + link */}
      <LeftSidebar
        botState={botState}
        isEStop={isEStop}
        serialStatus={serialStatus}
        onOpenSensors={() => setIsSensorSheetOpen(true)}
      />

      {/* 3. Slim dark top header — search pill + actions */}
      <Header
        onOpenMarkPoi={() => setIsPoiModalOpen(true)}
        onToggleLayer={() => {
          setMapType((prev) => {
            const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(prev) + 1) % MAP_TYPE_ORDER.length];
            localStorage.setItem('artemis-map-type', next);
            return next;
          });
        }}
      />

      {/* 4. Bottom-right floating cluster (zoom / recenter / layer) */}
      <div className="legacy-map-controls absolute bottom-4 right-4 z-50 pointer-events-auto flex flex-col gap-2">
        <div className="flex flex-col rounded-xl bg-white/10 border border-white/20 overflow-hidden shadow-lg backdrop-blur-md">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="w-10 h-10 flex items-center justify-center text-neutral-200 border-b border-white/20 hover:bg-white/10 active:scale-95 transition-all"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="w-10 h-10 flex items-center justify-center text-neutral-200 hover:bg-white/10 active:scale-95 transition-all"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => mapRef.current?.recenterRobot()}
          className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#2997ff] hover:bg-white/10 active:scale-95 transition-all shadow-sm"
          title="Recenter to Robot"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapRef.current?.recenterHome()}
          className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#30d158] hover:bg-white/10 active:scale-95 transition-all shadow-sm"
          title="Recenter to Home Base"
        >
          <Navigation2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setMapType((prev) => {
              const next = MAP_TYPE_ORDER[(MAP_TYPE_ORDER.indexOf(prev) + 1) % MAP_TYPE_ORDER.length];
              localStorage.setItem('artemis-map-type', next);
              return next;
            });
          }}
          className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-neutral-200 hover:bg-white/10 active:scale-95 transition-all shadow-sm"
          title={`Map layer: ${mapType.charAt(0).toUpperCase() + mapType.slice(1)}`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* 5. Bottom-center GPS pill */}
      <div className="legacy-gps absolute bottom-4 left-[280px] z-50 pointer-events-auto">
        <div className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-[12px] font-mono text-neutral-200 shadow-lg flex items-center gap-4">
          <span>LAT: <strong className="text-[#30d158]">{curLat.toFixed(6)}</strong></span>
          <span>LNG: <strong className="text-[#30d158]">{curLng.toFixed(6)}</strong></span>
        </div>
      </div>

      {/* 6. Last Known Location (LKL) banner */}
      {(() => {
        const isSignalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
        const isGpsInvalid = !telemetry?.gps?.valid;
        if (!isSignalLost && !isGpsInvalid) return null;
        return (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-60 pointer-events-auto px-4 py-2 rounded-full bg-[#ff453a]/95 text-white text-[12px] font-medium flex items-center gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-md border border-white/20 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-white" />
            <span>LAST KNOWN LOCATION (LKL) LATCHED</span>
            <span className="text-[11px] opacity-90 font-mono">
              {lastPacketTime ? `${Math.round((now - lastPacketTime) / 1000)}s since contact` : 'NO SIGNAL'}
            </span>
          </div>
        );
      })()}

      {/* 7. Right-side sensor sheet (frosted glass, opens like Apple Maps info panel) */}
      <SensorSheet
        isOpen={isSensorSheetOpen}
        onClose={() => setIsSensorSheetOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        telemetry={telemetry}
        logs={logs}
        serialStatus={serialStatus}
        baudRate={baudRate}
        isSimulating={isSimulating}
        setBaudRate={setBaudRate}
        onConnectSerial={handleConnectSerial}
        onDisconnectSerial={handleDisconnectSerial}
        onToggleSimulator={handleToggleSimulator}
        onTriggerEStop={handleTriggerEStop}
      />

      {/* POI Marker Modal */}
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
