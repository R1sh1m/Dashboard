# Artemis Ground Station Dashboard

[![Build Status](https://github.com/your-org/artemis-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/artemis-dashboard/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

> **Real-time telemetry and control interface for Team Artemis autonomous rover operations**

The Artemis Ground Station is a production-grade web dashboard for monitoring and controlling autonomous rover missions. Built with React 19, TypeScript, and Leaflet, it provides operators with live telemetry, environmental sensing, human presence detection, and precise location tracking—all designed according to Apple Human Interface Guidelines for clarity and accessibility.

![Dashboard Preview](Docs/assets/dashboard-preview.png)

---

## 🎯 Purpose

This dashboard serves as the primary operator interface for Team Artemis rover deployments, enabling:

- **Real-time telemetry monitoring** — bot state, GPS coordinates, power systems, motor matrices, environmental sensors
- **Human presence detection** — LD2410B radar integration with automatic POI marking
- **Environmental anomaly tracking** — BME688 gas resistance and IAQ monitoring
- **Point of Interest (POI) management** — mark, edit, and navigate to mission-critical locations
- **Serial communication** — Web Serial API connection to ground ESP32 station
- **Emergency stop controls** — immediate E-Stop broadcast with visual confirmation
- **Multi-layer mapping** — OpenStreetMap, Satellite, and Terrain views with smooth cycling

---

## 🚀 Features

### Telemetry & Sensors
- **Bot Status**: state machine (STANDBY, MOVING, EMERGENCY_STOP), connection health
- **Power Systems**: voltage, current, battery percentage, charging state
- **Motor Matrix**: individual motor health, PWM values, fault detection
- **Environmental**: temperature, humidity, pressure, gas resistance, IAQ score
- **Wireless Link**: LoRa RSSI, SNR, packet loss monitoring
- **Radar**: LD2410B human detection with distance and energy tracking

### Map & Navigation
- **Leaflet-based mapping** with OpenStreetMap default (Satellite/Terrain optional)
- **Home Base latching** on first valid GPS fix
- **POI lifecycle**: create, edit, delete, cycle navigation
- **Last Known Location** indicator with signal loss detection
- **Approximate vs precise location** handling per Apple privacy guidelines

### UI/UX Excellence
- **Apple HIG compliance**: 44×44pt hit targets, SF Pro typography, proper contrast
- **Bottom-sheet sensor panels** with progressive disclosure
- **Dark mode support** via CSS variables
- **Keyboard accessibility** with skip links and focus states
- **Responsive layout** adapting to safe areas and orientations

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript 6 |
| **Build** | Vite 8, esbuild |
| **Mapping** | Leaflet 1.9 |
| **Icons** | Lucide React |
| **Styling** | CSS Variables, Tailwind utilities |
| **Serial** | Web Serial API |
| **Testing** | Vitest, React Testing Library |
| **Linting** | Oxlint |

---

## 📦 Installation

### Prerequisites
- Node.js 20+ and npm
- Modern browser with Web Serial API support (Chrome 89+, Edge 89+)
- Ground ESP32 hardware (for live telemetry)

### Quick Start
```bash
# Clone repository
git clone https://github.com/your-org/artemis-dashboard.git
cd artemis-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production Build
```bash
npm run build
npm run preview
```

---

## 🔧 Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR enabled) |
| `npm run build` | Type-check and build production bundle |
| `npm run lint` | Run Oxlint static analysis |
| `npm run test` | Execute Vitest test suite |
| `npm run preview` | Preview production build locally |

---

## 📡 Hardware Integration

### Web Serial Connection
The dashboard connects to the Ground ESP32 via USB using the Web Serial API:

1. Click **Connect** in the left sidebar
2. Select the ESP32 COM port from the browser dialog
3. Monitor telemetry in real-time

**Baud Rate**: Configurable (default: 115200)

### Telemetry Packet Structure
```typescript
interface TelemetryPacket {
  bot_status: { state: 'STANDBY' | 'MOVING' | 'EMERGENCY_STOP' };
  gps: { lat: number; lng: number; valid: boolean };
  power: { voltage: number; current: number; battery_pct: number };
  motors: { /* motor matrix data */ };
  env: { temp: number; humidity: number; gas_resistance_kohm: number; iaq: number };
  link: { rssi_dbm: number; snr: number };
  radar: { human_detected: boolean; distance_cm: number; energy: number };
}
```

See [`Docs/ESP32_Receiver.md`](Docs/ESP32_Receiver.md) and [`Docs/STM32_Sender.md`](Docs/STM32_Sender.md) for hardware protocol details.

---

## 🎨 Design Standards

This dashboard follows **Apple Human Interface Guidelines** translated to web technologies:

- **Eight Design Principles**: Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight
- **Layout**: 44×44pt minimum hit targets, 24pt section gaps, progressive disclosure
- **Typography**: SF Pro Display (headlines), SF Pro Text (body), system-ui fallback
- **Materials**: Liquid Glass-style blur with `backdrop-filter`, translucent frosted controls
- **Accessibility**: WCAG AA 4.5:1 contrast, keyboard navigation, `prefers-reduced-motion`
- **Location Privacy**: Approximate location by default, precise location on-demand

**Design Documentation**:
- [`Docs/DESIGN.md`](Docs/DESIGN.md) — Apple HIG design standards and review checklist
- [`Docs/APPLE_MAPS.md`](Docs/APPLE_MAPS.md) — Apple Maps UI/UX patterns and MapKit integration notes

---

## 🧪 Testing & Quality

### Run Tests
```bash
npm run test
```

### Type Check
```bash
npx tsc --noEmit
```

### Lint
```bash
npm run lint
```

---

## 🚢 CI/CD Pipeline

This repository uses GitHub Actions for continuous integration:

### Workflow Triggers
- Push to `main` or `master` branches
- Pull requests to protected branches

### Pipeline Stages
1. **Install** — Cache node_modules, install dependencies
2. **Type Check** — TypeScript compilation with no errors
3. **Lint** — Oxlint static analysis
4. **Build** — Production Vite build
5. **Test** — Vitest unit and integration tests

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for configuration.

---

## 📁 Project Structure

```
artemis-dashboard/
├── src/
│   ├── components/       # React components (MapView, SensorSheet, PoiModal, etc.)
│   ├── services/         # Telemetry simulator, Web Serial service
│   ├── types/            # TypeScript type definitions
│   ├── lib/              # Utility functions, map layer configs
│   ├── App.tsx           # Root component with state orchestration
│   └── main.tsx          # Entry point
├── Docs/
│   ├── DESIGN.md         # Apple HIG design standards
│   ├── APPLE_MAPS.md     # Apple Maps UI/UX reference
│   ├── ESP32_Receiver.md # Ground station hardware setup
│   ├── STM32_Sender.md   # Rover-side telemetry sender
│   └── LoRa_Spec.md      # LoRa wireless protocol spec
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions CI pipeline
├── AGENTS.md             # Autonomous agent operational guide
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🤝 Contributing

### Agent Workflow
This project uses autonomous agents for development tasks. See [`AGENTS.md`](AGENTS.md) for:
- Project architecture overview
- Working agreements and boundaries
- Design standards enforcement
- Validation expectations

### UI Change Review Checklist
Before any UI change lands, verify:
- [ ] Hit targets ≥ 44×44pt
- [ ] Body text ≥ 11pt, contrast ≥ 4.5:1
- [ ] SF Pro typography / SF Symbol icons used
- [ ] Controls positioned near modified content
- [ ] Progressive disclosure for secondary info
- [ ] Dark mode and safe areas respected
- [ ] Location data handled per privacy guidelines
- [ ] Reduced motion/transparency preferences supported

---

## 📄 License

MIT License — see [`LICENSE`](LICENSE) for details.

---

## 🏆 Team Artemis

Built for autonomous rover operations and competitive robotics deployments.

**Stack**: React 19 · TypeScript 6 · Vite 8 · Leaflet · Web Serial API
