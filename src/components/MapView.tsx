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

const SCALE_BAR_WIDTH = 112;

class ArtemisScaleControl extends L.Control {
  private labelElement: HTMLSpanElement | null = null;
  private barElement: HTMLDivElement | null = null;
  private updateScale: (() => void) | null = null;

  onAdd(map: L.Map): HTMLElement {
    const container = L.DomUtil.create('div', 'artemis-scale-control');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', 'Map scale');
    const title = L.DomUtil.create('span', 'artemis-scale-title', container);
    title.textContent = 'Scale';

    const row = L.DomUtil.create('div', 'artemis-scale-row', container);
    const zeroLabel = L.DomUtil.create('span', 'artemis-scale-zero', row);
    zeroLabel.textContent = '0';
    this.barElement = L.DomUtil.create('div', 'artemis-scale-bar', row);
    this.labelElement = L.DomUtil.create('span', 'artemis-scale-label', row);

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    this.updateScale = () => {
      if (!this.barElement || !this.labelElement) return;

      const size = map.getSize();
      const y = size.y / 2;
      const start = map.containerPointToLatLng([0, y]);
      const end = map.containerPointToLatLng([SCALE_BAR_WIDTH, y]);
      const distance = map.distance(start, end);
      if (!Number.isFinite(distance) || distance <= 0) return;

      const magnitude = 10 ** Math.floor(Math.log10(distance));
      const normalizedDistance = distance / magnitude;
      const niceDistance = normalizedDistance >= 5
        ? 5 * magnitude
        : normalizedDistance >= 2
          ? 2 * magnitude
          : magnitude;

      const barWidth = Math.max(32, Math.round((niceDistance / distance) * SCALE_BAR_WIDTH));
      this.barElement.style.width = `${barWidth}px`;
      this.labelElement.textContent = niceDistance >= 1000
        ? `${niceDistance / 1000} km`
        : `${Math.round(niceDistance)} m`;
    };

    map.on('zoomend moveend resize', this.updateScale);
    map.whenReady(() => requestAnimationFrame(() => this.updateScale?.()));
    return container;
  }

  onRemove(map: L.Map): void {
    if (this.updateScale) {
      map.off('zoomend', this.updateScale);
      map.off('moveend', this.updateScale);
      map.off('resize', this.updateScale);
    }
    this.updateScale = null;
    this.labelElement = null;
    this.barElement = null;
  }
}

interface MapViewProps {
  gps: GpsData | null;
  pois: PointOfInterest[];
  homePosition: { lat: number; lng: number } | null;
  draftPosition: { lat: number; lng: number } | null;
  draftCategory: PointOfInterest['category'];
  isPoiMode: boolean;
  onDraftPositionChange: (position: { lat: number; lng: number }) => void;
  lastPacketTime: number | null;
  mapType?: MapType;
  followGps: boolean;
  lastKnownPosition?: { lat: number; lng: number } | null;
  isWarning?: boolean;
}

export interface MapViewHandle {
  recenterRobot: () => void;
  recenterHome: () => void;
  recenterLkl: () => void;
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
  isPoiMode,
  onDraftPositionChange,
  lastPacketTime,
  mapType = 'osm',
  followGps,
  lastKnownPosition,
  isWarning,
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
  const warningMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const initialLatRef = useRef((gps && gps.lat !== 0) ? gps.lat : 12.974842);
  const initialLngRef = useRef((gps && gps.lng !== 0) ? gps.lng : 79.165479);

