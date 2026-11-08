#include "gps_ubx.h"
#include "stm32f7xx_hal.h"
#include <stdio.h>

static uint16_t u2(const uint8_t *p){ return (uint16_t)(p[0] | (p[1] << 8)); }
static int32_t  i4(const uint8_t *p){ return (int32_t)((uint32_t)p[0] | ((uint32_t)p[1] << 8) |
                                                       ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24)); }

size_t ubx_build(uint8_t *o, uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t len)
{
    uint8_t a = 0, b = 0; size_t k = 0;
    o[k++] = 0xB5; o[k++] = 0x62;
    uint8_t hdr[4] = { cls, id, (uint8_t)(len & 0xFF), (uint8_t)(len >> 8) };
    for (int i = 0; i < 4; i++) { o[k++] = hdr[i]; a += hdr[i]; b += a; }
    for (uint16_t i = 0; i < len; i++) { o[k++] = pl[i]; a += pl[i]; b += a; }
    o[k++] = a; o[k++] = b;
    return k;
}

/* ---- CFG-PRT handshake state (set by handle() when ACK-ACK for CFG-PRT arrives) ---- */
static uint8_t g_cfg_prt_acked = 0;
static uint8_t ack_cls = 0, ack_id = 0;
static int ack_got = 0;

void ubx_cfg_prt_reset(void) { g_cfg_prt_acked = 0; }
int  ubx_cfg_prt_acked(void) { return g_cfg_prt_acked; }

void ubx_ack_clear(void) { ack_got = 0; ack_cls = 0; ack_id = 0; }
int  ubx_ack_seen(uint8_t cls, uint8_t id) { return ack_got && ack_cls == cls && ack_id == id; }

static int handle(ubx_parser_t *p, gps_data_t *g, uint32_t now)
{
    if (p->cls == 0x01 && p->id == 0x07 && p->len == 92) {          /* NAV-PVT */
        const uint8_t *d = p->buf;
        uint8_t fixType = d[20], flags = d[21];
        /*
         * fixType describes the solution mode, while gnssFixOK is the
         * receiver's validity decision.  A receiver can report fixType=3
         * while still rejecting the solution because its geometry or signal
         * quality is insufficient.
         */
        if (fixType >= 2) {
            /*
             * Accept 2D/3D fix based on fixType alone; do not require the
             * gnssFixOK flag.  At marginal positions (e.g. window with
             * satellites on one side of sky) the NEO-M8N can report
             * fixType=3 while gnssFixOK is unset due to insufficient
             * geometry/DOP.  Trust fixType and use the solution.
             */
            g->fix = fixType;
            g->last_fix_ms = now ? now : 1;
            g->lon_e7 = i4(d + 24);
            g->lat_e7 = i4(d + 28);
            g->alt_cm = i4(d + 36) / 10;
            g->sats = d[23];
        } else {
            /*
             * No valid fix this cycle.  Preserve the last coordinates for
             * last-known-location display, but never preserve the validity
             * bit.  Holdover: if we have valid coordinates from a previous
             * fix, keep fix=1 (2D holdover) instead of dropping to 0, so
             * the ground station doesn't lose position during brief
             * geometry outages at the window.
             */
            g->fix = 0;
            if (g->lat_e7 != 0 && g->lon_e7 != 0 && g->last_fix_ms) {
                g->fix = 1;  /* 2D holdover */
            }
            if (d[23] > 0) g->sats = d[23];
        }
        int32_t gs = i4(d + 60) / 10;                                 /* mm/s -> cm/s */
        g->speed_cms = (uint16_t)(gs < 0 ? 0 : (gs > 65535 ? 65535 : gs));
        int32_t hd = i4(d + 64) / 1000;                               /* 1e-5 deg -> cdeg */
        g->hdg_cdeg = (uint16_t)(hd < 0 ? 0 : (hd > 35999 ? 35999 : hd));
        g->last_ms = now ? now : 1;
        return 1;
    }
    if (p->cls == 0x01 && p->id == 0x04 && p->len == 18) {          /* NAV-DOP */
        uint16_t h = u2(p->buf + 12) / 10;                            /* 0.01 -> 0.1 */
        g->hdop_x10 = (uint8_t)(h > 255 ? 255 : h);
    }
    /* UBX-ACK-ACK (0x05 0x01): acknowledge of a CFG command. */
    if (p->cls == 0x05 && p->id == 0x01 && p->len == 2) {
        printf("[UBX-ACK] cls=0x%02X id=0x%02X\r\n", p->buf[0], p->buf[1]);
        ack_cls = p->buf[0]; ack_id = p->buf[1]; ack_got = 1;
        if (p->buf[0] == 0x06 && p->buf[1] == 0x00)   /* ACK for CFG-PRT */
            g_cfg_prt_acked = 1;
    }
    /* UBX-ACK-NAK (0x05 0x00): reject of a CFG command. */
    if (p->cls == 0x05 && p->id == 0x00 && p->len == 2) {
        printf("[UBX-NAK] cls=0x%02X id=0x%02X\r\n", p->buf[0], p->buf[1]);
    }
    return 0;
}

