# STM32 Sender — Build & Flash Guide

**Target:** STM32F722ZET6 (NUCLEO-F722ZE)  
**Radio:** SX1262 LoRa module  
**Toolchain:** STM32CubeIDE 6.x (or STM32CubeMX + Make)  
**Purpose:** Robot-side sensor aggregation hub and LoRa transmitter.

---

## 1. Hardware Pinout (STM32 → Modules)

All pin assignments below match `sensor_fusion_transmit.ioc` (CubeMX config). Verify in STM32CubeMX → Pinout view before wiring.

### SX1262 LoRa Module (SPI1)

| SX1262 Pin | Arduino Label | Connector / Pin | STM32 GPIO | Function |
|------------|---------------|-----------------|------------|----------|
| 3V3 | 3.3V | CN8 / 7 | 3.3V | Power |
| GND | GND | CN8 / 11 | GND | Ground |
| CS / NSS | D10 | CN7 / 16 | PA4 | SPI1 Chip Select |
| SCK / CLK | D13 | CN7 / 10 | PA5 | SPI1 SCK |
| MOSI | D11 | CN7 / 14 | PA7 | SPI1 MOSI |
| MISO | D12 | CN7 / 12 | PA6 | SPI1 MISO |
| RESET | D8 | CN7 / 20 | PE11 | Reset (active low) |
| BUSY | D7 | CN10 / 2 | PF13 | Busy input |
| DIO1 | D6 | CN10 / 4 | PE9 | IRQ (EXTI9_5) |
| DIO2 | Pending | — | — | Not connected |
| RXEN | Pending | CN10 / 14 | PE13 | RX enable |
| TXEN | Pending | CN10 / 16 | PF14 | TX enable |
| ANT | Antenna | — | — | LoRa antenna |

### BME688 Environmental Sensor (I2C1)

| BME688 Pin | Arduino Label | Connector / Pin | STM32 GPIO | Function |
|------------|---------------|-----------------|------------|----------|
| VCC | 3.3V | CN8 / 7 | 3.3V | Power |
| GND | GND | CN8 / 11 | GND | Ground |
| SCL | D15 | CN7 / 2 | PB8 | I2C1 SCL |
| SDA | D14 | CN7 / 4 | PB9 | I2C1 SDA |
| SDO | GND | CN8 / 11 | GND | Address 0x76 (GND = 0x76, 3.3V = 0x77) |
| CS | 3.3V | CN8 / 7 | 3.3V | HIGH = I2C mode |

> **Important:** CS must be HIGH to select I²C mode. SDO connected to GND selects address 0x76. Bus is shared with LCD (PCF8574).

### LCD 16×2 via PCF8574 Backpack (I2C1 — Shared Bus)

| LCD Pin | Arduino Label | Connector / Pin | STM32 GPIO | Function |
|---------|---------------|-----------------|------------|----------|
| VCC | **5V** | CN8 / 9 | 5V | Power (5V required for contrast/backlight) |
| GND | GND | CN8 / 11 | GND | Ground (Default address 0x27) |
| SDA | D14 | CN7 / 4 | PB9 | I2C1 SDA |
| SCL | D15 | CN7 / 2 | PB8 | I2C1 SCL |

> **Note:** The LCD backpack shares the I2C1 bus with the BME688. The firmware automatically detects and initializes the LCD at 0x27 (or 0x3F).

### NEO-M8N GPS Module (USART2)

| GPS Pin | Arduino Label | Connector / Pin | STM32 GPIO | Function |
|---------|---------------|-----------------|------------|----------|
| VCC | 3.3V | CN8 / 7 | 3.3V | Power |
| GND | GND | CN8 / 11 | GND | Ground |
| RX | — | CN10 / 15 | PD5 | USART2_TX (Nucleo TX → GPS RX) |
| TX | — | CN10 / 17 | PD6 | USART2_RX (GPS TX → Nucleo RX) |

> **Cross TX/RX:** GPS TX → Nucleo PD6 (USART2_RX). Nucleo PD5 (USART2_TX) → GPS RX.  
> Baud rate: 9600 bps.

### LD2412 mmWave Radar (UART5)

| Radar Pin | Arduino Label | Connector / Pin | STM32 GPIO | Function |
|-----------|---------------|-----------------|------------|----------|
| VCC | **5V** | CN8 / 9 | 5V | Power (5V required) |
| GND | GND | CN8 / 11 | GND | Ground |
| TX | — | CN8 / 12 (or CN11 / 4) | PD2 | UART5_RX (Radar TX → Nucleo RX) |
| RX | — | CN8 / 10 (or CN11 / 3) | PC12 | UART5_TX (Nucleo TX → Radar RX) |

> **Cross TX/RX:** Radar TX → Nucleo PD2. Nucleo PC12 → Radar RX.  
> Baud rate: 115200. Radar needs 5V power, not 3.3V.

### ESP32 Ground Receiver (USART6 — Optional Simplex Telemetry)

