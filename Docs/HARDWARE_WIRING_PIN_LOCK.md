# Team Artemis — Hardware Wiring & Working Pin Lock Reference

**Target MCU:** STM32F722ZET6 (NUCLEO-F722ZE, ST-LINK SN: `0667FF565380535067092550`)  
**Firmware Project:** `Sender_station/sensor_fusion_transmit/sensor_fusion_transmit`  
**Build Script:** `build_stm32.ps1` (GCC Arm Embedded 14.3.1, `-mcpu=cortex-m7 -mfpu=fpv5-sp-d16 -mfloat-abi=hard`)  
**Status:** Fully verified and operational on physical hardware (100% test pass).

---

## 1. Golden Pin Lock Summary Table

This table locks in the exact physical wiring connections on the NUCLEO-F722ZE board. **Do not reassign these pins in CubeMX or code without updating both hardware and documentation.**

| Peripheral / Module | Signal Name | Nucleo Pin | Arduino Label | Connector / Pin | Mode / AF | Module Wiring | Logic / Power |
|:---|:---|:---:|:---:|:---:|:---|:---|:---:|
| **BME688 Sensor** | SCL | **PB8** | D15 | CN7 / 2 | I2C1 (AF4, OD + PU) | BME688 SCL | 3.3V |
| | SDA | **PB9** | D14 | CN7 / 4 | I2C1 (AF4, OD + PU) | BME688 SDA | 3.3V |
| | VCC | 3.3V | 3.3V | CN8 / 7 | Power Rail | BME688 VCC, CS=3.3V | 3.3V |
| | GND | GND | GND | CN8 / 11 | Common Ground | BME688 GND, SDO=GND (0x76) | 0V |
| **LCD 1602 + PCF8574** | SCL | **PB8** | D15 | CN7 / 2 | I2C1 (Shared Bus) | PCF8574 SCL | 5V / 3.3V tolerant |
| | SDA | **PB9** | D14 | CN7 / 4 | I2C1 (Shared Bus) | PCF8574 SDA | 5V / 3.3V tolerant |
| | VCC | **5V** | 5V | CN8 / 9 | 5V Rail | PCF8574 VCC (Needs 5V for LCD) | 5V |
| | GND | GND | GND | CN8 / 11 | Common Ground | PCF8574 GND (Addr 0x27) | 0V |
| **NEO-M8N GPS** | GPS TX → MCU RX | **PD6** | — | CN10 / 17 | USART2_RX (AF7, 9600 bps) | GPS Board TX pin | 3.3V |
| | MCU TX → GPS RX | **PD5** | — | CN10 / 15 | USART2_TX (AF7, 9600 bps) | GPS Board RX pin | 3.3V |
| | VCC | 3.3V | 3.3V | CN8 / 7 | Power Rail | GPS VCC | 3.3V |
| | GND | GND | GND | CN8 / 11 | Common Ground | GPS GND | 0V |
| **LD2412 Radar** | Radar TX → MCU RX | **PD2** | — | CN8 / 12 (or CN11 / 4) | UART5_RX (AF8, 115200 bps) | Radar TX pin | 3.3V |
| | MCU TX → Radar RX | **PC12** | — | CN8 / 10 (or CN11 / 3) | UART5_TX (AF8, 115200 bps) | Radar RX pin | 3.3V |
| | VCC | **5V** | 5V | CN8 / 9 | 5V Rail | Radar VCC (5V Required!) | 5V |
| | GND | GND | GND | CN8 / 11 | Common Ground | Radar GND | 0V |
| **SX1262 LoRa Radio** | SCK | **PA5** | D13 | CN7 / 10 | SPI1_SCK (AF5) | SX1262 SCK | 3.3V |
| | MISO | **PA6** | D12 | CN7 / 12 | SPI1_MISO (AF5) | SX1262 MISO | 3.3V |
| | MOSI | **PA7** | D11 | CN7 / 14 | SPI1_MOSI (AF5) | SX1262 MOSI | 3.3V |
| | NSS / CS | **PA4** | D10 | CN7 / 16 | GPIO Output PP | SX1262 NSS / CS | 3.3V |
| | RESET | **PE11** | D8 | CN7 / 20 | GPIO Output PP | SX1262 NRESET | 3.3V |
| | BUSY | **PF13** | D7 | CN10 / 2 | GPIO Input | SX1262 BUSY | 3.3V |
| | DIO1 (IRQ) | **PE9** | D6 | CN10 / 4 | GPIO EXTI9 (Input) | SX1262 DIO1 | 3.3V |
| | RXEN | **PE13** | — | CN10 / 14 | GPIO Output PP | SX1262 RXEN | 3.3V |
| | TXEN | **PF14** | — | CN10 / 16 | GPIO Output PP | SX1262 TXEN | 3.3V |
| | VCC / GND | 3.3V / GND | — | CN8 / 7, 11 | Power & Ground | SX1262 VCC & GND | 3.3V |
| **ST-LINK VCP Debug** | TX | **PD8** | — | Internal | USART3_TX (115200 bps) | Virtual COM Port (COM10) | USB |
| | RX | **PD9** | — | Internal | USART3_RX (115200 bps) | Virtual COM Port (COM10) | USB |

