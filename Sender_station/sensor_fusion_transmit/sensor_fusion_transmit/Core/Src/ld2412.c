#include "ld2412.h"
#include "main.h"
#include <string.h>

/* =========================================================================
 * Frame decoder (basic target 0x02 + engineering mode 0x01)
 * ========================================================================= */

static int decode_common(ld_parser_t *p, uint32_t now)
{
    const uint8_t *d = p->buf;
    /* Frame: <len_hi><len_lo> <payload...> F8 F7 F6 F5
     * Payload: d[0]=type(0x01 eng, 0x02 basic), d[1]=0xAA head, ... d[len-2..1]=0x55 0x00 tail
     */
    if (p->len < 11 || (d[0] != 0x02u && d[0] != 0x01u) || d[1] != 0xAAu) return 0;
    if (d[p->len - 2] != 0x55u || d[p->len - 1] != 0x00u) return 0;
    return 1;
}

static int decode_basic(ld_parser_t *p, ld_target_t *o, uint32_t now)
{
    const uint8_t *d = p->buf;
    /* d[0]=type, d[1]=0xAA, d[2]=state, d[3..4]=mov_cm, d[5]=mov_e,
     * d[6..7]=stat_cm, d[8]=stat_e, d[9..10]=0x55 0x00 */
    o->state   = d[2];
    o->mov_cm  = (uint16_t)(d[3] | (d[4] << 8));
    o->mov_e   = d[5];
    o->stat_cm = (uint16_t)(d[6] | (d[7] << 8));
    o->stat_e  = d[8];
    o->t_ms    = now ? now : 1u;
    return 1;
}

static int decode_eng(ld_parser_t *p, ld_eng_t *eng, uint32_t now)
{
    const uint8_t *d = p->buf;
    /* Engineering mode payload (0x01):
     * d[0]=type, d[1]=0xAA, d[2]=state, d[3..4]=mov_cm, d[5]=mov_e,
     * d[6..7]=stat_cm, d[8]=stat_e,
     * d[9..15]=moving gate energy (7 bytes, one per 2..8 m gate),
     * d[16..22]=stationary gate energy (7 bytes),
     * d[23..24]=0x55 0x00
     * Total payload len = 25, frame len = 25 + 2 (type+head) ... actually
     * the length field counts the whole payload including type byte.
     */
    if (p->len < 25) return 0;
    eng->gate_count = LD_ENG_GATES;
    for (uint8_t i = 0; i < LD_ENG_GATES; i++) {
        eng->mov_gate_energy[i] = d[9 + i];
        eng->stat_gate_energy[i] = d[16 + i];
    }
    eng->t_ms = now ? now : 1u;
    return 1;
}

int ld_feed(ld_parser_t *p, uint8_t b, ld_target_t *o, uint32_t now_ms)
{
    static const uint8_t tail[4] = { 0xF8, 0xF7, 0xF6, 0xF5 };
    switch (p->st) {
    case 0: if (b == 0xF4) p->st = 1; break;
    case 1: p->st = (b == 0xF3) ? 2 : (b == 0xF4 ? 1 : 0); break;
    case 2: p->st = (b == 0xF2) ? 3 : (b == 0xF4 ? 1 : 0); break;
    case 3: p->st = (b == 0xF1) ? 4 : (b == 0xF4 ? 1 : 0); break;
    case 4: p->len = b; p->st = 5; break;
    case 5: p->len |= (uint16_t)(b << 8);
            if (p->len < 2 || p->len > LD_BUF) p->st = (b == 0xF4 ? 1 : 0); else { p->n = 0; p->st = 6; } break;
    case 6: p->buf[p->n++] = b; if (p->n >= p->len) { p->tail = 0; p->st = 7; } break;
    case 7: if (b == tail[p->tail]) {
                if (++p->tail == 4) { p->st = 0;
                    if (decode_common(p, now_ms) && p->buf[0] == 0x02u)
                        return decode_basic(p, o, now_ms);
                    return 0;
                }
            } else p->st = (b == 0xF4 ? 1 : 0);
            break;
    }
    return 0;
}

int ld_feed_eng(ld_parser_t *p, uint8_t b, ld_eng_t *eng, uint32_t now_ms)
{
    static const uint8_t tail[4] = { 0xF8, 0xF7, 0xF6, 0xF5 };
    switch (p->st) {
    case 0: if (b == 0xF4) p->st = 1; break;
    case 1: p->st = (b == 0xF3) ? 2 : (b == 0xF4 ? 1 : 0); break;
    case 2: p->st = (b == 0xF2) ? 3 : (b == 0xF4 ? 1 : 0); break;
    case 3: p->st = (b == 0xF1) ? 4 : (b == 0xF4 ? 1 : 0); break;
    case 4: p->len = b; p->st = 5; break;
    case 5: p->len |= (uint16_t)(b << 8);
            if (p->len < 2 || p->len > LD_BUF) p->st = (b == 0xF4 ? 1 : 0); else { p->n = 0; p->st = 6; } break;
    case 6: p->buf[p->n++] = b; if (p->n >= p->len) { p->tail = 0; p->st = 7; } break;
    case 7: if (b == tail[p->tail]) {
                if (++p->tail == 4) { p->st = 0;
                    if (decode_common(p, now_ms) && p->buf[0] == 0x01u)
                        return decode_eng(p, eng, now_ms);
                    return 0;
                }
            } else p->st = (b == 0xF4 ? 1 : 0);
            break;
    }
    return 0;
}

