# LoRa (SX1262) → STM32 Connection Table

| SX1262 Pin | CN Connector | Pin Number | STM32 GPIO | Function |
|---|---|---|---|---|
| **SCK** (SPI clock) | CN7 | 10 | **PA5** | SPI1_SCK |
| **MISO** (Master In Slave Out) | CN7 | 12 | **PA6** | SPI1_MISO |
| **MOSI** (Master Out Slave In) | CN7 | 14 | **PA7** | SPI1_MOSI |
| **NSS / CS** (Chip Select) | CN7 | 16 | **PA4** | SPI1 Chip Select |
| **RESET** (active low) | CN7 | 20 | **PE11** | SX1262 NRESET |
| **BUSY** (module busy status) | CN10 | 2 | **PF13** | GPIO Input |
| **DIO1 (IRQ)** (radio interrupt) | CN10 | 4 | **PE9** | GPIO EXTI9_5 |
| **RXEN** (RF switch receive enable) | CN10 | 14 | **PE13** | GPIO Output PP |
| **TXEN** (RF switch transmit enable) | CN10 | 16 | **PF14** | GPIO Output PP |
| **VCC / GND** (Power & Ground) | CN8 | 7, 11 | **3.3V / GND** | Power & Ground |

**SPI bus**: SPI1 master on pins PA5(SCK), PA6(MISO), PA7(MOSI) with PA4 as NSS/CS.

**Control pins**:
- **PE9 (DIO1)**: Configured with pull-down, mapped to EXTI9_5 IRQ handler
- **PE13** and **PF14**: Drive RF switch for antenna RX/TX selection
- **PF13**: Reads SX1262 BUSY status pin

*Source: Docs/HARDWARE_WIRING_PIN_LOCK.md, Docs/STM32_Sender.md, sensor_fusion_transmit.ioc*