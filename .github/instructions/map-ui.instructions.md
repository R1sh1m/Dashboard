---
name: Artemis map UI
description: "Use when modifying Leaflet map behavior, rover tracking, map controls, POI cards, location handling, or map-related dashboard components."
applyTo:
  - "src/components/MapView.tsx"
  - "src/components/PoiModal.tsx"
  - "src/components/SensorSheet.tsx"
  - "src/services/**/*.{ts,tsx}"
---

# Map and Location Guidance

Use [Docs/APPLE_MAPS.md](../../Docs/APPLE_MAPS.md) together with
[Docs/DESIGN.md](../../Docs/DESIGN.md) for map-related work.

- Keep map controls in a reachable, translucent control stack with 44 x 44 px
  targets and visible focus states.
- Keep search and detail interactions compatible with bottom-sheet patterns.
- Treat rover GPS and points of interest as sensitive location data. Explain
  precision and last-known states in the UI when relevant.
- Preserve Leaflet cleanup, marker updates, and existing telemetry behavior.
- Do not claim precise location or live hardware state when only approximate,
  stale, or simulated data is available.
