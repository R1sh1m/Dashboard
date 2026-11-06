# LoRa Packet Specification — Artemis Ground Station

**Source:** `Docs/Artemis_LoRa_Packet_Architecture.pdf`  
**Version:** 1.0  
**Shared header:** `common/lora_cfg.h`

---

## 1. Radio Parameters (Both Ends Must Match)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Frequency | 865.4025 MHz | EU868 ISM band |
| Modulation | LoRa | |
| Spreading Factor | SF9 | Range vs airtime balance |
| Bandwidth | 125 kHz | |
| Coding Rate | 4/5 | |
| Preamble | 12 symbols | |
| Sync Word | 0x12 | Private network |
| TX Power | 14 dBm | SX1261 max +15, SX1262 max +22 |
| CRC | Header + Payload | CCITT-FALSE |
| Duty Cycle | 1% (10 permille) | ETSI EN 300 220 |

---

## 2. Frame Format

All multi-byte fields are **little-endian**.

```
+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+
| magic0 | magic1 | version| type   | flags  | seq    | src    | dst    | payload_len | CRC16 (2 bytes) |
|  2 B   |        | 1 B    | 1 B    | 1 B    | 2 B    | 1 B    | 1 B    | 1 B         |                 |
+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+
  Header total: 11 bytes
```

| Field | Size | Description |
|-------|------|-------------|
| magic[2] | 2 B | Sync `0xAA 0x55` |
| version | 1 B | Protocol version `0x01` |
| type | 1 B | Packet type (Table 2) |
| flags | 1 B | ACK_REQ(0x01), PRIORITY(0x02), FRAG(0x04), URGENT(0x08) |
| seq | 2 B | Wire sequence per fragment |
| src/dst | 2 B | `0x01` robot, `0x02` ground |
| payload_len | 1 B | Payload length (excludes CRC) |
| CRC16 | 2 B | CCITT-FALSE over header+payload |

---

## 3. Packet Types

| Type | ID | Purpose | Priority | ACK |
|------|-----|---------|----------|-----|
| PKT_GPS_CRITICAL | 0x01 | NEO-M8N: lat/lon, alt/speed/hdg, fix/sats/hdop | 1 (highest) | No |
| PKT_RADAR_ALERT | 0x02 | LD2412: target state, human detected, dist/energy | 1 | Yes |
| PKT_STATUS_HEART | 0x03 | BotStatus + link stats (rate-limited) | 2 | No |
| PKT_POWER_CRIT | 0x04 | 3S LiPo estimated V/I/SOC | 2 | No |
| PKT_TELEMETRY | 0x05 | Full/summary state (fragmented if large) | 3 | Fragmented |
| PKT_MOTORS_DELTA | 0x06 | 18-servo delta (bitmask + changed entries) | 3 | No |
| PKT_ENV | 0x07 | BME688: temp/hum/press/gas/IAQ/anom | 3 | No |
| PKT_CMD | 0x08 | Ground→Robot (E-STOP urgent, SYNC) | Urgent | Stop-and-wait |
| PKT_ACK | 0x09 | ACK for ACK_REQ packets | Immediate | No |

---

## 4. Flags

| Flag | Value | Meaning |
|------|-------|---------|
| FLAG_ACK_REQ | 0x01 | Stop-and-wait ACK required |
| FLAG_PRIORITY | 0x02 | Priority queue boost |
| FLAG_FRAG | 0x04 | Fragmented packet |
| FLAG_URGENT | 0x08 | Jump to front of TX queue |

---

## 5. Fragmentation

- FRAG flag set with fragment header: `pkt_id` (2 B), `frag_num` (1 B), `frag_total` (1 B)
- Reassembly timeout: 2 seconds
- Dedup keyed by `pkt_id`
- Max fragments: 8 (configurable)

---

## 6. Reliability FSM

```
IDLE → BUILD FRAME → TX LoRa → WAIT ACK (if ACK_REQ)
   ↓                              ↓
ACK received                  ACK timeout
   ↓                              ↓
Drop (success)              RETRY (max 3) → DROP
```

- Selective ACK only for RADAR ALERT and CMD
- Periodic GPS uses sequence tracking for loss reporting
- Duplicate detection via last-N packet ID cache

---

## 7. Ground Bridge → JSON

The ESP32 receiver validates CRC, reassembles fragments, maintains shadow state per subsystem, and emits **newline-delimited JSON** over USB-CDC at 115200 baud. The JSON matches `src/types/telemetry.ts` `TelemetryPacket` interface.

The dashboard (`src/services/webSerial.ts`) reads newline-delimited text, JSON-parses lines starting with `{`, and feeds the React app.

---

## 8. Addressing

| Address | Value | Meaning |
|---------|-------|---------|
| ADDR_ROBOT | 0x01 | STM32 transmitter |
| ADDR_GROUND | 0x02 | ESP32 receiver |