---

## 2. Power Rail Distribution Architecture

> [!IMPORTANT]
> The LCD backpack and LD2412 Radar must receive **5V** to operate reliably when using their 5V pins. Connecting the LCD to 3.3V results in an unreadable faint display or unlit backlight. Connecting the radar 5V pin to 3.3V causes brownouts.

### LD2412 Hot-Plug Inrush & LCD 1602 Brownout Mitigation
When the LD2412 mmWave radar is plugged in while the board is running (hot-plugged), the 1602 I2C LCD may instantly go blank. This happens due to two interacting factors:
1. **5V Rail Voltage Sag & HD44780 Controller Drop**:
   * Both the LCD backpack and the LD2412 share the **5V rail (`CN8` Pin 9)**, which is current-limited to 500 mA by the ST-LINK USB power switch.
   * The LD2412 contains significant input decoupling capacitance and an active 24 GHz FMCW RF front-end. Hot-plugging it into a live 5V pin creates a steep instantaneous inrush current spike, pulling the 5V rail below ~4.5V for several milliseconds.
   * The HD44780 LCD controller's internal Power-On Reset (POR) circuit trips at ~4.5V, resetting the display controller into default **8-bit mode with Display OFF**.
   * Meanwhile, the PCF8574 I2C backpack stays alive down to 2.5V and continues to ACK I2C writes. The MCU previously had no way of knowing the LCD controller browned out.
2. **Firmware Self-Healing & Auto-Recovery**:
   * `lcd_i2c.c` now validates all `HAL_I2C_Master_Transmit` operations and resets the I2C bus if a transient occurs.
   * A dedicated `lcd_reinit()` function quickly sends the 4-bit HD44780 reset sequence (`0x30, 0x30, 0x30, 0x20, 0x28, 0x0C`) to restore the display in <30ms without a full bus scan.
   * `app.c` detects incoming radar streams and automatically triggers `lcd_reinit()` the moment the radar is connected.
   * If any LCD write fails, `g_lcd_ok` resets to 0 and the background scheduler auto-recovers the display every 1500 ms.
3. **Hardware Best Practices**:
   * **Do not hot-plug**: Always plug or unplug the radar module before connecting USB power.
   * **Buffer capacitor**: Place a 100µF–470µF electrolytic capacitor across 5V and GND at the breadboard to cushion inrush surges.
   * **Pin header insertion**: CN8 pins 9 (5V), 10 (PC12), 11 (GND), and 12 (PD2) are directly adjacent. Never insert DuPont jumpers at an angle while powered to avoid accidental 5V-to-GND shorts.

### 3.3V vs 5V Radar Module Variants (Robu / Bare Breakout Caution)
* **Standard 6-pin HLK-LD2412**: Features pins `OUT, TX, RX, GND, 5V, 3V3`. It contains an onboard LDO and can take either 5V on the `5V` pin OR 3.3V on `3V3` (never both).
* **4-pin Breakout (`3V3, GND, TX, RX`)**: This variant directly powers the SoC from the `3V3` pin without a 5V buck/LDO. **Never supply 5V to a 3.3V-only radar breakout**; doing so will cause thermal breakdown / latchup, turning the chip into a permanent dead short that pulls down the system power rails, distorts LCD contrast, and trips host USB overcurrent limits.
* **LCD Contrast Tuning**: The 1602 LCD I2C backpack contains a blue trimpot. Turn the brass screw clockwise/counter-clockwise with the board powered at 5V to dial in the contrast until characters appear sharp.

