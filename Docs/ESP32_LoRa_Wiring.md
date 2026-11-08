# ESP32 Receiver — SX1262 LoRa Module Wiring

## Physical Connections

| ESP32 GPIO | SX1262 Pin | Function | Connected? |
|------------|------------|----------|------------|
| GPIO5 | NSS / CS | Chip Select | ✅ |
| GPIO18 | SCK / CLK | SPI Clock | ✅ |
| GPIO23 | MOSI | SPI Master Out Slave In | ✅ |
| GPIO19 | MISO | SPI Master In Slave Out | ✅ |
| GPIO14 | RESET | Radio Reset | ✅ |
| **GPIO13** | **BUSY** | Radio Busy | ✅ |
| **GPIO4** | **DIO1** | Radio Interrupt | ✅ |
| GPIO25 | TXEN | Antenna Switch TX Enable | Optional (Driven LOW by firmware) |
| GPIO33 | RXEN | Antenna Switch RX Enable | Connect to 3.3V or GPIO33 (HIGH) |

## Notes

- **Oscillator (TCXO)**: The module uses a 32 MHz TCXO powered via DIO3. The firmware automatically enables 1.8V on DIO3 and calibrates the RF/PLL blocks.
- **RF Antenna Switch (RXEN/TXEN)**: The breakout module separates the RF switch control onto dedicated `RXEN` and `TXEN` header pins. For continuous ground reception, `RXEN` must be connected to 3.3V (or GPIO33, which firmware drives HIGH) to connect the antenna to the SX1262 RF input.
- **BUSY**: Connected to GPIO13 (`PIN_BUSY GPIO_NUM_13`).
- **DIO1**: Connected to GPIO4 (`PIN_DIO1 GPIO_NUM_4`).
- SPI bus: SPI2_HOST at 2 MHz, mode 0. CS on GPIO5.
- Console UART: GPIO1 (TX) / GPIO3 (RX) at 115200 baud.

## Firmware Pin Definitions

See `esp_receiver/main/lora_radio.c` lines 27-35 for the current GPIO pin definitions used by the build.

## Build & Flash

```powershell
$env:IDF_PATH="C:\esp\v6.0.2\esp-idf"
& "C:\esp\v6.0.2\esp-idf\export.ps1"
cd esp_receiver
idf.py -p COM3 flash monitor
```