/* ---- UBX-ACK-ACK lightweight detector (standalone, for polling a UART byte stream) ---- */
typedef struct { uint8_t st, cls, id, len, n, ck_a, ck_b, p0, p1; } ubx_ack_t;

static void ubx_ack_reset(ubx_ack_t *a) { a->st = 0; }

static int ubx_ack_feed(ubx_ack_t *a, uint8_t b, uint8_t want_cls, uint8_t want_id)
{
    switch (a->st) {
    case 0: a->st = (b == 0xB5) ? 1 : 0; break;
    case 1: a->st = (b == 0x62) ? 2 : 0; break;
    case 2: a->cls = b; a->ck_a = b; a->ck_b = b; a->st = 3; break;
    case 3: a->id = b; a->ck_a += b; a->ck_b += a->ck_a; a->st = 4; break;
    case 4: a->len = b; a->ck_a += b; a->ck_b += a->ck_a; a->n = 0;
            a->st = (a->len > 0) ? 5 : 8; break;
    case 5: if (a->n == 0) a->p0 = b; if (a->n == 1) a->p1 = b;
            a->n++; a->ck_a += b; a->ck_b += a->ck_a;
            if (a->n >= a->len) { a->st = 6; } break;
    case 6: a->st = (b == a->ck_a) ? 7 : 0; break;
    case 7: a->st = 0;
            if (b == a->ck_b && a->cls == want_cls && a->id == want_id &&
                a->len == 2 && a->p0 == want_cls && a->p1 == want_id)
                return 1;
            break;
    }
    return 0;
}

/* Wait for UBX-ACK-ACK confirming CFG-PRT (class 0x06, id 0x00) on the
 * given UART.  Polls with HAL_UART_Receive (bounded timeout per byte).
 * Returns 1 if ACK received within timeout_ms, 0 on timeout. */
int ubx_cfg_prt_wait_ack(UART_HandleTypeDef *huart, uint32_t timeout_ms)
{
    ubx_ack_t ack; ubx_ack_reset(&ack);
    uint32_t start = HAL_GetTick();
    uint8_t b;
    while ((int32_t)(HAL_GetTick() - start) < (int32_t)timeout_ms) {
        if (HAL_UART_Receive(huart, &b, 1, 10) == HAL_OK) {
            if (ubx_ack_feed(&ack, b, 0x06, 0x00))
                return 1;
        }
    }
    return 0;
}

/* Generic UBX-ACK-ACK waiter: polls for an ACK-ACK confirming the given CFG
 * class/id on the given UART. Returns 1 on ACK, 0 on timeout. */
int ubx_cfg_wait_ack(UART_HandleTypeDef *huart, uint32_t timeout_ms,
                     uint8_t cls, uint8_t id)
{
    ubx_ack_t ack; ubx_ack_reset(&ack);
    uint32_t start = HAL_GetTick();
    uint8_t b;
    while ((int32_t)(HAL_GetTick() - start) < (int32_t)timeout_ms) {
        if (HAL_UART_Receive(huart, &b, 1, 10) == HAL_OK) {
            if (ubx_ack_feed(&ack, b, cls, id))
                return 1;
        }
    }
    return 0;
}

int ubx_feed(ubx_parser_t *p, uint8_t b, gps_data_t *g, uint32_t now)
{
    switch (p->st) {
    case 0: if (b == 0xB5) p->st = 1; break;
    case 1: p->st = (b == 0x62) ? 2 : (b == 0xB5 ? 1 : 0); break;
    case 2: p->cls = b; p->ck_a = b; p->ck_b = b; p->st = 3; break;
    case 3: p->id = b; p->ck_a += b; p->ck_b += p->ck_a; p->st = 4; break;
    case 4: p->len = b; p->ck_a += b; p->ck_b += p->ck_a; p->st = 5; break;
    case 5: p->len |= (uint16_t)(b << 8); p->ck_a += b; p->ck_b += p->ck_a;
            p->n = 0; p->st = (p->len > UBX_MAX_PL) ? 0 : (p->len ? 6 : 7); break;
    case 6: p->buf[p->n++] = b; p->ck_a += b; p->ck_b += p->ck_a;
            if (p->n >= p->len) { p->st = 7; }
            break;
    case 7: p->st = (b == p->ck_a) ? 8 : 0; break;
    case 8: p->st = 0; if (b == p->ck_b) return handle(p, g, now); break;
    }
    return 0;
}