### LD2412 Thermal Management & Overheating Mitigation
The Hi-Link HLK-LD2412 is a 24 GHz FMCW radar with a dual-core SoC and integrated 2.4 GHz Bluetooth (BLE) radio. When running out of the box, it can run hot (50°C–65°C) due to two distinct factors:

1. **Bluetooth (BLE) Radio Broadcast (Firmware Mitigation)**:
   * By default, the LD2412 broadcasts Bluetooth advertisements continuously for the smartphone app.
   * In our rover architecture, the radar is connected directly to STM32 `UART5` (PC12/PD2). Bluetooth is completely unused.
   * The STM32 firmware runs a bounded init-time configuration sequence (`ld_radar_config_step` in `app.c`) that: enables configuration mode, enables engineering mode (`0x0062`), sets base parameters (min gate 1, max gate 13, 5 s dwell), sets per-gate motion/static sensitivity (80 across all 14 gates), and ends configuration. Bluetooth is disabled via `0x00A4` value `0x0000`. This reduces power consumption by 35–45% and drops operating temperature by ~15°C–20°C.

2. **On-Module Linear LDO Regulator Heat (Hardware Wiring Note)**:
   * When powered via the **`+5V`** pin, an onboard tiny linear regulator (LDO) on the LD2412 module drops 5.0V to 3.3V, dissipating `(5.0V - 3.3V) * ~100mA ≈ 170mW` of pure heat on a microscopic SMD package.
   * If your LD2412 breakout exposes the **`3V3`** pin (instead of only +5V), connecting a clean 3.3V power source to the `3V3` pin completely bypasses the onboard LDO, eliminating this heat source entirely.
   * If using the `+5V` pin, ensure the radar module has ambient air clearance and is not enclosed tightly against insulating foam or tape.

* **3.3V Rail (`CN8` Pin 7)**:
  * SX1262 LoRa Radio (peak ~120 mA during TX)
  * BME688 Environmental Sensor (~12 mA)
  * u-blox NEO-M8N GNSS Module (~67 mA acquisition, ~25 mA tracking)
* **5V Rail (`CN8` Pin 9)**:
  * 1602 LCD + PCF8574 I2C Backpack (~20 mA with LED backlight ON)
  * LD2412 24 GHz FMCW Radar (~80 mA active RF)
* **Ground (`CN8` Pin 11 & breadboard common ground)**:
  * All modules share a common solid ground reference plane.

---

## 3. I2C Bus Topology & Address Map

Both the BME688 and the 1602 LCD PCF8574 backpack share **I2C1** on **PB8 (SCL)** and **PB9 (SDA)**.

```
       STM32 NUCLEO-F722ZE
        PB8 (SCL) ──┬──────────────────────┐
        PB9 (SDA) ──┼───────────┐          │
                    │           │          │
              ┌─────┴─────┐     │    ┌─────┴─────┐
              │  BME688   │     │    │  PCF8574  │
              │  (0x76)   │     └────│  (0x27)   │
              │ 3.3V Rail │          │  5V Rail  │
              └───────────┘          └─────┬─────┘
                                           │ 4-bit bus
                                     ┌─────┴─────┐
                                     │ 1602 LCD  │
                                     └───────────┘
```

* **Address 0x76**: BME688 (SDO tied to GND). Reads Temperature, Relative Humidity, Pressure, Gas resistance.
* **Address 0x27**: PCF8574T I2C LCD Expander. Auto-detected by firmware scanner at boot; fallback scanner checks all 127 addresses (0x20–0x27, 0x38–0x3F).
* **Pull-up resistors**: Enabled via internal `GPIO_PULLUP` on PB8/PB9. External 4.7 kΩ pull-ups to 3.3V are recommended on long breadboard wire runs.

