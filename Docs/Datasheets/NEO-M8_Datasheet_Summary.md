# u-blox NEO-M8 Concurrent GNSS Module — Technical Datasheet Reference
**Document Reference**: UBX-15031086 (u-blox M8 concurrent GNSS modules Data sheet)  
**Hardware Target**: STM32F722ZET6 (NUCLEO-F722ZE) Sensor Fusion Transmit Station  
**Target Driver**: `Core/Src/gps_ubx.c`, `Core/Inc/gps_ubx.h`, `App/Src/app.c`

---

## 1. Executive Summary & Architecture

The NEO-M8 is a concurrent GNSS module capable of simultaneous reception from up to 3 GNSS constellations (GPS, Galileo, GLONASS, BeiDou). It is backward compatible with NEO-7, NEO-6, and NEO-5 form factors.

- **GNSS Engine**: 72-channel u-blox M8 engine
- **Concurrent Tracking**:
  - GPS / QZSS L1 C/A (1575.42 MHz)
  - GLONASS L10F (1602 MHz + $k \times 562.5$ kHz)
  - BeiDou B1 (1561.098 MHz)
  - Galileo E1B/C (1575.42 MHz)
- **Position Accuracy**: 2.5 m CEP (Autonomous GPS/GLONASS)
- **Max Navigation Update Rate**:
  - Single GNSS (GPS only): Up to 18 Hz
  - Concurrent GNSS (GPS + GLONASS): Up to 10 Hz
- **Timepulse (1PPS)**: Configurable 0.25 Hz to 10 MHz (Default: 1 Hz synchronized to GPS/UTC)

---

## 2. Hardware Interface & Electrical Specifications

### 2.1 Power Supply & Logic Levels
| Parameter | Symbol | Min | Typ | Max | Units | Notes |
|:---|:---|:---:|:---:|:---:|:---:|:---|
| Supply Voltage | `VCC` | 2.7 | 3.0 / 3.3 | 3.6 | V | Operational limit |
| Digital I/O Voltage | `VCC_IO` | 1.65 | 3.0 / 3.3 | 3.6 | V | Direct 3.3V STM32 GPIO compatibility |
| Backup Supply | `V_BCKP` | 1.4 | 3.0 | 3.6 | V | Powers RTC & BBRAM during VCC loss |
| Digital Input High | $V_{IH}$ | $0.7 \times VCC$ | — | $VCC + 0.5$ | V | Active high logic |
| Digital Input Low | $V_{IL}$ | 0 | — | $0.2 \times VCC$ | V | Active low logic |
| Peak Current | $I_{CC}$ | — | 67 | 100 | mA | During acquisition (3.0V) |
| Tracking Current | $I_{CC}$ | — | 21 | — | mA | Continuous tracking (3.0V) |

### 2.2 Pinout Assignment (24-pin LCC)
| Pin # | Pin Name | I/O | Description | STM32 Interconnect |
|:---:|:---|:---:|:---|:---|
| **1** | `SAFEBOOT_N` | I | Safeboot active-low input (service only) | Leave floating (internal pull-up) |
| **2** | `D_SEL` | I | Interface select (`1` or open = UART + DDC; `0` = SPI) | Leave floating (internal pull-up) |
| **3** | `TIMEPULSE` | O | Configurable 1PPS time pulse | Optional timer capture input |
| **4** | `EXTINT` | I | External interrupt input (wake / time-mark) | Optional STM32 EXTI |
| **7** | `VDD_USB` | I | USB supply (bus powered) | Connect to GND if USB unused |
| **8** | `RESET_N` | I | Active-low system reset | Optional STM32 GPIO / Open-drain |
| **9** | `VCC_RF` | O | LNA output voltage (filter supply) | Connected to antenna bias circuit |
| **10, 12, 13** | `GND` | — | Ground reference | System Ground Plane |
| **11** | `RF_IN` | I | 50 $\Omega$ passive or active antenna input | External GNSS Antenna |
| **18** | `SDA / SPI_CS_N` | I/O | DDC (I2C) Data or SPI CS | Optional I2C data |
| **19** | `SCL / SPI_CLK` | I/O | DDC (I2C) Clock or SPI CLK | Optional I2C clock |
| **20** | `TXD / SPI_MISO` | O | **UART TX (Serial Out)** | **STM32 USART2_RX (`PD6`) / UART4_RX (`PC11`)** |
| **21** | `RXD / SPI_MOSI` | I | **UART RX (Serial In)** | **STM32 USART2_TX (`PD5`) / UART4_TX (`PC10`)** |
| **22** | `V_BCKP` | I | Backup battery supply | Coin cell / Supercapacitor / 3.3V |
| **23** | `VCC` | I | Main 3.3V DC power supply | Regulated 3.3V Rail |

---

## 3. Communication Protocols & UART Configuration

### 3.1 Factory Default Port Settings
- **Interface**: UART
- **Baudrate**: **9600 bps** (Configurable: 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800)
- **Data Bits**: 8
- **Parity**: None (`N`)
- **Stop Bits**: 1 (`1`)
- **Flow Control**: None
- **Autobauding**: Disabled by default
- **Default Output Stream**:
  - Activated NMEA 0183 messages: `$GNGGA`, `$GNGLL`, `$GNGSA`, `$GPGSV`, `$GLGSV`, `$GNRMC`, `$GNVTG`, `$GNTXT`
  - UBX binary messages are **supported and enabled by default on input**, accepting interleaved NMEA and UBX frames without explicit protocol switching!

