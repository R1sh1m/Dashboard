import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { GpsData, PointOfInterest } from '../types/telemetry';

// Fix for default marker icons in bundled environments
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

import { getTileLayer, type MapType } from '../lib/mapLayers';

interface MapViewProps {
  gps: GpsData | null;
  pois: PointOfInterest[];
  homePosition: { lat: number; lng: number } | null;
  draftPosition: { lat: number; lng: number } | null;
  draftCategory: PointOfInterest['category'];
  onDraftPositionChange: (position: { lat: number; lng: number }) => void;
  lastPacketTime: number | null;
  mapType?: MapType;
}

export interface MapViewHandle {
  recenterRobot: () => void;
  recenterHome: () => void;
  goToLocation: (lat: number, lng: number) => void;
  resetZoom: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(({
  gps,
  pois,
  homePosition,
  draftPosition,
  draftCategory,
  onDraftPositionChange,
  lastPacketTime,
  mapType = 'osm',
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const robotMarkerRef = useRef<L.Marker | null>(null);
  const robotIconRef = useRef<L.DivIcon | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const pathLineRef = useRef<L.Polyline | null>(null);
  const homeBearingLineRef = useRef<L.Polyline | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const poiMarkerRef = useRef<Map<string, L.Marker>>(new Map());
  const draftMarkerRef = useRef<L.Marker | null>(null);
  const lklCircleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const initialLatRef = useRef(gps?.lat ?? 12.971598);
  const initialLngRef = useRef(gps?.lng ?? 77.594566);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [initialLatRef.current, initialLngRef.current],
      zoom: 18,
      maxZoom: 22, // Deep zoom allowed; tiles are upscaled beyond native resolution.
      zoomControl: false,
      attributionControl: false,
    });

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(mapContainerRef.current);

    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);

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
      ro.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Swap the basemap tile layer when mapType changes, preserving the current
  // center/zoom so the map does not reset. Layers are created once and cached
  // (see getTileLayer), so switching is instant and tiles stay cached.
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const next = getTileLayer(mapType);

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }
    next.addTo(mapInstanceRef.current);
    tileLayerRef.current = next;
  }, [mapType]);

  // Robot marker + breadcrumb path
  useEffect(() => {
    if (!mapInstanceRef.current || !gps || !gps.valid) return;

    const latLng: [number, number] = [gps.lat, gps.lng];

    if (pathLineRef.current) {
      pathLineRef.current.addLatLng(latLng);
      const latlngs = pathLineRef.current.getLatLngs();
      if (latlngs.length > 500) {
        pathLineRef.current.setLatLngs(latlngs.slice(-500));
      }
    }

    const heading = gps.heading_deg ?? 0;
    const lastHeading = lastHeadingRef.current ?? null;
    const headingChanged = lastHeading === null || Math.abs(heading - lastHeading) > 1.5;

    // Rebuild divIcon HTML + icon only when heading changes meaningfully or on first creation
    if (headingChanged || !robotIconRef.current) {
      const robotHtml = `
        <div style="position: relative; transform: rotate(${heading}deg); transition: transform 0.2s ease-out; width: 34px; height: 34px;">
          <div style="width: 34px; height: 34px; background: rgba(0,122,255,0.16); border: 1px solid rgba(0,122,255,0.4); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 10px; height: 10px; background: #0A84FF; border-radius: 50%;"></div>
          </div>
          <div style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 7px solid #0A84FF;"></div>
        </div>
      `;

      const robotIcon = L.divIcon({
        html: robotHtml,
        className: 'custom-robot-pin',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      robotIconRef.current = robotIcon;

      if (!robotMarkerRef.current) {
        robotMarkerRef.current = L.marker(latLng, { icon: robotIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
              <div style="font-weight: 600; font-size: 13px;">Artemis Hexapod</div>
              <div style="font-size: 11px; color: #666; margin-top: 2px;">Lat: ${gps.lat.toFixed(6)}<br/>Lng: ${gps.lng.toFixed(6)}</div>
              <div style="font-size: 11px; color: #0A84FF; margin-top: 4px;">Speed: ${gps.speed_mps} m/s | Alt: ${gps.alt_m}m</div>
            </div>
          `);
      } else {
        robotMarkerRef.current.setLatLng(latLng);
        robotMarkerRef.current.setIcon(robotIcon);
      }
    } else {
      // Heading unchanged: only update position, do NOT rebuild icon or call setIcon
      if (robotMarkerRef.current) {
        robotMarkerRef.current.setLatLng(latLng);
      }
    }

    lastHeadingRef.current = heading;

    if (homePosition && homeBearingLineRef.current) {
      homeBearingLineRef.current.setLatLngs([latLng, [homePosition.lat, homePosition.lng]]);
    }
  }, [gps, homePosition]);

  // Home marker
  useEffect(() => {
    if (!mapInstanceRef.current || !homePosition) return;

    const homeHtml = `
      <div style="position: relative; width: 30px; height: 30px;">
        <div style="width: 30px; height: 30px; background: rgba(52,199,89,0.16); border: 1px solid rgba(52,199,89,0.4); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path d="M5 10.5 12 4l7 6.5v7a1 1 0 0 1-1 1h-3.5v-5h-5v5H6a1 1 0 0 1-1-1z" fill="none" stroke="#34C759" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `;

    const homeIcon = L.divIcon({
      html: homeHtml,
      className: 'custom-home-pin',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    if (!homeMarkerRef.current) {
      homeMarkerRef.current = L.marker([homePosition.lat, homePosition.lng], { icon: homeIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
            <div style="font-weight: 600; font-size: 13px;">Home Base Station</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Origin Point &amp; LoRa Link Base</div>
          </div>
        `);
    } else {
      homeMarkerRef.current.setLatLng([homePosition.lat, homePosition.lng]);
    }
  }, [homePosition]);

  // Temporary draggable marker used to confirm a new POI location.
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (!draftPosition) {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }

    const draftColor = draftCategory === 'HUMAN_RADAR'
      ? '#FF3B30'
      : draftCategory === 'ENV_ANOMALY'
        ? '#FFCC00'
        : draftCategory === 'BASE_HOME'
          ? '#0A84FF'
          : '#30D158';
    const houseIcon = draftCategory === 'BASE_HOME'
      ? '<path d="M5 10.5 12 4l7 6.5v7a1 1 0 0 1-1 1h-3.5v-5h-5v5H6a1 1 0 0 1-1-1z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>'
      : '<circle cx="12" cy="12" r="3.5" fill="#fff"/>';
    const draftIcon = L.divIcon({
      html: `<div class="draft-poi-pin" style="--draft-poi-color:${draftColor}"><span class="draft-poi-pin-head"><svg viewBox="0 0 24 24" aria-hidden="true">${houseIcon}</svg></span><span class="draft-poi-pin-tip"></span></div>`,
      className: 'draft-poi-marker',
      iconSize: [42, 52],
      iconAnchor: [21, 46],
    });

    if (!draftMarkerRef.current) {
      draftMarkerRef.current = L.marker([draftPosition.lat, draftPosition.lng], {
        icon: draftIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(mapInstanceRef.current);
      draftMarkerRef.current.on('dragend', () => {
        const position = draftMarkerRef.current?.getLatLng();
        if (position) onDraftPositionChange({ lat: position.lat, lng: position.lng });
      });
      mapInstanceRef.current.panTo([draftPosition.lat, draftPosition.lng], { animate: false });
      mapInstanceRef.current.panBy([-240, 0], { animate: false });
    } else {
      draftMarkerRef.current.setLatLng([draftPosition.lat, draftPosition.lng]);
      draftMarkerRef.current.setIcon(draftIcon);
    }
  }, [draftPosition, draftCategory, onDraftPositionChange]);

  // LKL circle (map layer); HTML banner lives in App
  useEffect(() => {
    if (!mapInstanceRef.current || !gps) return;

    const now = Date.now();
    const isSignalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
    const isGpsInvalid = !gps.valid;
    const isLklActive = isSignalLost || isGpsInvalid;

    if (isLklActive) {
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
  }, [gps, lastPacketTime]);

  // POI markers — reuse existing markers by id instead of clearing+recreating
  useEffect(() => {
    if (!poiLayerGroupRef.current) return;

    const visiblePois = pois.filter((poi) => poi.category !== 'BASE_HOME');
    const currentIds = new Set(visiblePois.map((poi) => poi.id));

    // Remove markers whose poi id is no longer present
    poiMarkerRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        poiLayerGroupRef.current?.removeLayer(marker);
        poiMarkerRef.current.delete(id);
      }
    });

    visiblePois.forEach((poi) => {
      let pinColor = '#34C759';
      let label = 'MARK';

      if (poi.category === 'HUMAN_RADAR') {
        pinColor = '#FF3B30';
        label = 'HUMAN';
      } else if (poi.category === 'ENV_ANOMALY') {
        pinColor = '#FFCC00';
        label = 'ENV';
      } else if (poi.category === 'BASE_HOME') {
        pinColor = '#0A84FF';
        label = 'HOME';
      }

      const existing = poiMarkerRef.current.get(poi.id);

      if (existing) {
        // Reuse marker: only update position
        existing.setLatLng([poi.lat, poi.lng]);
        return;
      }

      const poiCenter = poi.category === 'BASE_HOME'
        ? '<path d="M5 10.5 12 4l7 6.5v7a1 1 0 0 1-1 1h-3.5v-5h-5v5H6a1 1 0 0 1-1-1z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>'
        : '<circle cx="12" cy="12" r="4" fill="#000000"/>';
      const poiHtml = `
        <div style="position: relative; width: 30px; height: 40px;">
          <div style="position: absolute; top: 7px; left: 2px; width: 26px; height: 26px; background: ${pinColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${poiCenter}</svg>
          </div>
          <div style="position: absolute; top: -11px; left: 50%; transform: translateX(-50%); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 9px; font-weight: 700; color: #ffffff; background: ${pinColor}; padding: 1px 6px; border-radius: 6px; white-space: nowrap; line-height: 1;">
            ${label}
          </div>
        </div>
      `;

      const poiIcon = L.divIcon({
        html: poiHtml,
        className: 'custom-poi-pin',
        iconSize: [30, 40],
        iconAnchor: [15, 20],
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: poiIcon });
      marker.bindPopup(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
          <div style="font-weight: 600; font-size: 13px; color: ${pinColor};">${poi.title}</div>
          <div style="font-size: 11px; color: #666; margin-top: 2px;">${poi.notes || 'Identified by Artemis telemetry'}</div>
          ${poi.meta?.distance_cm ? `<div style="font-size: 10px; color: #777; margin-top: 4px;">Radar Dist: ${poi.meta.distance_cm} cm | Energy: ${poi.meta.energy}%</div>` : ''}
          ${poi.meta?.iaq ? `<div style="font-size: 10px; color: #777; margin-top: 4px;">IAQ: ${poi.meta.iaq} | Gas: ${poi.meta.gas_kohm} kΩ</div>` : ''}
          <div style="font-size: 9px; color: #999; margin-top: 4px;">${new Date(poi.timestamp).toLocaleTimeString()}</div>
        </div>
      `);

      poiLayerGroupRef.current?.addLayer(marker);
      poiMarkerRef.current.set(poi.id, marker);
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

  const goToLocation = (lat: number, lng: number) => {
    mapInstanceRef.current?.setView([lat, lng], Math.max(mapInstanceRef.current.getZoom(), 18), { animate: true });
  };

  const zoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const zoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const resetZoom = () => {
    mapInstanceRef.current?.setZoom(18);
  };

  useImperativeHandle(ref, () => ({
    recenterRobot,
    recenterHome,
    goToLocation,
    resetZoom,
    zoomIn,
    zoomOut,
  }));

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
});

MapView.displayName = 'MapView';
