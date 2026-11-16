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
 * HLK-LD2412 Command frame builder (FD FC FB FA <len_lo><len_hi> <cmd_lo><cmd_hi> <val...> 04 03 02 01)
 * Per HLK-LD2412 Serial Communication Protocol V1.05
 * ========================================================================= */

int ld_build_cmd(uint16_t cmd_word, const uint8_t *val, uint16_t val_len, uint8_t *out, uint8_t out_len)
{
    /* In-frame length = 2 bytes (cmd_word) + val_len */
    uint16_t in_frame_len = (uint16_t)(2u + val_len);
    /* Total frame = header(4) + len(2) + in_frame_len + footer(4) */
    uint16_t total_frame_len = (uint16_t)(4u + 2u + in_frame_len + 4u);
    if (out_len < total_frame_len) return 0;

    uint8_t *p = out;
    *p++ = LD_CMD_HEADER0;
    *p++ = LD_CMD_HEADER1;
    *p++ = LD_CMD_HEADER2;
    *p++ = LD_CMD_HEADER3;

    /* In-frame length (little-endian) */
    *p++ = (uint8_t)(in_frame_len & 0xFFu);
    *p++ = (uint8_t)((in_frame_len >> 8) & 0xFFu);

    /* Command word (little-endian) */
    *p++ = (uint8_t)(cmd_word & 0xFFu);
    *p++ = (uint8_t)((cmd_word >> 8) & 0xFFu);

    /* Command value */
    if (val && val_len > 0) {
        memcpy(p, val, val_len);
        p += val_len;
    }

    /* Footer */
    *p++ = LD_CMD_FOOTER0;
    *p++ = LD_CMD_FOOTER1;
    *p++ = LD_CMD_FOOTER2;
    *p++ = LD_CMD_FOOTER3;

    return (int)(p - out);
}

int ld_send_cmd(UART_HandleTypeDef *huart, uint16_t cmd_word, const uint8_t *val, uint16_t val_len)
{
    uint8_t frame[32];
    int n = ld_build_cmd(cmd_word, val, val_len, frame, sizeof frame);
    if (n <= 0) return -1;
    return HAL_UART_Transmit(huart, frame, (uint16_t)n, 100) == HAL_OK ? 0 : -1;
}

int ld_init_thermal_safe(UART_HandleTypeDef *huart)
{
    /* 1. Enter configuration mode (0x00FF, value 0x0001) */
    uint8_t enable_val[2] = { 0x01u, 0x00u };
    ld_send_cmd(huart, LD_CMD_ENABLE_CONF, enable_val, 2);
    HAL_Delay(50);

    /* 2. Turn OFF Bluetooth radio (0x00A4, value 0x0000).
     * Eliminates continuous 2.4 GHz BLE beacon broadcast, cutting 30-40 mA current
     * and dropping radar operating temperature by 15-20°C. */
    uint8_t bt_off[2] = { 0x00u, 0x00u };
    ld_send_cmd(huart, LD_CMD_SET_BLUETOOTH, bt_off, 2);
    HAL_Delay(50);

    /* 3. Disable Engineering Mode (0x0063, no value).
     * Prevents continuous high-rate FFT calculation on all range gates,
     * running in basic target detection mode to reduce DSP thermal load. */
    ld_send_cmd(huart, LD_CMD_ENG_MODE_OFF, NULL, 0);
    HAL_Delay(50);

    /* 4. End configuration mode (0x00FE, no value) to resume normal low-power sensing */
    ld_send_cmd(huart, LD_CMD_END_CONF, NULL, 0);
    HAL_Delay(50);

    return 0;
}
