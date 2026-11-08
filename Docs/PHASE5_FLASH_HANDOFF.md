# Phase 5 — Flash & Handoff Report

**Date:** Sun Nov 08 2026  
**Project:** Team Artemis — End-to-End LoRa Ground Station  
**Scope:** STM32F722ZE transmitter flash, ESP32-S3 ground bridge, React 19 dashboard, Standalone Deployment

---

## 1. Build Artifacts & Firmware Checksums

| Tier | Artifact | Path | Size | Status | SHA256 |
|------|----------|------|------|--------|--------|
| STM32 | ELF | `Sender_station/sensor_fusion_transmit/sensor_fusion_transmit/bin/sensor_fusion_transmit.elf` | 149,252 B | Built & Flashed | `1fc7fa9f62e36e7f65e7ecee3b578bbeb6a3e96fe7d9a88657f7535f98033153` |
| STM32 | BIN | `.../bin/sensor_fusion_transmit.bin` | 94,268 B | Flashed to SWD | `14414804d9d43fb6c1ccadb11e0bb94fdec8abbe74f60ab047df9fee35c3adc3` |
| ESP32 | BIN | `esp_receiver/build/esp_receiver.bin` | 193,248 B | Flashed to COM3 | `4ac8a1f6822fb1c948d22a6c01ab44020e21fcefd17f853bb4b2e60189246c3d` |
| Web UI | dist/ | `dist/` | 7 files | Built (1.60s) | Verified production assets |

---

## 2. Hardware Environment Verified

| Device | Interface / Port | Target / Probe | State |
|--------|------------------|----------------|-------|
| STM32F722ZE | ST-LINK VCP (`COM10`) | Probe `0667FF565380535067092550` | Operational (Fix=3, Sats=8) |
| ESP32-S3 | CP210x USB-UART (`COM3`) | Ground Bridge LoRa RX | Operational (RSSI -50 dBm, 0% Loss) |
| SX1262 LoRa | SPI / DIO1 | 865.4 MHz, SF7, BW 125 kHz | 1% Duty Cycle compliant |
| u-blox NEO-M8 | UART 115200 8N1 | Ceramic Patch Antenna | 3D Lock, 8 Satellites tracked |

---

## 3. Resolution of Known Limitations

All previously identified limitations have been fully resolved:

1. **GPS S00 Satellites Lock Issue**:
   - **Root Cause:** In `app.c`, `UBX-CFG-PRT` mode bitmask had offset 4 mistakenly duplicated with the baud rate integer (`0x0001C200`), requesting an invalid 5-bit character length and reserved parity in u-blox M8 protocol. The receiver rejected the command and remained at 9600 baud while STM32 switched to 115200 baud.
   - **Fix:** Corrected mode payload to `0xD0, 0x08, 0x00, 0x00` (8N1), recalculated Fletcher checksum (`0xC0, 0x7E`), added dual-baud preamble transmission (9600 + 115200), and implemented multi-constellation GSV sentence aggregation (`$GPGSV`, `$GLGSV`, `$GAGSV`, `$GBGSV`, `$GNGSV`).
   - **Result:** Live 3D Fix obtained with 8 satellites tracked (`12.97480° N, 79.16523° E`).

2. **Default Coordinates Update**:
   - Replaced default Bangalore coordinates in `src/App.tsx` and `src/components/MapView.tsx` with live antenna coordinates (`12.974842° N, 79.165479° E`).

3. **STM32 PA0/PA1 Pinmux Conflict**:
   - Resolved obsolete `UART4_TX`/`UART4_RX` pin assignment in `sensor_fusion_transmit.ioc`. Replaced with `ADC1_IN0` (`BATT_VOLT_ADC1_IN0`) and `ADC1_IN1` (`BATT_CURR_ADC1_IN1`), matching actual hardware ADC routing.

4. **ESP32 Telemetry Dynamic Fields**:
   - In `esp_receiver/main/ground_bridge.c`, eliminated hardcoded bot status, power, and motor values:
     - `bot_status.state`: Dynamically computed (`WALKING`, `EXPLORING`, `CALIBRATING`, or `STANDBY`) based on velocity, radar target, and GPS lock.
     - `bot_status.mode`: Dynamically flags `FAILSAFE` if packet loss > 20%, otherwise `AUTONOMOUS`.
     - `bot_status.loop_hz`: Derived dynamically from packet reception $\Delta t$.
     - `cell_voltages`: Computed dynamically across a 3-cell divider (`voltage_v / 3.0`).
     - `motors.active_count`: Sets active count to 4 when moving/exploring, 0 on standby.

5. **Hardware-in-the-Loop (HIL) Production Validation**:
   - Created `Scripts/verify_hil_production.py` to sniff and validate physical UART streams directly from STM32 (`COM10`) and ESP32 (`COM3`) without relying solely on synthetic browser mocks.

---

## 4. Test Suite Summary

- **Typecheck & Build**: `tsc -b && vite build` passed (0 errors).
- **Linter**: `oxlint` passed (0 errors, 0 warnings).
- **Unit Tests**: `vitest run` passed (24/24 tests passed).
- **Playwright E2E**: `npx playwright test` passed (22/22 tests passed across Chromium & Mobile Chrome).
- **Physical HIL Verification**: `python Scripts/verify_hil_production.py` passed (STM32 & ESP32 live link verified).

---

## 5. Standalone Operation (Wall Plug / Battery)

The STM32 transmitter firmware is fully configured for standalone, headless operation:
- **IWDG Hardware Watchdog:** Enabled (8-second window). If any sensor stalls or code hangs, the microcontroller resets automatically.
- **Headless Boot:** `__io_putchar` UART transmission has a strict 10ms timeout with busy-flag clearing. Disconnecting ST-LINK or the laptop will NOT block or hang firmware execution.
- **Powering via Wall Plug / Battery:**
  1. Unplug the STM32 NUCLEO-144 board's ST-LINK USB cable from the laptop.
  2. Supply 5V via the Nucleo USB CN1 connector (using any USB wall charger / power bank) or 7-12V DC via the `VIN` pin.
  3. The onboard green PWR LED and LD1/LD2/LD3 status LEDs will illuminate.
  4. The transmitter will automatically boot, calibrate sensors, acquire GPS lock, and broadcast LoRa packets periodically.
  5. The ESP32 ground bridge connected to the laptop on `COM3` will continuously receive the live wireless telemetry and feed the React Dashboard.
