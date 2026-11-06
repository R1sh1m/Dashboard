import { vi } from 'vitest';

// Mock leaflet to avoid DOM/canvas dependencies in jsdom
vi.mock('leaflet', () => {
  const map = {
    panTo: vi.fn(),
    setZoom: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
    addTo: vi.fn(),
    getLatLngs: vi.fn(() => []),
    setLatLngs: vi.fn(),
    bindPopup: vi.fn(() => 'popup'),
    setLatLng: vi.fn(),
    setIcon: vi.fn(),
    closePopup: vi.fn(),
    getBounds: vi.fn(() => ({ getCenter: vi.fn(() => [0, 0]) })),
  };

  const marker = {
    bindPopup: vi.fn(() => marker),
    addTo: vi.fn(() => marker),
    setLatLng: vi.fn(() => marker),
    setIcon: vi.fn(() => marker),
    closePopup: vi.fn(),
    openPopup: vi.fn(() => marker),
    remove: vi.fn(),
  };

  const polyline = {
    addLatLng: vi.fn(() => polyline),
    getLatLngs: vi.fn(() => []),
    setLatLngs: vi.fn(() => polyline),
    addTo: vi.fn(() => polyline),
    remove: vi.fn(),
    bindPopup: vi.fn(() => polyline),
  };

  const layerGroup = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    addTo: vi.fn(() => layerGroup),
  };

  const divIcon = vi.fn(() => ({}));
  const circle = { addTo: vi.fn(() => circle), setLatLng: vi.fn(() => circle), remove: vi.fn() };

  const L = {
    map: vi.fn(() => map),
    marker: vi.fn(() => marker),
    polyline: vi.fn(() => polyline),
    layerGroup: vi.fn(() => layerGroup),
    divIcon,
    circle: vi.fn(() => circle),
    icon: vi.fn(() => ({})),
    DomEvent: {},
    DomUtil: {},
    Browser: {},
  };

  Object.assign(L, {
    Marker: vi.fn(() => marker),
    Polyline: vi.fn(() => polyline),
    LayerGroup: vi.fn(() => layerGroup),
    Circle: vi.fn(() => circle),
  });

  return L;
});

// Mock serialService to avoid real Web Serial API
vi.mock('../services/webSerial', () => ({
  serialService: {
    setCallbacks: vi.fn(),
    setBaudRate: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendCommand: vi.fn(),
  },
}));
