# STM32 Sender — Build & Flash Guide

**Target:** STM32F722ZET6 (NUCLEO-F722ZE)  
**Radio:** SX1262 LoRa module  
**Toolchain:** STM32CubeIDE 6.x (or STM32CubeMX + Make)  
**Purpose:** Robot-side sensor aggregation hub and LoRa transmitter.

---

## 1. Hardware Pinout (STM32 → SX1262)

| SX1262 Pin | STM32 Pin | Function |
|------------|-----------|----------|
| NSS        | PA4       | SPI1 Chip Select |
| SCK        | PA5       | SPI1 SCK |
| MISO       | PA6       | SPI1 MISO |
| MOSI       | PA7       | SPI1 MOSI |
| RESET      | PE11      | Reset (active low) |
| BUSY       | PF13      | Busy input |
| DIO1       | PE9       | IRQ (EXTI9_5) |
| TXEN       | PF14      | TX enable (optional) |
| RXEN       | PE13      | RX enable (optional) |

**Sensors:**
| Sensor | Interface | STM32 Pin(s) |
|--------|-----------|--------------|
| BME688 | I2C1      | PB6 (SCL), PB9 (SDA) |
| NEO-M8N GPS | UART4 | PA0 (TX), PA1 (RX) |
| LD2412 Radar | UART5 | PC12 (TX), PD2 (RX) |

---

## 2. Build & Flash

### Using STM32CubeIDE

1. Open STM32CubeIDE → **File → Open Projects from File System**
2. Select: `Dashboard/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit`
3. The `.ioc` file (CubeMX config) is included — double-click to verify pinout/clocks.
4. Build: **Project → Build All** (or `Ctrl+B`)
5. Connect ST-Link, then **Run → Debug** to flash and attach GDB.

### Using Command Line (Make)

```bash
cd Dashboard/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit
make -j$(nproc)
# Flash via ST-Link (requires st-flash or STM32CubeProgrammer)
```

---

## 3. Shared Configuration

All LoRa radio parameters are defined in `common/lora_cfg.h` and must match the ESP32 receiver exactly. The STM32 project includes this header via its include path.

---

## 4. Sensors Already Integrated

| Sensor | Driver File | Status |
|--------|-------------|--------|
| BME688 (environmental) | `Core/Src/bme688_port.c` | Implemented |
| NEO-M8N (GPS) | `Core/Src/gps_ubx.c` | Implemented (UBX NAV-PVT/DOP) |
| LD2412 (mmWave radar) | `Core/Src/ld2412.c` | Implemented |

---

## 5. Application Logic

`Core/Src/app.c` implements:

- **Priority queue** with aging (GPS/radar = highest priority)
- **Duty-cycle token bucket** (ETSI 1% compliance)
- **Selective ACK** for RADAR ALERT and CMD packets
- **Fragmentation** for large telemetry packets
- **Continuous RX** for inbound ACK/CMD from ground

The main loop (`app_loop()`) runs at ~100 Hz and:
1. Reads GPS/radar UART rings
2. Polls LoRa radio for TX/RX events
3. Sends periodic GPS, status, power, env, telemetry packets
4. Handles E-STOP commands from ground
