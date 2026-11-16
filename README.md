# Artemis Ground Station Dashboard

<p align="center">
  <img src="./public/artemis-logo.png" alt="Artemis Ground Station" width="120" height="120" />
</p>

<p align="center">
  <b>Real-time telemetry and control interface for Team Artemis autonomous rover operations</b>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-6.0-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  </a>
  <a href="https://react.dev/">
    <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react" alt="React" />
  </a>
  <a href="https://vitejs.dev/">
    <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite" alt="Vite" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
  </a>
</p>

---

## Purpose

The Artemis Ground Station Dashboard is a single-page web interface for monitoring and controlling an autonomous rover equipped with LoRa telemetry, GPS, environmental sensing, and mmWave radar. It aggregates data from the ground-side ESP32 receiver and presents it to operators in near-real time.

---

## Architecture

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript 6, Vite 8 |
| **Mapping** | Leaflet 1.9 (OpenStreetMap tiles) |
| **Icons** | Lucide React |
| **Styling** | CSS variables |
| **Serial I/O** | Web Serial API (USB-CDC) |
| **Testing** | Vitest, React Testing Library |
| **Linting** | Oxlint |

The application lives in `src/`:

- `components/` — React UI components (MapView, sensor panels, POI modal, etc.)
- `services/` — Runtime services (`webSerial.ts` for serial communication, `simulator.ts` for mock telemetry)
- `types/` — TypeScript definitions for telemetry packets and UI state

---

## Communication & Packet Flow

### 1. LoRa Radio Layer

Both the rover (STM32) and ground station (ESP32-S3) use SX126x LoRa modules configured identically ([LoRa Spec →](Docs/LoRa_Spec.md)):

| Parameter | Value |
|-----------|-------|
| Frequency | 865.4025 MHz (EU868) |
| Spreading Factor | SF9 |
| Bandwidth | 125 kHz |
| Coding Rate | 4/5 |
| Sync Word | 0x12 (private network) |
| TX Power | 14 dBm |
| Duty Cycle | 1% (ETSI EN 300 220) |

### 2. Binary Frame → JSON Bridge

The ESP32 receiver validates CRC, reassembles fragmented frames, and emits **newline-delimited JSON** over USB-CDC at **115200 baud**. The JSON payload matches the `TelemetryPacket` TypeScript interface (`src/types/telemetry.ts`).

### 3. Web Serial Integration

`src/services/webSerial.ts` opens any USB-CDC device matching common vendor IDs (Espressif, Silicon Labs, CH340, FTDI). It reads each line, parses JSON packets, and forwards them to the React state via callbacks.

### 4. Telemetry Packet Structure

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

Full definitions are in [`src/types/telemetry.ts`](src/types/telemetry.ts) and mirror the LoRa packet types in [`Docs/LoRa_Spec.md`](Docs/LoRa_Spec.md).

---

## Sensor Constraints

| Sensor | Interface | Key Limits |
|--------|-----------|------------|
| **BME688** (environment) | I²C (400 kHz) | Temp −85→85 °C, Humidity 0–100 % RH, Pressure 300–1100 hPa |
| **NEO-M8N** (GPS) | UART (115200 baud) | Position update ≈ 1 Hz, 3-D fix required for valid lat/lng |
| **LD2412** (mmWave radar) | UART (115200 baud) | Detects humans up to 7 m, energy metric 0–100 |
| **SX126x** (LoRa) | SPI (≤ 2 MHz) | 865.4025 MHz, max 14 dBm, duty cycle 1% |

These limits are enforced in the STM32 firmware ([`Docs/STM32_Sender.md`](Docs/STM32_Sender.md)) and the ESP32 bridge ([`Docs/ESP32_Receiver.md`](Docs/ESP32_Receiver.md)).

---

## Hardware Pinouts

All pin assignments are locked in [`Docs/HARDWARE_WIRING_PIN_LOCK.md`](Docs/HARDWARE_WIRING_PIN_LOCK.md). The tables below are consolidated for quick reference.

### STM32F722ZET6 → Modules (NUCLEO-F722ZE)

