#ifndef GPS_UBX_H
#define GPS_UBX_H
#include <stdint.h>
#include <stddef.h>
#include "stm32f7xx_hal.h"
#define UBX_MAX_PL 100u
#define GPS_HOLDOVER_MS 10000u /* 10-second fix holdover protects window/indoor signal fluctuations */

typedef struct {
    int32_t lat_e7, lon_e7, alt_cm;
    uint16_t speed_cms, hdg_cdeg;
    uint8_t fix, sats, hdop_x10;
    uint8_t tracked_sats;           /* actively tracked satellites (SNR > 0) */
    uint32_t last_ms;               /* tick of last NAV-PVT, 0 = never */
    uint32_t last_fix_ms;           /* tick of last valid fix (>= 2) */
} gps_data_t;

typedef struct {
    uint8_t st, cls, id, ck_a, ck_b;
    uint16_t len, n;
    uint8_t buf[UBX_MAX_PL];
} ubx_parser_t;

/* feed one byte; returns 1 when a NAV-PVT has just updated *g */
int    ubx_feed(ubx_parser_t *p, uint8_t b, gps_data_t *g, uint32_t now_ms);
size_t ubx_build(uint8_t *out, uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t len);

/* CFG-PRT handshake verification */
void   ubx_cfg_prt_reset(void);
int    ubx_cfg_prt_acked(void);
int    ubx_cfg_prt_wait_ack(UART_HandleTypeDef *huart, uint32_t timeout_ms);

/* Generic UBX-ACK-ACK waiter: waits for ACK of the given CFG class/id.
 * Returns 1 on ACK, 0 on timeout. */
int    ubx_cfg_wait_ack(UART_HandleTypeDef *huart, uint32_t timeout_ms,
                        uint8_t cls, uint8_t id);

/* Non-blocking ring-buffer ACK tracking */
void   ubx_ack_clear(void);
int    ubx_ack_seen(uint8_t cls, uint8_t id);
#endif
