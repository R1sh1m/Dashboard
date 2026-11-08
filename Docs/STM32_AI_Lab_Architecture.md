# STM32 AI Lab — Final Architecture

**Target:** NUCLEO-F722ZE (STM32F722ZET6, Cortex-M7, 216 MHz)  
**Radio:** SX1262 LoRa (SPI1)  
**Ground Receiver:** ESP32 + SX1262 (USB-CDC to React dashboard)  
**Inter-board link:** USART6 (PG9 RX, PG14 TX, 115200 baud)

---

## 1. System Architecture

```
STM32 Nucleo (Robot)                          ESP32 (Ground Receiver)
┌─────────────────────────────────────┐       ┌─────────────────────────────┐
│  SX1262 LoRa (SPI1)                 │       │  SX1262 LoRa (SPI)          │
│  PA5 SCK, PA6 MISO, PA7 MOSI        │◄─────►│  GPIO18 SCK, GPIO23 MOSI    │
│  PA4 NSS, PE11 RESET, PF13 BUSY     │  RF   │  GPIO19 MISO, GPIO5 NSS     │
│  PE9 DIO1, PE13 RXEN, PF14 TXEN     │       │  GPIO13 BUSY, GPIO4 DIO1    │
│                                     │       │                             │
│  BME688 (I2C1)                      │       │  USB-CDC (115200 baud) ────►│ React Dashboard
│  PB6 SCL, PB9 SDA                   │       │                             │
│                                     │       │                             │
│  NEO-M8N GPS (UART4, 9600 baud)     │       │                             │
│  PA0 TX, PA1 RX                     │       │                             │
│                                     │       │                             │
│  LD2412 Radar (UART5, 115200 baud)  │       │                             │
│  PC12 TX, PD2 RX                    │       │                             │
│                                     │       │                             │
│  LCD PCF8574 (I2C2)                 │       │                             │
│  PF0 SDA, PF1 SCL                   │       │                             │
│                                     │       │                             │
│  ESP32 (USART6, 115200 baud)        │       │                             │
│  PG9 RX, PG14 TX                    │◄─────►│  USART6                     │
└─────────────────────────────────────┘       └─────────────────────────────┘
```

**Data flow:**
1. STM32 aggregates BME688, GPS, radar, and LCD data
2. STM32 transmits LoRa packets (865.4025 MHz, SF9, BW125, CR4/5, sync 0x12)
3. ESP32 receives LoRa packets directly over RF
4. STM32 also forwards telemetry to ESP32 over USART6
5. ESP32 emits newline-delimited JSON over USB-CDC to the React dashboard

---

## 2. Software Stack

| Layer | Tool | Role |
|-------|------|------|
| Configuration | STM32CubeMX | Pinout, peripheral config, `.ioc` |
| Build | STM32CubeCLI / CMake / Ninja | Command-line build, no GUI required |
| Compiler | ARM GNU Toolchain (via CubeCLI) | Cortex-M7 compilation |
| Flash | STM32CubeProgrammer / CubeCLI | ST-LINK programming |
| Debug | ST-LINK GDB Server | Source-level debugging |
| UART Test | Python + PySerial | Automated hardware test sequences |
| Static Analysis | Cppcheck, clang-format | Code quality |
| Unit Tests | Unity + Ceedling | Embedded C testing |
| Coverage | gcovr | Test coverage reports |

---

## 3. Pinout Summary (from `.ioc`, verified)

| Module | Interface | STM32 Pins |
|--------|-----------|------------|
| SX1262 LoRa | SPI1 | PA5 SCK, PA6 MISO, PA7 MOSI, PA4 NSS, PE11 RESET, PF13 BUSY, PE9 DIO1, PE13 RXEN, PF14 TXEN |
| BME688 | I2C1 | PB6 SCL, PB9 SDA |
| LCD | I2C2 | PF0 SDA, PF1 SCL |
| GPS | UART4 | PA0 TX, PA1 RX (9600 baud) |
| Radar | UART5 | PC12 TX, PD2 RX (115200 baud) |
| ESP32 | USART6 | PG9 RX, PG14 TX (115200 baud) — **must enable in .ioc** |

---

## 4. Build & Flash Commands

```powershell
# Build
cd Dashboard/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit
cube build --project . --toolchain gcc

# Flash (after approval)
cube program --file Build/sensor_fusion_transmit.elf --connect-mode swd --frequency 1000

# Or via STM32CubeProgrammer CLI
STM32_Programmer_CLI -c port=SWD -w Build/sensor_fusion_transmit.elf -v
```

---

## 5. End-to-End Test Procedure

| Step | Action | Expected Output |
|------|--------|-----------------|
| 1 | Flash STM32 firmware | `Artemis TX start`, `BME688 ok`, `SX1262 ok` on ST-LINK COM |
| 2 | Flash ESP32 firmware | `artemis_rx: SX126x radio initialized`, `Radio in continuous RX mode` |
| 3 | Power STM32 | LoRa packets transmitted every 15s |
| 4 | Monitor ESP32 serial (COM3, 115200) | JSON lines received from LoRa |
| 5 | Open dashboard (localhost:5173) | Telemetry cards populate with sensor data |
| 6 | Verify USART6 link | ESP32 receives telemetry from STM32 over USART6 |

---

## 6. Sensor Calibration

See `Docs/Sensor_Calibration.md` for calibration procedures and offset application.

---

## 7. File Locations

| File | Purpose |
|------|---------|
| `Docs/STM32_Sender.md` | STM32 wiring, build, flash guide |
| `Docs/ESP32_Receiver.md` | ESP32 wiring, build, flash guide |
| `Docs/ESP32_LoRa_Wiring.md` | ESP32 → SX1262 pinout |
| `Docs/Sensor_Calibration.md` | Sensor calibration procedures |
| `Docs/EndToEnd_Test_Procedure.md` | End-to-end test checklist |
| `Scripts/build_stm32.ps1` | PowerShell build script |
| `Scripts/flash_stm32.ps1` | PowerShell flash script |
| `common/lora_cfg.h` | Shared LoRa configuration |
| `Sender_station/sensor_fusion_transmit/sensor_fusion_transmit.ioc` | CubeMX configuration |