---

## 4. UBX Binary Protocol Specification

### 4.1 UBX Frame Structure
All UBX packets follow an identical 8-byte overhead framing format:

```
+---------+---------+---------+---------+----------------+--------------+------------------+
| Sync 1  | Sync 2  | Class   | ID      | Length (Little)| Payload      | Checksum (CK_A/B)|
| 0xB5    | 0x62    | 1 byte  | 1 byte  | 2 bytes        | L bytes      | 2 bytes          |
+---------+---------+---------+---------+----------------+--------------+------------------+
```

1. **Sync Characters**:
   - Byte 0: `0xB5` (ASCII `µ`)
   - Byte 1: `0x62` (ASCII `b`)
2. **Class (1 byte)**:
   - `0x01` (`NAV`): Navigation results (position, velocity, time, DOP)
   - `0x02` (`RXM`): Receiver manager messages
   - `0x04` (`INF`): Informational messages
   - `0x05` (`ACK`): Ack/Nack responses to configuration commands
   - `0x06` (`CFG`): Configuration messages
   - `0x0A` (`MON`): Monitoring messages
3. **Message ID (1 byte)**: Specific message within the class (e.g., `0x07` = `NAV-PVT`).
4. **Length (2 bytes, unsigned 16-bit little-endian)**: Byte count of the `Payload` only (excludes sync, class, ID, length, and checksum).
5. **Payload**: $L$ bytes of structured binary data.
6. **Checksum (2 bytes)**: 8-bit Fletcher checksum (RFC 1145) calculated over `Class`, `ID`, `Length`, and `Payload`.

### 4.2 Fletcher-8 Checksum Algorithm
```c
void ubx_checksum(const uint8_t *data, uint16_t len, uint8_t *ck_a, uint8_t *ck_b) {
    uint8_t a = 0;
    uint8_t b = 0;
    for (uint16_t i = 0; i < len; i++) {
        a = (uint8_t)(a + data[i]);
        b = (uint8_t)(b + a);
    }
    *ck_a = a;
    *ck_b = b;
}
```

### 4.3 Key UBX Message: `UBX-NAV-PVT` (Class `0x01`, ID `0x07`, Length 92 bytes)
The primary navigation message used by the Artemis robot firmware:
- `iTOW` (Offset 0, `uint32_t`): GPS Time of Week (ms)
- `year`, `month`, `day`, `hour`, `min`, `sec` (Offsets 4-10): UTC Date and Time
- `valid` (Offset 11, `uint8_t`): Validity flags (`0x01` = validDate, `0x02` = validTime, `0x04` = fullyResolved)
- `fixType` (Offset 20, `uint8_t`):
  - `0`: No Fix
  - `1`: Dead Reckoning only
  - `2`: 2D Fix
  - `3`: 3D Fix
  - `4`: GNSS + Dead Reckoning
  - `5`: Time only fix
- `flags` (Offset 21, `uint8_t`): `0x01` = gnssFixOK
- `numSV` (Offset 23, `uint8_t`): Number of satellites used in navigation solution
- `lon` (Offset 24, `int32_t`): Longitude (degrees $\times 10^7$, divide by $1e7$ to get float/double)
- `lat` (Offset 28, `int32_t`): Latitude (degrees $\times 10^7$, divide by $1e7$ to get float/double)
- `height` (Offset 32, `int32_t`): Height above ellipsoid (mm)
- `hMSL` (Offset 36, `int32_t`): Height above mean sea level (mm)
- `gSpeed` (Offset 60, `int32_t`): Ground speed (2D) in mm/s (divide by 1000 for m/s)
- `headMot` (Offset 64, `int32_t`): Heading of motion (degrees $\times 10^5$)
- `pDOP` (Offset 76, `uint16_t`): Position DOP ($\times 0.01$)

---

## 5. Software Driver Integration (STM32F722)

### 5.1 USART Configuration
- **Peripheral**: `USART2` (Pins `PD5`/`PD6` on Morpho header, or `UART4` on `PC10`/`PC11`).
- **Mode**: Asynchronous, 8N1, 9600 bps initial.
- **Reception Mode**: Circular ring buffer or DMA / Interrupt-driven byte reception (`HAL_UART_Receive_IT`).
- **ISR Hook**:
  ```c
  void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
      if (huart->Instance == USART2 || huart->Instance == UART4) {
          gps_feed_byte(gps_rx_byte);
          HAL_UART_Receive_IT(huart, &gps_rx_byte, 1);
      }
  }
  ```

### 5.2 Switching Baudrate to 115200 bps (`UBX-CFG-PRT`)
To increase throughput and reduce interrupt overhead on STM32, send the following 28-byte `UBX-CFG-PRT` command to the module:
```
B5 62 06 00 14 00 01 00 00 00 D0 08 00 00 00 C2 01 00 07 00 03 00 00 00 00 00 C0 7E
```
*(Baudrate payload `0x0001C200` = 115200 bps, in/out protocols UBX + NMEA).*

