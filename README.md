# Artemis Ground Station Dashboard

[![Build Status](https://github.com/your-org/artemis-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/artemis-dashboard/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

> **Real‑time telemetry and control interface for Team Artemis autonomous rover operations**

---

## 🎯 Purpose

The dashboard provides a single‑page web interface for monitoring and controlling a rover equipped with LoRa telemetry, GPS, environmental sensing, and mmWave radar. It aggregates data from the ground‑side ESP32 receiver and presents it to operators in near‑real‑time.

---

## 🏗️ Architecture

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript 6, Vite 8 |
| **Mapping** | Leaflet 1.9 (OpenStreetMap tiles) |
| **Icons** | Lucide React |
| **Styling** | CSS variables, Tailwind utilities |
| **Serial I/O** | Web Serial API (USB‑CDC) |
| **Testing** | Vitest, React Testing Library |
| **Linting** | Oxlint |

The core of the application lives in `src/`. Key directories:

- `components/` – React UI components (MapView, Sensor panels, POI modal, etc.)
- `services/` – Runtime services (`webSerial.ts` for serial communication, `simulator.ts` for mock telemetry)
- `types/` – TypeScript definitions for telemetry packets and UI state

---

## 📡 Communication & Packet Flow

### 1. LoRa Radio Layer

Both the rover (STM32) and the ground station (ESP32‑S3) use SX126x LoRa modules configured with the same parameters (see `Docs/LoRa_Spec.md`):
- Frequency: **865.4025 MHz** (EU868 band)
- Spreading Factor: **SF9**
- Bandwidth: **125 kHz**
- Coding Rate: **4/5**
- Sync Word: **0x12** (private network)
- TX Power: **14 dBm**
- Duty‑cycle: **1 %** (ETSI EN 300 220)

### 2. Binary Frame → JSON Bridge

The ESP32 receiver validates CRC, reassembles fragmented frames, and emits **newline‑delimited JSON** over a USB‑CDC serial port at **115200 baud**. The JSON payload matches the `TelemetryPacket` TypeScript interface (`src/types/telemetry.ts`).

### 3. Web Serial Integration

`src/services/webSerial.ts` opens any USB‑CDC device matching common vendor IDs (Espressif, Silicon Labs, CH340, FTDI). It reads each line, parses JSON packets, and forwards them to the React state via callbacks.

### 4. Telemetry Packet Structure (excerpt)

```ts
export interface TelemetryPacket {
  seq: number;
  timestamp: number;
  bot_status: BotStatus;
  gps: GpsData;
  env: EnvData;
  radar: RadarData;
  power: PowerData;
  motors: MotorData;
  link: LinkData;
}
```

Full definitions are in `src/types/telemetry.ts` and mirror the LoRa packet types listed in `Docs/LoRa_Spec.md`.

---

## 📦 Sensor Constraints (brief)

| Sensor | Interface | Key Limits |
|--------|-----------|------------|
| **BME688** (environment) | I²C (400 kHz) | Temperature ‑ 85 °C → 85 °C, Humidity 0‑100 % RH, Pressure 300‑1100 hPa |
| **NEO‑M8N** (GPS) | UART (115200 baud) | Position update ≈ 1 Hz, 3‑D fix required for valid `lat/lng` |
| **LD2412** (mmWave radar) | UART (115200 baud) | Detects humans up to 7 m, energy metric 0‑100 |
| **SX126x** (LoRa) | SPI (≤ 2 MHz) | Frequency 865.4025 MHz, max output 14 dBm, duty‑cycle 1 % |

These limits are enforced in the STM32 firmware (`Docs/STM32_Sender.md`) and the ESP32 bridge.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+** and **npm**
- Modern browser with **Web Serial API** support (Chrome 89+, Edge 89+)
- Ground‑side ESP32‑S3 hardware (or a simulator) for live telemetry

### Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-org/artemis-dashboard.git
cd artemis-dashboard

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev   # Starts Vite dev server at http://localhost:5173
```
Open the URL in a supported browser, click **Connect** in the Wireless Link panel, and select the ESP32 serial port.

### Production Build

```bash
npm run build   # Type‑check and bundle for production
npm run preview # Serve the built files locally
```

---

## 📡 APIs & Integration Points

1. **Web Serial API** – Used by `WebSerialManager` to open a USB‑CDC port, read newline‑delimited JSON, and send simple text commands (e.g., `E‑STOP`).
2. **Telemetry JSON** – Consumers can subscribe to the `onPacket` callback to receive typed `TelemetryPacket` objects.
3. **Command Interface** – `WebSerialManager.sendCommand(cmd)` writes a line‑terminated string to the ESP32. Typical commands are:
   - `STOP` – emergency stop
   - `HOME` – recenter map to home base
   - `PING` – health check
4. **Simulator** – `src/services/simulator.ts` can be used to generate mock telemetry for development without hardware.
5. **Custom Sensors** – To integrate additional sensors, extend `TelemetryPacket` and update the ESP32 bridge to emit matching JSON fields. The dashboard will automatically render new data if a corresponding UI component is added.

---

## 📁 Project Structure

```
artemis-dashboard/
├── src/
│   ├── components/   # React UI components
│   ├── services/      # Serial & simulator services
│   ├── types/         # Telemetry TypeScript definitions
│   ├── App.tsx        # Root component
│   └── main.tsx       # Entry point
├── Docs/
│   ├── LoRa_Spec.md
│   ├── ESP32_Receiver.md
│   ├── STM32_Sender.md
│   └── (datasheets)
├── .gitignore
├── package.json
└── vite.config.ts
```

---

## 🤝 Contributing

Contributions are welcome. Follow the standard workflow:
1. Fork the repository
2. Create a feature branch
3. Run `npm run lint` and `npm run test`
4. Submit a pull request

---

## 📄 License

MIT License – see the `LICENSE` file for details.