| ESP32 Pin | Nucleo Pin | Function |
|-----------|------------|----------|
| UART TX | PG9 (USART6_RX) | ESP32 TX → Nucleo RX |
| UART RX | PG14 (USART6_TX) | Nucleo TX → ESP32 RX |
| GND | GND | Common ground |

> **Cross TX/RX:** ESP32 TX → Nucleo PG9. Nucleo PG14 → ESP32 RX.  
> Baud rate: 115200.

---

## 2. Module Interface Summary

| Module | Interface | STM32 Pins | Connector |
|--------|-----------|------------|-----------|
| SX1262 LoRa | SPI1 | PA5 (SCK), PA6 (MISO), PA7 (MOSI), PA4 (CS), PE11 (RESET), PF13 (BUSY), PE9 (DIO1), PE13 (RXEN), PF14 (TXEN) | CN7, CN10 |
| BME688 | I2C1 | PB8 (SCL), PB9 (SDA) | CN7 |
| LCD 1602 (PCF8574) | I2C1 | PB8 (SCL), PB9 (SDA) — Shared with BME688 | CN7 |
| NEO-M8N GPS | USART2 | PD6 (RX), PD5 (TX) | CN10 |
| LD2412 Radar | UART5 | PD2 (RX), PC12 (TX) | CN9 |
| ST-LINK VCP Debug | USART3 | PD8 (TX), PD9 (RX) @ 115200 | Internal / COM10 |
| ESP32 Receiver | USART6 | PG9 (RX), PG14 (TX) | CN10 |

> See [`Docs/HARDWARE_WIRING_PIN_LOCK.md`](HARDWARE_WIRING_PIN_LOCK.md) for the canonical verified pin lock table and electrical details.

---

## 3. Power Summary

| Module | Voltage | Nucleo Pin |
|--------|---------|------------|
| SX1262 LoRa | 3.3V | CN8 / 7 |
| BME688 | 3.3V | CN8 / 7 |
| NEO-M8N GPS | 3.3V | CN8 / 7 |
| LD2412 Radar | **5V** | CN8 / 9 |
| LCD (PCF8574) | **5V** | CN8 / 9 |
| ESP32 | USB-powered | — |

**All GND pins connect to CN8 / 11 (common ground).**

---

## 4. Build & Flash

### Using STM32CubeIDE

1. Open STM32CubeIDE → **File → Open Projects from File System**
2. Select: `Dashboard/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit`
3. The `.ioc` file (CubeMX config) is included — double-click to verify pinout/clocks.
4. **Before building:** Enable USART6 on PG9/PG14 in CubeMX if you want ESP32 communication.
5. Build: **Project → Build All** (or `Ctrl+B`)
6. Connect ST-Link, then **Run → Debug** to flash and attach GDB.

### Using Command Line (Make)

```bash
cd Dashboard/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit
make -j$(nproc)
# Flash via ST-Link (requires st-flash or STM32CubeProgrammer)
```

---

## 5. Shared Configuration

All LoRa radio parameters are defined in `common/lora_cfg.h` and must match the ESP32 receiver exactly.

| Parameter | Value |
|-----------|-------|
| Frequency | 865.4025 MHz |
| SF | 9 |
| BW | 125 kHz |
| CR | 4/5 |
| Sync word | 0x12 |
| Preamble | 12 symbols |
| TX power | 14 dBm |

---

## 6. Sensors Already Integrated

| Sensor | Driver File | Status |
|--------|-------------|--------|
| BME688 (environmental) | `Core/Src/bme688_port.c` | Implemented |
| NEO-M8N (GPS) | `Core/Src/gps_ubx.c` | Implemented (UBX NAV-PVT/DOP) |
| LD2412 (mmWave radar) | `Core/Src/ld2412.c` | Implemented |
| LCD (PCF8574) | `Core/Src/lcd_i2c.c` | Implemented |

---

## 7. Application Logic

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
5. Forwards telemetry to ESP32 over USART6 for dashboard upload

---

## 8. System Architecture

```
STM32 Nucleo                          ESP32 Ground Receiver
┌─────────────────┐                   ┌──────────────────┐
│  SX1262 LoRa    │─── LoRa RF ───────│  SX1262 LoRa     │
│  (SPI1)         │                   │  (SPI)           │
│  BME688         │                   │  USB-CDC ───────►│ React Dashboard
│  (I2C1)         │                   │  (115200 baud)   │
│  GPS (UART4)    │                   │                  │
│  Radar (UART5)  │                   │                  │
│  LCD (I2C2)     │                   │                  │
│  ESP32 (USART6) │─── USART6 ───────►│  USART6          │
└─────────────────┘                   └──────────────────┘
```

The STM32 aggregates all sensor data, transmits it via LoRa, and also forwards telemetry to the ESP32 over USART6. The ESP32 receives LoRa packets directly (same RF link) and forwards everything to the React dashboard over USB-CDC. No direct wire between ESP32 and Nucleo is needed unless you add a hardware E-STOP line.