  // The map container fills the whole viewport, but the persistent left
  // sidebar and the right sensor sheet cover parts of it. Leaflet centers on
  // the container center, which would place the target behind a pane. Compute
  // the pixel shift needed so a map center lands in the middle of the visible
  // (pane-free) map area instead.
  const getVisibleOffset = (): [number, number] => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const sheet = document.querySelector<HTMLElement>('.sheet.telemetry-sheet');
    const leftWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
    const rightWidth = sheet ? sheet.getBoundingClientRect().width : 0;
    // Visible area = [leftWidth, containerWidth - rightWidth]; its center is
    // shifted from the container center by (leftWidth - rightWidth) / 2.
    return [(leftWidth - rightWidth) / 2, 0];
  };

  // Pan to a latlng so it lands at the center of the visible map area (not the
  // full container, which is partly hidden behind panes).
  const panToVisible = (latlng: [number, number], options?: L.PanOptions) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.panTo(latlng, options);
    const [ox, oy] = getVisibleOffset();
    if (ox !== 0 || oy !== 0) map.panBy([ox, oy], { animate: false });
  };

  // setView equivalent that centers on the visible map area.
  const setViewVisible = (
    latlng: [number, number],
    zoom: number,
    options?: L.ZoomPanOptions,
  ) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView(latlng, zoom, options);
    const [ox, oy] = getVisibleOffset();
    if (ox !== 0 || oy !== 0) map.panBy([ox, oy], { animate: false });
  };

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

    new ArtemisScaleControl({ position: 'bottomright' }).addTo(map);

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

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleDoubleClick = (event: L.LeafletMouseEvent) => {
      if (isPoiMode) {
        onDraftPositionChange({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    };

    if (isPoiMode) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    map.on('dblclick', handleDoubleClick);
    return () => {
      map.off('dblclick', handleDoubleClick);
    };
  }, [isPoiMode, onDraftPositionChange]);

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
            <div style="font-family: BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
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

  useEffect(() => {
    if (!mapInstanceRef.current || !gps?.valid || !followGps) return;
    panToVisible([gps.lat, gps.lng], { animate: true, duration: 0.3 });
  }, [gps, followGps]);

  // Home marker
  useEffect(() => {
    if (!mapInstanceRef.current || !homePosition) return;

    const homeHtml = `
      <div style="position: relative; width: 30px; height: 30px;">
        <div style="width: 34px; height: 34px; background: rgba(10,132,255,0.3); border: 2px solid #0A84FF; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.35);">
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path d="M5 10.5 12 4l7 6.5v7a1 1 0 0 1-1 1h-3.5v-5h-5v5H6a1 1 0 0 1-1-1z" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `;

    const homeIcon = L.divIcon({
      html: homeHtml,
      className: 'custom-home-pin',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (!homeMarkerRef.current) {
      homeMarkerRef.current = L.marker([homePosition.lat, homePosition.lng], { icon: homeIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
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
    } else {
      draftMarkerRef.current.setLatLng([draftPosition.lat, draftPosition.lng]);
      draftMarkerRef.current.setIcon(draftIcon);
    }
  }, [draftPosition, draftCategory, onDraftPositionChange]);

  // Red warning sign marker and LKL uncertainty circle when in warning state (signal lost or GPS invalid)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (gps && gps.lat !== 0 && gps.lng !== 0) {
      initialLatRef.current = gps.lat;
      initialLngRef.current = gps.lng;
    }

    const fallbackLat = (lastKnownPosition && lastKnownPosition.lat !== 0)
      ? lastKnownPosition.lat
      : (initialLatRef.current !== 0 ? initialLatRef.current : 12.974842);
    const fallbackLng = (lastKnownPosition && lastKnownPosition.lng !== 0)
      ? lastKnownPosition.lng
      : (initialLngRef.current !== 0 ? initialLngRef.current : 79.165479);
    const targetLat = (lastKnownPosition && lastKnownPosition.lat !== 0)
      ? lastKnownPosition.lat
      : (gps && gps.lat !== 0 ? gps.lat : null) ?? (homePosition?.lat && homePosition.lat !== 0 ? homePosition.lat : null) ?? fallbackLat;
    const targetLng = (lastKnownPosition && lastKnownPosition.lng !== 0)
      ? lastKnownPosition.lng
      : (gps && gps.lng !== 0 ? gps.lng : null) ?? (homePosition?.lng && homePosition.lng !== 0 ? homePosition.lng : null) ?? fallbackLng;

    const now = Date.now();
    const isSignalLost = lastPacketTime !== null && now - lastPacketTime > 4000;
    const isGpsInvalid = !gps || !gps.valid;
    const showWarning = isWarning ?? (isSignalLost || isGpsInvalid);

    if (showWarning) {
      if (!lklCircleRef.current) {
        lklCircleRef.current = L.circle([targetLat, targetLng], {
          radius: 28,
          color: '#ff453a',
          fillColor: '#ff453a',
          fillOpacity: 0.18,
          weight: 2,
          dashArray: '4, 6',
        }).addTo(mapInstanceRef.current);
      } else {
        lklCircleRef.current.setLatLng([targetLat, targetLng]);
      }

      const warningHtml = `
        <div class="custom-warning-pin pulse-beacon" style="position: relative; width: 44px; height: 52px; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div style="width: 40px; height: 40px; background: #FF3B30; border: 2.5px solid #FFFFFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(255,59,48,0.55), 0 0 0 4px rgba(255,59,48,0.25);">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #FF3B30; margin-top: -1px;"></div>
          <div style="position: absolute; top: -14px; background: #FF3B30; color: #FFFFFF; font-family: system-ui, BlinkMacSystemFont, sans-serif; font-size: 9px; font-weight: 700; padding: 1px 7px; border-radius: 999px; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
            LAST KNOWN
          </div>
        </div>
      `;

      const warningIcon = L.divIcon({
        html: warningHtml,
        className: 'custom-warning-marker',
        iconSize: [44, 52],
        iconAnchor: [22, 48],
        popupAnchor: [0, -48],
      });

      const popupHtml = `
        <div style="font-family: system-ui, BlinkMacSystemFont, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 10px; min-width: 190px;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; color: #FF3B30;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            LAST KNOWN LOCATION
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            ${isSignalLost ? 'LoRa telemetry stream lost' : 'Awaiting GPS 3D satellite fix'}
          </div>
          <div style="font-size: 11px; color: #1d1d1f; margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f5f5f7; padding: 4px 6px; border-radius: 6px;">
            Lat: ${targetLat.toFixed(6)}°<br/>Lng: ${targetLng.toFixed(6)}°
          </div>
          ${lastPacketTime ? `<div style="font-size: 10px; color: #8e8e93; margin-top: 4px;">Last contact: ${new Date(lastPacketTime).toLocaleTimeString()}</div>` : '<div style="font-size: 10px; color: #8e8e93; margin-top: 4px;">Cached ground station coordinates</div>'}
        </div>
      `;

      if (!warningMarkerRef.current) {
        warningMarkerRef.current = L.marker([targetLat, targetLng], { icon: warningIcon, zIndexOffset: 950 })
          .addTo(mapInstanceRef.current)
          .bindPopup(popupHtml);
      } else {
        warningMarkerRef.current.setLatLng([targetLat, targetLng]);
        warningMarkerRef.current.setIcon(warningIcon);
        warningMarkerRef.current.setPopupContent(popupHtml);
      }
    } else {
      if (warningMarkerRef.current) {
        warningMarkerRef.current.remove();
        warningMarkerRef.current = null;
      }
      if (lklCircleRef.current) {
        lklCircleRef.current.remove();
        lklCircleRef.current = null;
      }
    }
  }, [gps, lastPacketTime, lastKnownPosition, isWarning, homePosition]);

  // POI markers — only shown while the Points of interest panel is open.
  // Reuse existing markers by id instead of clearing+recreating.
  useEffect(() => {
    if (!poiLayerGroupRef.current) return;

    // When the POI panel is closed or switched to another tab, remove all POI
    // markers from the map so they don't linger behind other views.
    if (!isPoiMode) {
      poiMarkerRef.current.forEach((marker) => {
        poiLayerGroupRef.current?.removeLayer(marker);
      });
      poiMarkerRef.current.clear();
      return;
    }

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
        <div style="font-family: BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif; background: #ffffff; color: #1d1d1f; border-radius: 12px; padding: 8px; min-width: 160px;">
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
  }, [pois, isPoiMode]);

  const recenterLkl = () => {
    if (!mapInstanceRef.current) return;
    if (gps && gps.lat !== 0 && gps.lng !== 0) {
      initialLatRef.current = gps.lat;
      initialLngRef.current = gps.lng;
    }

    const fallbackLat = (lastKnownPosition && lastKnownPosition.lat !== 0)
      ? lastKnownPosition.lat
      : (initialLatRef.current !== 0 ? initialLatRef.current : 12.974842);
    const fallbackLng = (lastKnownPosition && lastKnownPosition.lng !== 0)
      ? lastKnownPosition.lng
      : (initialLngRef.current !== 0 ? initialLngRef.current : 79.165479);
    const targetLat = (lastKnownPosition && lastKnownPosition.lat !== 0)
      ? lastKnownPosition.lat
      : (gps && gps.lat !== 0 ? gps.lat : null) ?? (homePosition?.lat && homePosition.lat !== 0 ? homePosition.lat : null) ?? fallbackLat;
    const targetLng = (lastKnownPosition && lastKnownPosition.lng !== 0)
      ? lastKnownPosition.lng
      : (gps && gps.lng !== 0 ? gps.lng : null) ?? (homePosition?.lng && homePosition.lng !== 0 ? homePosition.lng : null) ?? fallbackLng;
    setViewVisible([targetLat, targetLng], 18, { animate: true });
    warningMarkerRef.current?.openPopup();
    setTimeout(() => {
      warningMarkerRef.current?.openPopup();
    }, 250);
  };

  const recenterRobot = () => {
    if (mapInstanceRef.current && gps && gps.valid) {
      panToVisible([gps.lat, gps.lng], { animate: true });
    } else {
      recenterLkl();
    }
  };

  const recenterHome = () => {
    if (mapInstanceRef.current && homePosition) {
      setViewVisible([homePosition.lat, homePosition.lng], 18, { animate: true });
    }
  };

  const goToLocation = (lat: number, lng: number) => {
    setViewVisible(
      [lat, lng],
      Math.max(mapInstanceRef.current?.getZoom() ?? 18, 18),
      { animate: true },
    );
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
    recenterLkl,
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
