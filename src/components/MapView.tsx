import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { GpsData, PointOfInterest } from '../types/telemetry';
import { Compass, AlertTriangle, MapPin, Navigation2 } from 'lucide-react';

interface MapViewProps {
  gps: GpsData | null;
  pois: PointOfInterest[];
  homePosition: { lat: number; lng: number } | null;
  lastPacketTime: number | null;
  onMarkPoiClick: () => void;
}

export const MapView: React.FC<MapViewProps> = ({
  gps,
  pois,
  homePosition,
  lastPacketTime,
  onMarkPoiClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const robotMarkerRef = useRef<L.Marker | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const pathLineRef = useRef<L.Polyline | null>(null);
  const homeBearingLineRef = useRef<L.Polyline | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const lklCircleRef = useRef<L.Circle | null>(null);

  const [distanceToHome, setDistanceToHome] = useState<number | null>(null);
  const [bearingToHome, setBearingToHome] = useState<number | null>(null);

  const isSignalLost = lastPacketTime !== null && Date.now() - lastPacketTime > 4000;
  const isGpsInvalid = !gps || !gps.valid;
  const isLklActive = isSignalLost || isGpsInvalid;

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = gps?.lat ?? 12.971598;
    const initialLng = gps?.lng ?? 77.594566;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    const darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
    });

    darkTileLayer.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const pathLine = L.polyline([], {
      color: '#2997ff',
      weight: 3,
      opacity: 0.85,
      dashArray: '4, 6',
    }).addTo(map);

    const bearingLine = L.polyline([], {
      color: '#30d158',
      weight: 2,
      opacity: 0.6,
      dashArray: '5, 8',
    }).addTo(map);

    const poiGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    pathLineRef.current = pathLine;
    homeBearingLineRef.current = bearingLine;
    poiLayerGroupRef.current = poiGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const calculateDistanceAndBearing = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    const brng = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

    return { distance: Math.round(dist), bearing: Math.round(brng) };
  };

  useEffect(() => {
    if (!mapInstanceRef.current || !gps || !gps.valid) return;

    const latLng: [number, number] = [gps.lat, gps.lng];

    if (pathLineRef.current) {
      pathLineRef.current.addLatLng(latLng);
    }

    const heading = gps.heading_deg ?? 0;
    const robotHtml = `
      <div style="transform: rotate(${heading}deg); transition: transform 0.2s ease-out;" class="relative flex items-center justify-center">
        <div class="w-8 h-8 rounded-full bg-[#0066cc]/30 border-2 border-[#2997ff] flex items-center justify-center shadow-lg shadow-[#0066cc]/50">
          <div class="w-3 h-3 bg-[#2997ff] rounded-full"></div>
        </div>
        <div class="absolute -top-1.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-[#2997ff]"></div>
      </div>
    `;

    const robotIcon = L.divIcon({
      html: robotHtml,
      className: 'custom-robot-pin',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (!robotMarkerRef.current) {
      robotMarkerRef.current = L.marker(latLng, { icon: robotIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: -apple-system, sans-serif; padding: 4px;">
            <div style="font-weight: 600; font-size: 13px; color: #1d1d1f;">Artemis Hexapod</div>
            <div style="font-size: 11px; color: #666;">Lat: ${gps.lat.toFixed(6)}<br/>Lng: ${gps.lng.toFixed(6)}</div>
            <div style="font-size: 11px; color: #0066cc; margin-top: 4px;">Speed: ${gps.speed_mps} m/s | Alt: ${gps.alt_m}m</div>
          </div>
        `);
    } else {
      robotMarkerRef.current.setLatLng(latLng);
      robotMarkerRef.current.setIcon(robotIcon);
    }

    if (homePosition) {
      const { distance, bearing } = calculateDistanceAndBearing(
        gps.lat,
        gps.lng,
        homePosition.lat,
        homePosition.lng
      );
      setDistanceToHome(distance);
      setBearingToHome(bearing);

      if (homeBearingLineRef.current) {
        homeBearingLineRef.current.setLatLngs([latLng, [homePosition.lat, homePosition.lng]]);
      }
    }
  }, [gps, homePosition]);

  useEffect(() => {
    if (!mapInstanceRef.current || !homePosition) return;

    const homeHtml = `
      <div class="flex items-center justify-center">
        <div class="w-7 h-7 rounded-full bg-[#1d7f4e]/30 border-2 border-[#30d158] flex items-center justify-center shadow-lg shadow-[#30d158]/40">
          <div class="w-2.5 h-2.5 bg-[#30d158] rounded-sm"></div>
        </div>
      </div>
    `;

    const homeIcon = L.divIcon({
      html: homeHtml,
      className: 'custom-home-pin',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    if (!homeMarkerRef.current) {
      homeMarkerRef.current = L.marker([homePosition.lat, homePosition.lng], { icon: homeIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: -apple-system, sans-serif; padding: 4px;">
            <div style="font-weight: 600; font-size: 13px; color: #1d1d1f;">Home Base Station</div>
            <div style="font-size: 11px; color: #666;">Origin Point & LoRa Link Base</div>
          </div>
        `);
    } else {
      homeMarkerRef.current.setLatLng([homePosition.lat, homePosition.lng]);
    }
  }, [homePosition]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (isLklActive && gps) {
      if (!lklCircleRef.current) {
        lklCircleRef.current = L.circle([gps.lat, gps.lng], {
          radius: 12,
          color: '#ff453a',
          fillColor: '#ff453a',
          fillOpacity: 0.25,
          weight: 2,
          dashArray: '3, 6',
        }).addTo(mapInstanceRef.current);
      } else {
        lklCircleRef.current.setLatLng([gps.lat, gps.lng]);
      }
    } else {
      if (lklCircleRef.current) {
        lklCircleRef.current.remove();
        lklCircleRef.current = null;
      }
    }
  }, [isLklActive, gps]);

  useEffect(() => {
    if (!poiLayerGroupRef.current) return;
    poiLayerGroupRef.current.clearLayers();

    pois.forEach((poi) => {
      let pinColor = '#30d158';
      let borderColor = '#1d7f4e';
      let label = 'POI';

      if (poi.category === 'HUMAN_RADAR') {
        pinColor = '#ff453a';
        borderColor = '#a1252b';
        label = 'HUMAN';
      } else if (poi.category === 'ENV_ANOMALY') {
        pinColor = '#ffd60a';
        borderColor = '#b25e00';
        label = 'ENV';
      }

      const poiHtml = `
        <div class="relative flex flex-col items-center group cursor-pointer">
          <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-md" style="background-color: ${pinColor}; border: 2px solid ${borderColor};">
            <div class="w-1.5 h-1.5 bg-black rounded-full"></div>
          </div>
          <div class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold mt-1 text-black shadow-sm" style="background-color: ${pinColor};">
            ${label}
          </div>
        </div>
      `;

      const poiIcon = L.divIcon({
        html: poiHtml,
        className: 'custom-poi-pin',
        iconSize: [30, 42],
        iconAnchor: [15, 20],
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: poiIcon });
      marker.bindPopup(`
        <div style="font-family: -apple-system, sans-serif; padding: 6px; min-width: 140px;">
          <div style="font-weight: 600; font-size: 13px; color: ${pinColor === '#ffd60a' ? '#8a6100' : pinColor};">
            ${poi.title}
          </div>
          <div style="font-size: 11px; color: #444; margin-top: 2px;">
            ${poi.notes || 'Identified by Artemis telemetry'}
          </div>
          ${poi.meta?.distance_cm ? `<div style="font-size: 10px; color: #777; margin-top: 4px;">Radar Dist: ${poi.meta.distance_cm} cm | Energy: ${poi.meta.energy}%</div>` : ''}
          ${poi.meta?.iaq ? `<div style="font-size: 10px; color: #777; margin-top: 4px;">IAQ: ${poi.meta.iaq} | Gas: ${poi.meta.gas_kohm} kΩ</div>` : ''}
          <div style="font-size: 9px; color: #999; margin-top: 4px;">${new Date(poi.timestamp).toLocaleTimeString()}</div>
        </div>
      `);

      poiLayerGroupRef.current?.addLayer(marker);
    });
  }, [pois]);

  const recenterRobot = () => {
    if (mapInstanceRef.current && gps && gps.valid) {
      mapInstanceRef.current.panTo([gps.lat, gps.lng], { animate: true });
    }
  };

  const recenterHome = () => {
    if (mapInstanceRef.current && homePosition) {
      mapInstanceRef.current.panTo([homePosition.lat, homePosition.lng], { animate: true });
    }
  };

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 glass-panel">
      <div ref={mapContainerRef} className="w-full h-full" />

      {isLklActive && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 rounded-full bg-[#ff453a]/90 text-white text-[12px] font-medium flex items-center gap-2 shadow-xl backdrop-blur-md border border-white/20 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-white" />
          <span>LAST KNOWN LOCATION (LKL) LATCHED</span>
          <span className="text-[11px] opacity-80 font-mono">
            {lastPacketTime ? `${Math.round((Date.now() - lastPacketTime) / 1000)}s since contact` : 'NO SIGNAL'}
          </span>
        </div>
      )}

      {homePosition && (
        <div className="absolute top-3 left-3 z-[1000] glass-panel p-2.5 text-[11px] flex flex-col gap-1 shadow-lg pointer-events-auto">
          <div className="flex items-center justify-between gap-4 text-neutral-300">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Navigation2 className="w-3.5 h-3.5 text-[#30d158]" />
              HOMING BASE
            </span>
            <span className="font-mono text-[#30d158] font-bold">
              {distanceToHome !== null ? `${distanceToHome}m` : '--'}
            </span>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
            <span>BEARING:</span>
            <span>{bearingToHome !== null ? `${bearingToHome}°` : '--'}</span>
          </div>
        </div>
      )}

      <div className="absolute top-3 right-3 z-[1000] glass-panel px-3 py-2 text-[10px] flex flex-col gap-1.5 shadow-lg">
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">POIs</span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff453a] shadow-sm shadow-red-500/50" />
          <span className="text-neutral-200">Human (mmWave)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffd60a] shadow-sm shadow-yellow-500/50" />
          <span className="text-neutral-200">Environmental (Gas)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#30d158] shadow-sm shadow-green-500/50" />
          <span className="text-neutral-200">Manual Marker</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        <div className="glass-panel px-3 py-1.5 text-[11px] font-mono text-neutral-300 flex items-center gap-3">
          <span>LAT: {gps ? gps.lat.toFixed(6) : '--'}</span>
          <span>LNG: {gps ? gps.lng.toFixed(6) : '--'}</span>
          <span>SATS: {gps?.sats ?? 0}</span>
          <span>ALT: {gps?.alt_m ? `${gps.alt_m}m` : '--'}</span>
        </div>

        <button
          onClick={recenterRobot}
          className="glass-panel px-2.5 py-1.5 hover:bg-white/10 text-white text-[11px] flex items-center gap-1.5 transition-colors"
          title="Recenter view on Artemis Robot"
        >
          <Compass className="w-3.5 h-3.5 text-[#2997ff]" />
          <span>Follow Bot</span>
        </button>

        <button
          onClick={recenterHome}
          className="glass-panel px-2.5 py-1.5 hover:bg-white/10 text-white text-[11px] flex items-center gap-1.5 transition-colors"
          title="Recenter view on Home Station"
        >
          <MapPin className="w-3.5 h-3.5 text-[#30d158]" />
          <span>Home</span>
        </button>

        <button
          onClick={onMarkPoiClick}
          className="btn-apple-primary text-[11px] py-1 px-3"
          title="Mark Current GPS location as Point of Interest"
        >
          <MapPin className="w-3 h-3" />
          <span>Mark POI</span>
        </button>
      </div>
    </div>
  );
};
