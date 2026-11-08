#ifndef GPS_UBX_H
#define GPS_UBX_H
#include <stdint.h>
#include <stddef.h>
#define UBX_MAX_PL 100u

typedef struct {
    int32_t lat_e7, lon_e7, alt_cm;
    uint16_t speed_cms, hdg_cdeg;
    uint8_t fix, sats, hdop_x10;
    uint32_t last_ms;               /* tick of last NAV-PVT, 0 = never */
} gps_data_t;

typedef struct {
    uint8_t st, cls, id, ck_a, ck_b;
    uint16_t len, n;
    uint8_t buf[UBX_MAX_PL];
} ubx_parser_t;

/* feed one byte; returns 1 when a NAV-PVT has just updated *g */
int    ubx_feed(ubx_parser_t *p, uint8_t b, gps_data_t *g, uint32_t now_ms);
size_t ubx_build(uint8_t *out, uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t len);
#endif
