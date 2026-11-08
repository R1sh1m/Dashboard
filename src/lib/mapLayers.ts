import L from 'leaflet';

export type MapType = 'osm' | 'satellite' | 'terrain';

interface MapLayerPreset {
  label: string;
  url: string;
  maxZoom: number;
  attribution: string;
}

// Tile-layer cache keyed by MapType. Layers are created once and reused so
// switching basemaps is instant (tiles stay cached) and panning streams
// tiles efficiently.
const tileLayerCache: Partial<Record<MapType, L.TileLayer>> = {};

export function getTileLayer(mapType: MapType): L.TileLayer {
  let layer = tileLayerCache[mapType];
  if (!layer) {
    const preset = MAP_LAYERS[mapType];
    // Allow deep zoom by upsampling tiles beyond their native resolution.
    // maxNativeZoom = highest zoom where tiles actually exist.
    // maxZoom = how far the user can zoom (Leaflet will reuse & scale the highest-res tiles).
    const tileLayerOptions = {
      // Retina mode adds one to the requested tile zoom, which exceeds OSM's
      // native limit when the map is already at a deep zoom level.
      detectRetina: false,
      reuseTiles: true,
      updateWhenIdle: false, // Load tiles while panning so the map fills in as you move, not after you stop.
      updateWhenZooming: true,
      keepBuffer: 4,
      maxNativeZoom: preset.maxZoom,
      maxZoom: 22, // Allow deep zoom; Leaflet will upsample tiles beyond maxNativeZoom.
    };
    layer = L.tileLayer(preset.url, {
      attribution: preset.attribution,
      ...tileLayerOptions,
    });
    tileLayerCache[mapType] = layer;
  }
  return layer;
}

// Switchable basemap presets. Satellite/terrain options give higher
// data-quality imagery (inspired by Aleph's satellite/terrain captures).
// Note: Carto dark basemap removed (requires API key as of 2024).
export const MAP_LAYERS: Record<MapType, MapLayerPreset> = {
  osm: {
    label: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 23,
    attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: '© OpenTopoMap contributors',
  },
};

export const MAP_TYPE_ORDER: MapType[] = ['osm', 'satellite', 'terrain'];
