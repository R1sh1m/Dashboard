# End-to-End LoRa Test Procedure

**Goal:** Verify STM32 TX → LoRa RF → ESP32 RX → USB-CDC → React Dashboard

## Prerequisites

- [ ] STM32CubeIDE installed
- [ ] STM32 firmware built (`Scripts/build_stm32.ps1`)
- [ ] STM32 flashed (`Scripts/flash_stm32.ps1 -Approve`)
- [ ] ESP32 firmware built and flashed to COM3 (already done)
- [ ] React dashboard running (`npm run dev` → http://localhost:5173)
- [ ] Serial terminal available (PuTTY, Tera Term, or `python -m serial.tools.miniterm`)

## Step 1: Verify STM32 Startup

1. Connect STM32 via USB (ST-LINK virtual COM port)
2. Open serial terminal at 115200 baud on the ST-LINK COM port
3. Reset the board
4. **Expected output:**
   ```
   Artemis TX start
   BME688 ok
   SX1262 ok
   ```
5. **If FAIL:** Check `lora_radio.h` LoRa config, BME688 I2C pull-ups, SPI wiring

## Step 2: Verify STM32 Telemetry Transmission

1. Leave serial terminal open
2. Wait ~15 seconds (TELEM_MS period)
3. **Expected:** Periodic telemetry packet lines appear
4. **If no output:** Check USART2 (GPS) / UART5 (Radar) sensor drivers, LoRa TX power, antenna connection

## Step 3: Verify ESP32 LoRa Reception

1. Connect ESP32 via USB-C (COM3)
2. Open serial monitor: `python -m serial.tools.miniterm COM3 115200`
3. **Expected startup:**
   ```
   artemis_rx: Artemis Ground Receiver booting...
   lora_radio: SX126x radio initialized
   artemis_rx: Radio in continuous RX mode
   artemis_rx: Ground bridge initialized
   ```
4. Power on STM32 transmitter
5. **Expected:** JSON lines appear on ESP32 serial output when LoRa packets arrive
6. **If no JSON:** Verify frequency (865.4025 MHz), SF9, BW125, CR4/5, sync=0x12 match on both sides

## Step 4: Verify JSON Matches TelemetryPacket Schema

1. Capture JSON lines from ESP32 serial output
2. Compare against `TelemetryPacket` interface in `src/services/webSerial.ts`
3. **Required fields:** Check all mandatory fields are present and correctly typed
4. **If mismatch:** Update `ground_bridge.c` JSON emission or `webSerial.ts` parsing

## Step 5: Verify Dashboard Reception

1. Open http://localhost:5173
2. Click **Connect** in the Wireless Link card
3. Select the ESP32 serial port (COM3)
4. **Expected:** Telemetry cards populate with live sensor data
5. **If no data:** Verify USB-CDC port selection, baud rate (115200), newline-delimited JSON

## Step 6: Verify USART6 Link (STM32 → ESP32)

1. Connect ESP32 UART TX → STM32 PG9, ESP32 UART RX → STM32 PG14
2. Enable USART6 in STM32CubeMX (.ioc), regenerate code, rebuild, reflash
3. Monitor ESP32 serial for USART6-received telemetry
4. **Expected:** ESP32 receives telemetry from STM32 over USART6 in addition to LoRa RF

## Step 7: Full End-to-End Validation

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| STM32 startup messages | ☐ | `Artemis TX start`, `BME688 ok`, `SX1262 ok` |
| STM32 periodic telemetry | ☐ | Packets every ~15s |
| ESP32 LoRa init | ☐ | Radio initialized, continuous RX mode |
| ESP32 JSON output | ☐ | Newline-delimited JSON on COM3 |
| JSON schema match | ☐ | Matches `TelemetryPacket` interface |
| Dashboard connection | ☐ | Wireless Link card connects to COM3 |
| Dashboard data display | ☐ | Telemetry cards populate |
| USART6 link (optional) | ☐ | ESP32 receives STM32 telemetry over USART6 |

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| No LoRa packets | Frequency/SF/BW mismatch | Verify `common/lora_cfg.h` matches on both sides |
| CRC failures | SPI wiring, clock too fast | Check NSS/RESET/BUSY pins, reduce SPI to 2 MHz |
| BME688 FAIL | Missing pull-ups, wrong I2C pins | Add 4.7kΩ pull-ups, verify PB6/PB9 |
| GPS no fix | Wrong baud, no sky view | Verify UART4=9600, antenna outdoors |
| Radar no detection | Wrong baud, 3.3V instead of 5V | Verify UART5=115200, power radar with 5V |
| ESP32 monitor crashes | cp1252 encoding | Use `python -m serial.tools.miniterm COM3 115200` |
| Dashboard no data | Wrong port, baud, or JSON format | Verify port selection, 115200 baud, newline-delimited JSON |

## Test Report Template

```json
{
  "test_date": "2026-11-06",
  "board": "NUCLEO-F722ZE",
  "mcu": "STM32F722ZET6",
  "firmware_version": "0.1.0",
  "stm32_startup": "PASS/FAIL",
  "stm32_telemetry": "PASS/FAIL",
  "esp32_lora_init": "PASS/FAIL",
  "esp32_json_output": "PASS/FAIL",
  "json_schema_match": "PASS/FAIL",
  "dashboard_connection": "PASS/FAIL",
  "dashboard_data": "PASS/FAIL",
  "usart6_link": "PASS/FAIL/N/A",
  "overall": "PASS/FAIL",
  "notes": ""
}
```