| Module | Signal | Nucleo Pin | Connector | Mode / AF |
|--------|--------|------------|-----------|-----------|
| **SX1262 LoRa** | SCK | PA5 | CN7 / 10 | SPI1_SCK (AF5) |
| | MISO | PA6 | CN7 / 12 | SPI1_MISO (AF5) |
| | MOSI | PA7 | CN7 / 14 | SPI1_MOSI (AF5) |
| | NSS / CS | PA4 | CN7 / 16 | GPIO Output PP |
| | RESET | PE11 | CN7 / 20 | GPIO Output PP |
| | BUSY | PF13 | CN10 / 2 | GPIO Input |
| | DIO1 (IRQ) | PE9 | CN10 / 4 | GPIO EXTI9 |
| | RXEN | PE13 | CN10 / 14 | GPIO Output PP |
| | TXEN | PF14 | CN10 / 16 | GPIO Output PP |
| | VCC / GND | 3.3V / GND | CN8 / 7, 11 | Power & Ground |
| **BME688** | SCL | PB8 | CN7 / 2 | I2C1 (AF4) |
| | SDA | PB9 | CN7 / 4 | I2C1 (AF4) |
| | VCC / GND | 3.3V / GND | CN8 / 7, 11 | Power & Ground |
| **NEO-M8N GPS** | TX → MCU RX | PD6 | CN10 / 17 | USART2_RX (AF7, 9600 baud) |
| | MCU TX → RX | PD5 | CN10 / 15 | USART2_TX (AF7, 9600 baud) |
| | VCC / GND | 3.3V / GND | CN8 / 7, 11 | Power & Ground |
| **LD2412 Radar** | TX → MCU RX | PD2 | CN9 / 5 | UART5_RX (AF8, 115200 baud) |
| | MCU TX → RX | PC12 | CN9 / 3 | UART5_TX (AF8, 115200 baud) |
| | VCC / GND | 5V / GND | CN8 / 9, 11 | Power & Ground |
| **LCD 1602 (PCF8574)** | SCL | PB8 | CN7 / 2 | I2C1 (shared bus) |
| | SDA | PB9 | CN7 / 4 | I2C1 (shared bus) |
| | VCC / GND | 5V / GND | CN8 / 9, 11 | Power & Ground |
| **ST-LINK VCP** | TX | PD8 | Internal | USART3_TX (115200 baud) |
| | RX | PD9 | Internal | USART3_RX (115200 baud) |

### ESP32 → SX1262 LoRa Module

| SX1262 Pin | ESP32 GPIO | Function |
|------------|------------|----------|
| NSS / CS | GPIO5 | SPI Chip Select |
| SCK | GPIO18 | SPI Clock |
| MOSI | GPIO23 | SPI MOSI |
| MISO | GPIO19 | SPI MISO |
| RESET | GPIO14 | Radio Reset |
| BUSY | GPIO13 | Busy input |
| DIO1 | GPIO4 | Radio Interrupt |
| TXEN | GPIO25 | TX enable (optional) |
| RXEN | GPIO33 | RX enable |
| VCC / GND | 3.3V / GND | Power & Ground |

### ESP32 ↔ STM32 Nucleo (USART6)

| ESP32 Pin | Nucleo Pin | Function |
|-----------|------------|----------|
| UART TX | PG9 (USART6_RX) | ESP32 TX → Nucleo RX |
| UART RX | PG14 (USART6_TX) | Nucleo TX → ESP32 RX |
| GND | GND | Common ground |

> **Power rail note:** The LCD 1602 and LD2412 radar require **5V** (CN8 / Pin 9). All other modules run on **3.3V** (CN8 / Pin 7). All GND pins share CN8 / Pin 11.

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- Modern browser with **Web Serial API** support (Chrome 89+, Edge 89+)
- Ground-side ESP32-S3 hardware (or simulator) for live telemetry

### Clone & Install

```bash
git clone https://github.com/your-org/artemis-dashboard.git
cd artemis-dashboard
npm install
```

### Development Server

```bash
npm run dev   # Starts Vite dev server at http://localhost:5173
```

Open the URL in a supported browser, click **Connect** in the Wireless Link panel, and select the ESP32 serial port.

### Production Build

```bash
npm run build   # Type-check and bundle for production
npm run preview # Serve the built files locally
```

### Multi-Device Field Access (WebSocket Bridge)

The laptop plugged into the ESP32 via USB can act as a host server so tablets and phones on the same Wi-Fi/hotspot can view and control the dashboard in real time.

```bash
npm run build   # Build the dashboard
npm run server:start  # Start Express + WebSocket bridge on port 3001
```

Or in one step:

```bash
npm run serve:all   # Build + start the bridge server
```

The server logs the local and LAN URLs on startup:

```
=== Artemis Ground Bridge Server ===
Listening on http://localhost:3001
Listening on http://192.168.43.1:3001   # your laptop's Wi-Fi IP
WebSocket at ws://localhost:3001/ws
```

**Connect from a tablet/phone** (same Wi-Fi or phone hotspot):

```
http://<laptop-wifi-ip>:3001
```

Example: `http://192.168.43.1:3001`

**Health check:**

```
GET http://<laptop-wifi-ip>:3001/api/status
```

