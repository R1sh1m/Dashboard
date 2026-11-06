# ESP32-S3 LoRa Receiver — Build & Flash Guide

**Target:** ESP32-S3 (DevKit or NodeMCU)  
**Radio:** SX1261 LoRa module  
**Toolchain:** ESP-IDF v6.0.x  
**Purpose:** Ground-side LoRa receiver that bridges robot telemetry to the React dashboard over USB-CDC.

---

## 1. Hardware Pinout (ESP32-S3 → SX1261)

| SX1261 Pin | ESP32 GPIO | Function |
|------------|------------|----------|
| NSS        | GPIO5      | SPI Chip Select (HSPI CS0) |
| SCK        | GPIO18     | SPI Clock |
| MOSI       | GPIO23     | SPI MOSI |
| MISO       | GPIO19     | SPI MISO |
| RESET      | GPIO14     | Reset (active low) |
| BUSY       | GPIO27     | Busy input |
| DIO1       | GPIO26     | IRQ (rising edge) |
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
cd C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard\esp_receiver

# 2. Set target (ESP32-S3)
idf.py set-target esp32s3

# 3. Build
idf.py build

# 4. Flash (replace COMx with your ESP32's serial port)
idf.py -p COMx flash monitor
```

The `monitor` output shows `ESP_LOGI` messages from the firmware. The USB-CDC port appears as `/dev/ttyACM0` (Linux/macOS) or `COMx` (Windows).

---

## 3. Dashboard Integration

The ESP32 emits **newline-delimited JSON** over USB-CDC at 115200 baud. The React dashboard (`src/services/webSerial.ts`) opens any CDC device matching these VIDs:

| Vendor ID | Device |
|-----------|--------|
| 0x303A    | Espressif (ESP32 USB-Serial-JTAG) |
| 0x10C4    | Silicon Labs CP210x |
| 0x1A86    | CH340 |
| 0x0403    | FTDI |

Connect the ESP32 via USB-C, open the dashboard at `http://localhost:5173`, click **Connect** in the Wireless Link card, and select the ESP32 serial port.

---

## 4. Project Structure

```
esp_receiver/
├── CMakeLists.txt              # Top-level ESP-IDF project
├── sdkconfig.defaults          # Kconfig defaults (USB-CDC, ESP32-S3)
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
- **Radio init fails:** Check NSS/RESET/BUSY pin wiring; confirm SX1261 is powered.
