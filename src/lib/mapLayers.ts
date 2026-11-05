export type MapType = 'osm' | 'satellite' | 'terrain';

interface MapLayerPreset {
  label: string;
  url: string;
  maxZoom: number;
  attribution: string;
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