**Windows Firewall:** If the tablet can't reach the laptop, allow inbound TCP port 3001 in Windows Defender Firewall (or run `netsh advfirewall firewall add rule name="Artemis Bridge" dir=in action=allow protocol=TCP localport=3001` as Administrator).

**Transport modes:** The dashboard defaults to the WebSocket bridge. On the laptop with the ESP32 plugged in via USB, you can toggle to direct WebSerial transport if needed. Tablets and phones always use the WebSocket bridge (Web Serial API is not supported on mobile browsers).

**Note:** The ESP32 must be physically plugged into the laptop's USB port for live telemetry. The tablet/phone cannot reach the laptop's USB ports directly — the bridge server relays all telemetry and commands over WebSocket.

---

## External APIs & Services

| API / Service | Purpose | Used In |
|---------------|---------|---------|
| **Web Serial API** (browser) | Opens USB-CDC ports, reads newline-delimited JSON telemetry, sends text commands to the ESP32. | `src/services/webSerial.ts` |
| **WebSocket** | Bi-directional telemetry and command relay between bridge server and tablet/phone clients. | `server/index.ts`, `src/services/wsSerial.ts` |
| **Leaflet + OpenStreetMap tiles** | Interactive map rendering, rover position tracking, waypoint navigation. | `src/components/MapView.tsx` |
| **Lucide React** | Vector iconography for UI controls, status badges, and navigation. | All UI components |

## Internal APIs & Integration Points

| Interface | Description |
|-----------|-------------|
| **Telemetry JSON** | Subscribe to the `onPacket` callback to receive typed `TelemetryPacket` objects. |
| **Command Interface** | `telemetryClient.sendCommand(cmd)` sends a text command to the ESP32 (via WebSocket bridge or direct WebSerial). Commands: `ESTOP` (emergency stop), `RADAR_SENS`, `RADAR_RANGE`, `RADAR_BLIND`, `RADAR_ENG`. |
| **WebSocket Wire Protocol** | Server→Client: `TELEMETRY`, `GPS`, `RAW`, `STATUS`, `HYDRATE`. Client→Server: `COMMAND`. See `server/types.ts`. |
| **Unified Transport** | `ITelemetryService` (`src/services/telemetryTransport.ts`) abstracts the transport layer so the UI works identically over WebSocket bridge or direct WebSerial. |

---

## Project Structure

```
artemis-dashboard/
├── public/                 # Static assets (logo, favicons)
├── server/                 # WebSocket bridge server (Express + ws + serialport)
│   ├── index.ts            # Express + WebSocket server, serial port management
│   ├── portDetector.ts     # Auto-detect ESP32 USB-UART ports
│   └── types.ts            # WebSocket wire protocol frame types
├── src/
│   ├── components/         # React UI components
│   ├── services/           # Telemetry transports (WebSerial, WebSocket, unified client)
│   │   ├── webSerial.ts    # Direct USB-CDC to ESP32 (Web Serial API)
│   │   ├── wsSerial.ts     # WebSocket client to bridge server
│   │   ├── telemetryClient.ts  # Unified transport facade
│   │   └── telemetryTransport.ts # ITelemetryService interface
│   ├── types/              # Telemetry TypeScript definitions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── Docs/                   # Hardware, LoRa spec, wiring, build guides
├── esp_receiver/           # ESP-IDF ground receiver firmware
├── Sender_station/         # STM32 sender firmware
├── common/                 # Shared LoRa configuration
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [`Docs/HARDWARE_WIRING_PIN_LOCK.md`](Docs/HARDWARE_WIRING_PIN_LOCK.md) | Canonical verified pin lock table & electrical details |
| [`Docs/LoRa_Spec.md`](Docs/LoRa_Spec.md) | LoRa packet specification & radio parameters |
| [`Docs/ESP32_Receiver.md`](Docs/ESP32_Receiver.md) | ESP32 ground receiver build & flash guide |
| [`Docs/ESP32_LoRa_Wiring.md`](Docs/ESP32_LoRa_Wiring.md) | ESP32 → SX1262 wiring details |
| [`Docs/STM32_Sender.md`](Docs/STM32_Sender.md) | STM32 sender build & flash guide |
| [`Docs/DESIGN.md`](Docs/DESIGN.md) | Dashboard UI/UX design system |
| [`Docs/MULTI_DEVICE_SETUP.md`](Docs/MULTI_DEVICE_SETUP.md) | Multi-device field setup (tablet/phone access via WebSocket bridge) |

---

## Contributing

Contributions are welcome. Follow the standard workflow:

1. Fork the repository
2. Create a feature branch
3. Run `npm run lint` and `npm run test`
4. Submit a pull request

---

## License

MIT License — see the [`LICENSE`](LICENSE) file for details.
