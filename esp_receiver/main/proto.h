#ifndef PROTO_H
#define PROTO_H

#include <stdint.h>
#include <stddef.h>

#define PROTO_MAGIC0     0xAAu
#define PROTO_MAGIC1     0x55u
#define PROTO_VERSION    0x01u
#define ADDR_ROBOT       0x01u
#define ADDR_GROUND      0x02u

#define FLAG_ACK_REQ     0x01u
#define FLAG_PRIORITY    0x02u
#define FLAG_FRAG        0x04u
#define FLAG_URGENT      0x08u

enum {
    PKT_GPS_CRITICAL = 0x01, PKT_RADAR_ALERT = 0x02, PKT_STATUS_HEART = 0x03,
    PKT_POWER_CRIT   = 0x04, PKT_TELEMETRY   = 0x05, PKT_MOTORS_DELTA = 0x06,
    PKT_ENV          = 0x07, PKT_CMD         = 0x08, PKT_ACK          = 0x09
};
enum { CMD_ESTOP = 0x01, CMD_SYNC_TIME = 0x02,
       CMD_RADAR_SENS = 0x10, CMD_RADAR_RANGE = 0x11,
       CMD_RADAR_BLIND = 0x12, CMD_RADAR_ENG_MODE = 0x13 };

#define PROTO_HDR_LEN      10u   /* sum of the fields in Table 1 (the PDF says 11 - see notes) */
#define PROTO_CRC_LEN      2u
#define PROTO_MAX_FRAME    255u
#define PROTO_MAX_PAYLOAD  (PROTO_MAX_FRAME - PROTO_HDR_LEN - PROTO_CRC_LEN)
#define FRAG_CHUNK         28u

#define PK __attribute__((packed))

typedef struct PK {
    uint8_t  magic[2];
    uint8_t  version;
    uint8_t  type;
    uint8_t  flags;
    uint16_t seq;          /* wire sequence, per fragment */
    uint8_t  src;
    uint8_t  dst;
    uint8_t  payload_len;  /* excludes CRC */
} frame_hdr_t;
_Static_assert(sizeof(frame_hdr_t) == PROTO_HDR_LEN, "header size");

/* ---------------- payloads (all little-endian) ---------------- */
typedef struct PK {            /* 23 B */
    uint32_t t_ms; int32_t lat_e7; int32_t lon_e7; int32_t alt_cm;
    uint16_t speed_cms; uint16_t hdg_cdeg; uint8_t fix; uint8_t sats; uint8_t hdop_x10;
} pl_gps_t;

typedef struct PK {            /* 12 B */
    uint32_t t_ms; uint8_t target_state; uint8_t human;
    uint16_t mov_dist_cm; uint8_t mov_energy; uint16_t stat_dist_cm; uint8_t stat_energy;
} pl_radar_t;

typedef struct PK {            /* 13 B */
    uint32_t t_ms; uint16_t tx_count; uint16_t retry_count; uint16_t drop_count;
    int8_t last_rssi; int8_t last_snr; uint8_t sensor_flags;
} pl_status_t;

typedef struct PK {            /* 9 B  (ESTIMATED, no sensors) */
    uint32_t t_ms; uint16_t est_mv; uint16_t est_ma; uint8_t est_soc;
} pl_power_t;

typedef struct PK {            /* 17 B */
    uint32_t t_ms; int16_t temp_c100; uint16_t hum_c100; uint16_t press_dhpa;
    uint32_t gas_ohm; uint16_t iaq; uint8_t flags;   /* flags: b0 gas_valid, b1 heat_stab */
} pl_env_t;

typedef struct PK {            /* 35 B summary, sent fragmented */
    uint32_t t_ms; uint32_t uptime_s; int32_t lat_e7; int32_t lon_e7; int32_t alt_cm;
    uint16_t speed_cms; uint16_t hdg_cdeg; uint8_t fix; uint8_t sats;
    int16_t temp_c100; uint16_t hum_c100; uint16_t press_dhpa;
    uint8_t radar_state; uint8_t soc; uint8_t sensor_flags;
} pl_telem_t;

typedef struct PK { uint16_t acked_seq; uint8_t status; } pl_ack_t;
typedef struct PK { uint16_t pkt_id; uint8_t frag_num; uint8_t frag_total; } pl_frag_t;

uint16_t crc16_ccitt_false(const uint8_t *d, size_t n);
size_t   proto_build(uint8_t *out, uint8_t type, uint8_t flags, uint16_t seq,
                     uint8_t dst, const void *payload, uint8_t len);
int      proto_parse(const uint8_t *in, size_t n, frame_hdr_t *h, const uint8_t **pl);

#endif /* PROTO_H */
