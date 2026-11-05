# Team Artemis Ground Station Dashboard - Agent Operational Guide

This is the canonical project-wide agent instruction file. It applies to all
work in this repository; focused guidance for UI, maps, and documentation
lives in `.github/instructions/`.

## 1. Project Overview & Architecture

- **Stack**: React 19 + TypeScript 6 + Vite 8 + Leaflet + Lucide Icons + CSS variables.
- **Entry points**: `src/main.tsx`, `src/App.tsx`.
- **Core components** (`src/components/`): header, navigation/sidebar, map,
  rover status, power, environmental telemetry, logs, motor/radar/wireless
  status, sensor sheet, and POI modal.
- **Telemetry services** (`src/services/`):
  - `simulator.ts`: simulated rover telemetry streams.
  - `webSerial.ts`: hardware USB/serial telemetry connection.

## 2. Working Agreements

- Preserve existing component and service boundaries; reuse existing patterns
  before introducing new abstractions.
- Keep telemetry and location behavior explicit. Do not silently fall back from
  hardware data to simulated data or hide connection errors.
- Keep controls keyboard-accessible and provide labels for icon-only controls.
- Make precise, scoped changes. Do not rewrite unrelated local work.
- Update directly related documentation when behavior or architecture changes.

## 3. Dev & Build Commands

- **Start dev server**: `npm run dev` (`http://localhost:5173`)
- **Typecheck and production build**: `npm run build` (`tsc -b && vite build`)
- **Lint**: `npm run lint` (`oxlint`)
- **Preview production build**: `npm run preview`

## 4. Apple Design Standards (HIG + Apple Maps)

The dashboard follows Apple's Human Interface Guidelines (HIG) and Apple Maps
UI/UX conventions translated to this React + Leaflet web stack.

- [`Docs/DESIGN.md`](Docs/DESIGN.md) defines the HIG standards, layout,
  typography, materials, components, accessibility, location privacy, and
  review checklist.
- [`Docs/APPLE_MAPS.md`](Docs/APPLE_MAPS.md) defines map search, bottom-sheet,
  POI card, map control, and location-privacy patterns.
- [`.agents/skills/apple-design/SKILL.md`](.agents/skills/apple-design/SKILL.md)
  defines the repeatable Apple interaction review workflow.
- Review every `src/components/` change against the design checklist; review
  map-related changes against both documents.
- Prefer the documented values over guesses: 44 x 44 px hit targets, 11 px
  minimum body text, 4.5:1 contrast, `#0A84FF` accent, and SF Pro fallbacks.

## 5. Validation Expectations

- Run `npm run build` for TypeScript and production-build validation.
- Run `npm run lint` for lint validation.
- For browser-facing changes, verify the running dashboard when browser tools
  are available by checking rendered UI, console output, and network requests.
- Do not treat compilation alone as proof that interactive behavior works.
- Before completing a UI change, explicitly verify the applicable checklist
  items in the design and map documents; do not mark an item complete by
  assumption.

## 6. Change Boundaries

- Do not change telemetry semantics, location precision, or safety-related
  controls without making the behavior explicit in the UI and documentation.
- Do not add secrets, credentials, or generated build output.
- Keep documentation links and references valid after moving or renaming files.