/* =========================================================================
 * Command frame builder (FD FC FB FA ... 04 03 02 01)
 * ========================================================================= */

static uint8_t ld_cmd_cksum(const uint8_t *d, uint8_t n)
{
    uint8_t s = 0;
    for (uint8_t i = 0; i < n; i++) s += d[i];
    return s;
}

int ld_build_cmd(uint8_t opcode, const uint8_t *args, uint8_t nargs, uint8_t *out, uint8_t out_len)
{
    /* Frame: FD FC FB FA <len_hi><len_lo> <opcode> <args...> <cksum> 04 03 02 01
     * Length field = 1 (opcode) + nargs + 1 (checksum) */
    uint8_t plen = 1u + nargs + 1u;
    if (out_len < 6u + plen + 4u) return 0;   /* header(4) + len(2) + payload + footer(4) */
    uint8_t *p = out;
    *p++ = LD_CMD_HEADER0; *p++ = LD_CMD_HEADER1;
    *p++ = LD_CMD_HEADER2; *p++ = LD_CMD_HEADER3;
    *p++ = 0x00u; *p++ = plen;                /* len_hi=0, len_lo=plen */
    *p++ = opcode;
    for (uint8_t i = 0; i < nargs; i++) *p++ = args[i];
    *p++ = ld_cmd_cksum(out + 6, plen);       /* checksum over opcode+args+cksum? No: over opcode+args */
    /* Actually the checksum is over the bytes between len field and footer:
     * opcode + args.  Then append checksum byte, then footer. */
    /* Recompute: checksum covers opcode + args only (plen-1 bytes starting at opcode) */
    uint8_t ck = 0;
    for (uint8_t i = 0; i < (plen - 1u); i++) ck += out[6 + i];
    out[6 + (plen - 1u)] = ck;                /* overwrite with correct checksum */
    p = out + 6 + plen;
    *p++ = LD_CMD_FOOTER0; *p++ = LD_CMD_FOOTER1;
    *p++ = LD_CMD_FOOTER2; *p++ = LD_CMD_FOOTER3;
    return (int)(p - out);
}

int ld_build_max_config(uint8_t *out, uint8_t out_len)
{
    /* Build the full "best quality / maximum range" configuration:
     * 1. Restore factory settings (clean slate)
     * 2. Set moving sensitivity = 9 (max), stationary sensitivity = 9 (max)
     * 3. Set range gate = 8 m (maximum)
     * 4. Set blind zone = 0 cm (no blind zone)
     * 5. Enable engineering mode (rich per-gate data)
     *
     * Each command needs a small delay between them; the caller must pace.
     * We return concatenated frames; the caller sends them sequentially.
     */
    uint8_t wr = 0;
    uint8_t frame[64];

    /* 1. Factory reset */
    int n = ld_build_cmd(LD_CMD_SET_FACTORY, NULL, 0, frame, sizeof frame);
    if (n > 0 && wr + n <= out_len) { memcpy(out + wr, frame, n); wr += (uint8_t)n; }

    /* 2. Sensitivity: moving=9, stationary=9 (args: mov_sens, stat_sens) */
    uint8_t sens_args[2] = { LD_SENS_MAX, LD_SENS_MAX };
    n = ld_build_cmd(LD_CMD_SET_SENSITIVITY, sens_args, 2, frame, sizeof frame);
    if (n > 0 && wr + n <= out_len) { memcpy(out + wr, frame, n); wr += (uint8_t)n; }

    /* 3. Range gate = 8 m (arg: single byte gate value) */
    uint8_t range_arg[1] = { LD_RANGE_MAX };
    n = ld_build_cmd(LD_CMD_SET_RANGE_GATE, range_arg, 1, frame, sizeof frame);
    if (n > 0 && wr + n <= out_len) { memcpy(out + wr, frame, n); wr += (uint8_t)n; }

    /* 4. Blind zone = 0 cm (arg: single byte) */
    uint8_t blind_arg[1] = { LD_BLIND_DEFAULT };
    n = ld_build_cmd(LD_CMD_SET_BLIND_ZONE, blind_arg, 1, frame, sizeof frame);
    if (n > 0 && wr + n <= out_len) { memcpy(out + wr, frame, n); wr += (uint8_t)n; }

    /* 5. Engineering mode ON (arg: 0x01) */
    uint8_t eng_arg[1] = { 0x01u };
    n = ld_build_cmd(LD_CMD_SET_ENG_MODE, eng_arg, 1, frame, sizeof frame);
    if (n > 0 && wr + n <= out_len) { memcpy(out + wr, frame, n); wr += (uint8_t)n; }

    return wr;
}

int ld_send_cmd(UART_HandleTypeDef *huart, uint8_t opcode, const uint8_t *args, uint8_t nargs)
{
    uint8_t frame[64];
    int n = ld_build_cmd(opcode, args, nargs, frame, sizeof frame);
    if (n <= 0) return -1;
    return HAL_UART_Transmit(huart, frame, (uint16_t)n, 100) == HAL_OK ? 0 : -1;
}