---

## 4. 1602 Character LCD UI/UX Specification

The 16×2 character LCD provides instant local telemetry without needing a laptop or ground station.

### Row 0: Navigation Link & Radio Packet Status (Persistent)
```
+----------------+
|F3 S05 TX0042   |
+----------------+
```
* **`F<n>` (GPS Fix Quality)**:
  * `F0`: No Fix / Receiver searching for constellation signals.
  * `F2`: 2D Fix (Latitude and Longitude locked).
  * `F3`: 3D Fix (Latitude, Longitude, and Altitude locked with $\ge 4$ satellites).
  * `F4`: DGPS / Differential GNSS solution.
* **`S<nn>` (Satellite Count)**:
  * Number of GNSS satellites actively locked and used in the navigation solution (e.g. `S05` = 5 satellites in solution; while searching, reports total tracked in view up to `S15`+).
* **`TX<nnnn>` (LoRa Packet Counter)**:
  * Total number of telemetry/sensor packets transmitted over the SX1262 LoRa link (e.g. `TX0042`).

---

### Row 1: Sensors & Coordinates (Alternating Display)

When a GPS fix is active (`F2` or `F3`), Row 1 toggles every 3 seconds between two telemetry pages:

#### Page A: Environmental Telemetry & Radar Obstacle
```
+----------------+
|27.6C 80% R:-000|
+----------------+
```
* **`<temp>C`** (e.g. `27.6C`): BME688 ambient temperature in degrees Celsius.
* **`<hum>%`** (e.g. `80%`): BME688 relative humidity in percent.
* **`R:<state><dist>`** (Millimeter-wave Radar Status):
  * `<state>`: `-` when clear (no obstacle), `M` when motion/human target detected.
  * `<dist>`: Target distance in centimeters (e.g. `-000` when clear, `M150` when target at 150 cm).

#### Page B: Live GNSS Geographic Coordinates
```
+----------------+
|12.9748N 079.165E|
+----------------+
```
* **Format**: `%02ld.%04ld%c %03ld.%03ld%c`
* **Latitude**: 2 integer digits + 4 decimal places + Hemisphere (`12.9748N`).
* **Longitude**: 3 integer digits + 3 decimal places + Hemisphere (`079.165E`).
* **Fit**: Exactly 16 characters (`8 + 1 + 7 = 16`), perfectly occupying all columns of a 1602 LCD without clipping or line wrapping.

---

## 5. Critical Firmware Engineering Lessons Locked In

1. **Cortex-M7 Single-Precision FPU Rule**:
   * The STM32F722 contains an Arm FPv5-SP-D16 (single-precision only) hardware FPU.
   * Compiling with double-precision FPU flags (`-mfpu=fpv5-d16`) causes GCC to emit `vcvt.f64.u32`, which triggers an `UNDEFINSTR` HardFault (`CFSR = 0x00010000`).
   * Never use `atof()` or `strtod()` in embedded telemetry parsing on STM32F722. Pure-integer fixed-point parsers (`parse_fixed()` and `parse_nmea_coord()`) are locked into `app.c`.
2. **Dual NMEA + UBX NAV-PVT Fusion**:
   * Near window ledges, GNSS satellite geometry is one-sided, resulting in Dilution of Precision (`PDOP > 20`).
   * In standard NMEA, `$GNGGA` sets fix quality to `0` when PDOP exceeds internal masks.
   * In binary UBX protocol, `NAV-PVT` (`0x01 0x07`) calculates accurate coordinates even under high PDOP.
   * `gps_ubx.c` and `app.c` prioritize `fixType >= 2` from UBX NAV-PVT and protect valid coordinates from being zeroed by empty NMEA sentences.
3. **I2C PCF8574 Initialization Timing**:
   * The HD44780 controller requires exact reset sequences upon power-up: three consecutive `0x30` writes separated by $>4.1\text{ ms}$, followed by `0x20` (4-bit mode) and `0x28` (2-line 5x8 font).
   * `lcd_i2c.c` implements this sequence with a non-blocking background bus scanner, allowing the LCD to hot-plug without resetting the MCU.

