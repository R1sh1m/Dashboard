# ESP32 Receiver — SX1261 LoRa Module Wiring

## Physical Connections

| ESP32 GPIO | SX1261 Pin | Function | Connected? |
|------------|------------|----------|------------|
| GPIO5 | NSS / CS | Chip Select | ✅ |
| GPIO18 | SCK / CLK | SPI Clock | ✅ |
| GPIO23 | MOSI | SPI Master Out Slave In | ✅ |
| GPIO19 | MISO | SPI Master In Slave Out | ✅ |
| GPIO14 | RESET | Radio Reset | ✅ |
| **GPIO13** | **BUSY** | Radio Busy | ✅ |
| **GPIO4** | **DIO1** | Radio Interrupt | ✅ |
| GPIO25 | TXEN | Antenna Switch TX Enable | ❌ Not connected |
| GPIO33 | RXEN | Antenna Switch RX Enable | ❌ Not connected |

## Notes

- **DIO2 / TXEM / RXEM**: Not connected to anything. The firmware uses `LORA_USE_RXTX_PINS=1` but TXEN/RXEN GPIOs are configured as outputs and driven low (RX mode) — they do not affect operation when unconnected.
- **BUSY** was originally defined as GPIO27 in the firmware but the physical wiring uses GPIO13. The firmware was updated to match (`PIN_BUSY GPIO_NUM_13`).
- **DIO1** was originally defined as GPIO26 in the firmware but the physical wiring uses GPIO4. The firmware was updated to match (`PIN_DIO1 GPIO_NUM_4`).
- SPI bus: SPI2_HOST at 2 MHz, mode 0, CS kept active between command and data phases.
- Console UART: GPIO1 (TX) / GPIO3 (RX) at 115200 baud.

## Firmware Pin Definitions

See `esp_receiver/main/lora_radio.c` lines 27-35 for the current GPIO pin definitions used by the build.

## Build & Flash

```powershell
$env:IDF_PATH="C:\esp\v6.0.2\esp-idf"
& "C:\esp\v6.0.2\esp-idf\export.ps1"
cd "C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard\esp_receiver"
idf.py -p COM3 flash monitor
```
