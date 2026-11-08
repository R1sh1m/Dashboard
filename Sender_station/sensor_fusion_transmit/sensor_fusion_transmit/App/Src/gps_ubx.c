#include "gps_ubx.h"

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

static uint8_t ack_cls, ack_id; static int ack_got;

static int handle(ubx_parser_t *p, gps_data_t *g, uint32_t now)
{
    if (p->cls == 0x01 && p->id == 0x07 && p->len == 92) {          /* NAV-PVT */
        const uint8_t *d = p->buf;
        uint8_t fixType = d[20], flags = d[21];
        g->fix  = (flags & 0x01) ? fixType : 0;
        g->sats = d[23];
        g->lon_e7 = i4(d + 24);
        g->lat_e7 = i4(d + 28);
        g->alt_cm = i4(d + 36) / 10;                                  /* hMSL mm -> cm */
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
    if (p->cls == 0x05 && p->id == 0x01 && p->len == 2) {           /* ACK-ACK / ACK-NAK */
        ack_cls = p->buf[0]; ack_id = p->buf[1]; ack_got = 1;
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

void ubx_ack_clear(void){ ack_got = 0; ack_cls = 0; ack_id = 0; }
int  ubx_ack_seen(uint8_t cls, uint8_t id){ return ack_got && ack_cls == cls && ack_id == id; }
