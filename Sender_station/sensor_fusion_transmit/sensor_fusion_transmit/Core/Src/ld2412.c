#include "ld2412.h"

static int decode(ld_parser_t *p, ld_target_t *o, uint32_t now)
{
    const uint8_t *d = p->buf;
    /* HLK-LD2412 datasheet frame header: 0xFD 0x02 0x01 0x04 */
    if (p->len < 11 ||
        d[0] != 0xFD || d[1] != 0x02 || d[2] != 0x01 || d[3] != 0x04) return 0;
    o->state   = d[4];
    o->mov_cm  = (uint16_t)(d[5] | (d[6] << 8));
    o->mov_e   = d[7];
    o->stat_cm = (uint16_t)(d[8] | (d[9] << 8));
    o->stat_e  = d[10];
    o->t_ms    = now ? now : 1;
    return 1;
}

int ld_feed(ld_parser_t *p, uint8_t b, ld_target_t *o, uint32_t now)
{
    static const uint8_t tail[4] = { 0xF8, 0xF7, 0xF6, 0xF5 };
    switch (p->st) {
    case 0: if (b == 0xF4) p->st = 1; break;
    case 1: p->st = (b == 0xF3) ? 2 : (b == 0xF4 ? 1 : 0); break;
    case 2: p->st = (b == 0xF2) ? 3 : (b == 0xF4 ? 1 : 0); break;
    case 3: p->st = (b == 0xF1) ? 4 : (b == 0xF4 ? 1 : 0); break;
    case 4: p->len = b; p->st = 5; break;
    case 5: p->len |= (uint16_t)(b << 8);
            if (p->len < 2 || p->len > LD_BUF) p->st = 0; else { p->n = 0; p->st = 6; } break;
    case 6: p->buf[p->n++] = b; if (p->n >= p->len) { p->tail = 0; p->st = 7; } break;
    case 7: if (b == tail[p->tail]) {
                if (++p->tail == 4) { p->st = 0; return decode(p, o, now); }
            } else p->st = 0;
            break;
    }
    return 0;
}
