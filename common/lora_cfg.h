/**
 * @file lora_cfg.h
 * @brief Shared LoRa configuration for STM32 (TX) and ESP32 (RX)
 * 
 * This header ensures both ends of the LoRa link use identical parameters.
 * Any change here MUST be flashed to both devices.
 * 
 * SX1261/SX1262 Settings per Artemis LoRa Packet Architecture v1.0
 */

#ifndef LORA_CFG_H
#define LORA_CFG_H

/* ============================================================================
 * RF Frequency - MUST match regional ISM band
 * ============================================================================
 * EU868: 865402500 (865.4025 MHz) - Default for Team Artemis
 * US915: 915000000 (915.0 MHz)
 */
#define LORA_FREQ_HZ          865402500UL

/* SX1261/SX1262 crystal frequency is standard 32 MHz per Semtech spec.
 * PLL steps = (F_RF * 2^25) / F_XOSC. (865402500 * 33554432) / 32000000 = 0x36165800. */
#define LORA_XOSC_FREQ_HZ     32000000UL

/* ============================================================================
 * LoRa Modulation Parameters
 * ============================================================================
 * SF7-9 recommended for balance between range and airtime
 * BW125 or BW250 kHz
 * CR 4/5 or 4/6
 */
#define LORA_SF               9           /* Spreading Factor (7-12) */
#define LORA_BW               125         /* Bandwidth in kHz (125 or 250) */
#define LORA_CR               5           /* Coding Rate (5=4/5, 6=4/6) */

/* ============================================================================
 * Packet Structure
 * ============================================================================
 */
#define LORA_PREAMBLE_SYMB    12u         /* Preamble length (symbols) */
#define LORA_SYNCWORD         0x12u       /* Private network (0x12), Public (0x34) */
#define LORA_CRC_ENABLED      1           /* Header + Payload CRC */

/* ============================================================================
 * TX Power (dBm)
 * ============================================================================
 * SX1261: max +15 dBm
 * SX1262: max +22 dBm
 * 
 * PA settings (from SX1262 datasheet Table 13-21):
 *   +14 dBm: PA_DUTY=0x02, HP_MAX=0x02
 *   +17 dBm: PA_DUTY=0x02, HP_MAX=0x03
 *   +20 dBm: PA_DUTY=0x03, HP_MAX=0x05
 *   +22 dBm: PA_DUTY=0x04, HP_MAX=0x07
 */
#define LORA_TX_DBM           14          /* Transmit power */

/* ============================================================================
 * Board-Specific GPIO Configuration
 * ============================================================================
 * These are defined per-board in the respective HAL files.
 * 
 * STM32 (NUCLEO-F722ZE) pinout:
 *   NSS   -> PA4
 *   SCK   -> PA5 (SPI1)
 *   MISO  -> PA6 (SPI1)
 *   MOSI  -> PA7 (SPI1)
 *   RESET -> PE11
 *   BUSY  -> PF13
 *   DIO1  -> PE9 (EXTI)
 *   TXEN  -> PF14 (optional, if LORA_USE_RXTX_PINS=1)
 *   RXEN  -> PE13 (optional, if LORA_USE_RXTX_PINS=1)
 * 
 * ESP32-S3 (DevKit) pinout:
 *   NSS   -> GPIO5  (HSPI CS0)
 *   SCK   -> GPIO18 (HSPI CLK)
 *   MISO  -> GPIO19 (HSPI MISO)
 *   MOSI  -> GPIO23 (HSPI MOSI)
 *   RESET -> GPIO14
 *   BUSY  -> GPIO27
 *   DIO1  -> GPIO26 (GPIO interrupt)
 *   TXEN  -> GPIO25 (optional)
 *   RXEN  -> GPIO33 (optional)
 */

/* ============================================================================
 * RX/TX Antenna Switch Control
 * ============================================================================
 * Set to 1 if using external TXEN/RXEN pins for antenna switch
 * Set to 0 if using DIO2 for RF switch (SX1262 internal)
 * 
 * Note: Many SX1262 modules use DIO2 for internal RF switching.
 * If using DIO2_RFSW, set LORA_USE_RXTX_PINS=0 and LORA_USE_DIO2_RFSW=1.
 */
#define LORA_USE_RXTX_PINS    0
#define LORA_USE_DIO2_RFSW    1

/* ============================================================================
 * TCXO (Temperature Compensated Crystal Oscillator)
 * ============================================================================
 * Set to 1 if module has TCXO (powered from DIO3, 1.8V)
 * Set to 0 for standard crystal
 */
#define LORA_USE_TCXO         0

/* ============================================================================
 * DC-DC Converter
 * ============================================================================
 * Set to 1 for DC-DC (more efficient, required for high TX power)
 * Set to 0 for LDO regulator
 */
#define LORA_USE_DCDC         1

/* ============================================================================
 * Duty Cycle Constraints (ETSI EN 300 220 / FCC Part 15)
 * ============================================================================
 * DUTY_PERMILLE: 1 = 0.1%, 10 = 1%, 100 = 10%, 1000 = no limit
 * EU868: typically 1% (10 permille) per channel
 * US915: typically no duty cycle limit, but TX time limits apply
 */
#define DUTY_PERMILLE         1000u       /* 1000 = continuous telemetry (disabled token-bucket throttle) */
#define DUTY_WINDOW_S         3600u       /* 1-hour window */

/* ============================================================================
 * Addressing
 * ============================================================================
 */
#define ADDR_ROBOT            0x01u
#define ADDR_GROUND           0x02u

/* ============================================================================
 * Protocol Constants (from proto.h - mirrored here for convenience)
 * ============================================================================
 */
#define PROTO_MAGIC0          0xAAu
#define PROTO_MAGIC1          0x55u
#define PROTO_VERSION         0x01u
/* PROTO_HDR_LEN defined in proto.h (10u) - do not redefine here to avoid conflict */
#define PROTO_CRC_LEN         2u
#define PROTO_MAX_FRAME       255u
#define PROTO_MAX_PAYLOAD     (PROTO_MAX_FRAME - PROTO_HDR_LEN - PROTO_CRC_LEN)

/* Packet Types */
#define PKT_GPS_CRITICAL      0x01u
#define PKT_RADAR_ALERT       0x02u
#define PKT_STATUS_HEART      0x03u
#define PKT_POWER_CRIT        0x04u
#define PKT_TELEMETRY         0x05u
#define PKT_MOTORS_DELTA      0x06u
#define PKT_ENV               0x07u
#define PKT_CMD               0x08u
#define PKT_ACK               0x09u

/* Flags */
#define FLAG_ACK_REQ          0x01u
#define FLAG_PRIORITY         0x02u
#define FLAG_FRAG             0x04u
#define FLAG_URGENT           0x08u

/* Commands (Ground -> Robot) */
#define CMD_ESTOP             0x01u
#define CMD_SYNC_TIME         0x02u

#endif /* LORA_CFG_H */
