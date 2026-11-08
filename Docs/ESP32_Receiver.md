# ESP32 LoRa Receiver — Build & Flash Guide

**Target:** ESP32 (DevKit or NodeMCU)  
**Radio:** SX1262 LoRa module  
**Toolchain:** ESP-IDF v6.0.x  
**Purpose:** Ground-side LoRa receiver that bridges robot telemetry to the React dashboard over USB-CDC.

---

## 1. Hardware Pinout (ESP32 → SX1262)

| SX1262 Pin | ESP32 GPIO | Function |
|------------|------------|----------|
| NSS        | GPIO5      | SPI Chip Select (HSPI CS0) |
| SCK        | GPIO18     | SPI Clock |
| MOSI       | GPIO23     | SPI MOSI |
| MISO       | GPIO19     | SPI MISO |
| RESET      | GPIO14     | Reset (active low) |
| BUSY       | GPIO13     | Busy input |
| DIO1       | GPIO4      | IRQ (rising edge) |
| TXEN       | GPIO25     | TX enable (if `LORA_USE_RXTX_PINS=1`) |
| RXEN       | GPIO33     | RX enable (if `LORA_USE_RXTX_PINS=1`) |
| VCC        | 3.3V       | Power |
| GND        | GND        | Ground |

> Adjust `esp_receiver/main/lora_radio.c` if your board uses different GPIOs.

---

## 2. Build & Flash

### Prerequisites

ESP-IDF v6.0.x must be installed and the environment activated:

```powershell
# Windows PowerShell
C:\esp\v6.0.2\esp-idf\export.ps1
```

### Steps

```powershell
# 1. Navigate to the ESP32 receiver project
cd esp_receiver

# 2. Set target (ESP32)
idf.py set-target esp32s3

# 3. Build
idf.py build

# 4. Flash (replace COMx with your ESP32's serial port)
idf.py -p COMx flash monitor
```

The `monitor` output shows `ESP_LOGI` messages from the firmware. The USB-CDC port appears as `/dev/ttyACM0` (Linux/macOS) or `COMx` (Windows).

---

## 3. ESP32 ↔ Nucleo Communication (USART6)

The ESP32 communicates with the STM32 Nucleo over **USART6** for telemetry forwarding and command exchange:

| ESP32 Pin | Nucleo Pin | Function |
|-----------|------------|----------|
| UART TX | PG9 (USART6_RX) | ESP32 TX → Nucleo RX |
| UART RX | PG14 (USART6_TX) | Nucleo TX → ESP32 RX |
| GND | GND | Common ground |

> **Cross TX/RX:** ESP32 TX → Nucleo PG9. Nucleo PG14 → ESP32 RX.
> Baud rate: 115200. The STM32 acts as USART6 master; the ESP32 is the slave.
> Configure the ESP32 UART GPIO numbers in `esp_receiver/main/main.c` to match your board's pinout.

## 4. Dashboard Integration

The ESP32 emits **newline-delimited JSON** (schema matches `src/types/telemetry.ts` `TelemetryPacket`) at **115200 baud**. The React dashboard (`src/services/webSerial.ts`) opens any CDC device matching these VIDs:

| Vendor ID | Device |
|-----------|--------|
| 0x303A    | Espressif (ESP32 USB-Serial-JTAG / native USB-CDC) |
| 0x10C4    | Silicon Labs CP210x |
| 0x1A86    | CH340 |
| 0x0403    | FTDI |

### Serial output wiring

`ground_bridge.c` writes the JSON to **UART0** (`uart_write_bytes(UART_NUM_0, ...)`), i.e. ESP32 **GPIO1 (TX) / GPIO3 (RX)** at 115200 baud. Choose one of the following:

* **External USB-UART bridge** (recommended for the current firmware): wire the bridge's TX/RX to ESP32 GPIO3/GPIO1 (crossed), connect the bridge to the host over USB, and select its COM port (`/dev/ttyACM0` or `COMx`) in the dashboard. Matches the CP210x / CH340 / FTDI VID filters above.
* **Native ESP32 USB-CDC** (`/dev/ttyACM0`, VID 0x303A): switch the write target in `esp_receiver/main/ground_bridge.c` from `uart_write_bytes(UART_NUM_0, ...)` to the tinyusb CDC API (`CONFIG_USB_CDC_ENABLED` is already on in `sdkconfig.defaults`; add `esp_tinyusb` to the component `REQUIRES`). This is not yet wired up — see the TODO in `ground_bridge.c`.

Connect the ESP32/bridge via USB-C, open the dashboard at `http://localhost:5173`, click **Connect** in the Wireless Link card, and select the serial port.

Connectivity is reflected on the dashboard as follows:
* **Left Sidebar** link pill: `DISCONNECTED` / `CONNECTING` / `CONNECTED` / `ERROR` (from `serialStatus`).
* **Sensor Sheet → LoRa Wireless Link**: signal bars, RSSI, SNR, loss, latency, and packet seq (updated on every valid frame).
* **Map "Last known location" banner**: appears when no packet has been received for >4s or GPS is invalid.

---

## 4. Project Structure

```
esp_receiver/
├── CMakeLists.txt              # Top-level ESP-IDF project
├── sdkconfig.defaults          # Kconfig defaults (USB-CDC, ESP32)
├── main/
│   ├── CMakeLists.txt          # Component registration
│   ├── main.c                  # App entry point (radio poll loop)
│   ├── lora_radio.c/.h         # ESP-IDF HAL for SX126x
│   ├── proto.c/.h              # Binary frame format (shared with STM32)
│   ├── ground_bridge.c/.h      # Fragment reassembly + JSON emission
│   └── ...
└── components/
    └── sx126x/                 # Semtech SX126x driver (component)
        ├── CMakeLists.txt
        ├── sx126x.c/.h
        ├── sx126x_hal.h
        ├── sx126x_regs.h
        ├── sx126x_status.h
        └── ...
```

---

## 5. Shared Configuration

All LoRa radio parameters are defined in `common/lora_cfg.h` and must match the STM32 transmitter exactly:

| Parameter | Value |
|-----------|-------|
| Frequency | 865.4025 MHz (EU868) |
| SF        | 9 |
| BW        | 125 kHz |
| CR        | 4/5 |
| Preamble  | 12 symbols |
| Sync word | 0x12 |
| TX power  | 14 dBm |

---

## 6. Debugging

- **No packets received:** Verify antenna connection, frequency match, and that STM32 is transmitting.
- **CRC failures:** Check SPI wiring and clock speed (max 2 MHz recommended).
- **JSON not appearing on dashboard:** Verify USB-CDC port is selected and baud rate matches (115200).
- **Radio init fails:** Check NSS/RESET/BUSY pin wiring; confirm SX1262 is powered.
