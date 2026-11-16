#include "ld2412.h"
#include <string.h>

/* =========================================================================
 *  Frame decoder (basic target 0x02 + engineering mode 0x01)
 *
 *  Wire frame: F4 F3 F2 F1 | len(2 LE) | payload | F8 F7 F6 F5
 *  Payload:    type(0x01 eng / 0x02 basic) | 0xAA | data... | 0x55 0x00
 * ========================================================================= */

static int decode_common(ld_parser_t *p, uint32_t now)
{
    const uint8_t *d = p->buf;
    if (p->len < 11 || (d[0] != 0x02u && d[0] != 0x01u) || d[1] != 0xAAu) return 0;
    if (d[p->len - 2] != 0x55u || d[p->len - 1] != 0x00u) return 0;
    (void)now;
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
    static const uint8_t tail[4] = { LD_DATA_TAIL0, LD_DATA_TAIL1, LD_DATA_TAIL2, LD_DATA_TAIL3 };
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
                    if (decode_common(p, now_ms) && (p->buf[0] == 0x02u || p->buf[0] == 0x01u))
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
    static const uint8_t tail[4] = { LD_DATA_TAIL0, LD_DATA_TAIL1, LD_DATA_TAIL2, LD_DATA_TAIL3 };
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
 *  Command frame encoder
 *
 *  Frame: FD FC FB FA | len(2 LE) | cmd_word(2 LE) | value(N) | 04 03 02 01
 * ========================================================================= */
size_t ld_build_cmd_frame(uint16_t cmd_word, const uint8_t *value, uint8_t value_len,
                          uint8_t *out, size_t out_len)
{
    size_t need = 4 + 2 + 2 + value_len + 4;
    if (out == NULL || out_len < need) return 0;
    size_t i = 0;
    out[i++] = LD_FRAME_HDR0;
    out[i++] = LD_FRAME_HDR1;
    out[i++] = LD_FRAME_HDR2;
    out[i++] = LD_FRAME_HDR3;
    uint16_t dlen = (uint16_t)(2 + value_len);
    out[i++] = (uint8_t)(dlen & 0xFF);
    out[i++] = (uint8_t)(dlen >> 8);
    out[i++] = (uint8_t)(cmd_word & 0xFF);
    out[i++] = (uint8_t)(cmd_word >> 8);
    for (uint8_t k = 0; k < value_len; k++) out[i++] = value[k];
    out[i++] = LD_FRAME_FOOT0;
    out[i++] = LD_FRAME_FOOT1;
    out[i++] = LD_FRAME_FOOT2;
    out[i++] = LD_FRAME_FOOT3;
    return i;
}

/* =========================================================================
 *  Command state machine (non-blocking, callback TX)
 * ========================================================================= */
void ld_cmd_init(ld_cmd_t *c, ld_tx_byte_fn tx)
{
    memset(c, 0, sizeof(*c));
    c->state = LD_CMD_IDLE;
    c->tx = tx;
}

int ld_cmd_send(ld_cmd_t *c, uint16_t cmd_word, const uint8_t *value, uint8_t value_len,
                uint32_t now_ms)
{
    if (c->state != LD_CMD_IDLE) return 0;
    c->frame_len = ld_build_cmd_frame(cmd_word, value, value_len, c->frame, sizeof c->frame);
    if (c->frame_len == 0) return 0;
    c->cmd_word = cmd_word;
    c->value_len = value_len;
    if (value_len) memcpy(c->value, value, value_len);
    c->frame_pos = 0;
    c->t_start = now_ms;
    c->retries = 0;
    c->done = 0;
    c->ok = 0;
    c->ack_status = 0;
    c->ack_data_len = 0;
    c->ack_st = 0;
    c->ack_len = 0;
    c->ack_n = 0;
    c->state = LD_CMD_SENDING;
    return 1;
}

/* Transmit pending frame bytes. Returns 1 if a byte was sent this call. */
int ld_cmd_poll(ld_cmd_t *c, uint32_t now_ms)
{
    if (c->state == LD_CMD_IDLE) return 0;
    if (c->state == LD_CMD_SENDING) {
        if (c->frame_pos < c->frame_len) {
            c->tx(c->frame[c->frame_pos++]);
            return 1;
        }
        c->state = LD_CMD_WAIT_ACK;
        c->t_start = now_ms;
        return 0;
    }
    if (c->state == LD_CMD_WAIT_ACK && now_ms - c->t_start > 500u) {
        if (c->retries++ >= 3) {
            c->state = LD_CMD_IDLE;
            c->done = 1;
            c->ok = 0;
            return 0;
        }
        c->frame_pos = 0;
        c->state = LD_CMD_SENDING;
        c->t_start = now_ms;
        return 1;
    }
    return 0;
}

/* Feed an incoming ACK byte. Returns 1 when the command completed. */
int ld_cmd_ack_byte(ld_cmd_t *c, uint8_t b, uint32_t now_ms)
{
    if (c->state != LD_CMD_WAIT_ACK) { c->ack_st = 0; return 0; }

    switch (c->ack_st) {
    case 0: c->ack_st = (b == LD_FRAME_HDR0) ? 1 : 0; break;
    case 1: c->ack_st = (b == LD_FRAME_HDR1) ? 2 : (b == LD_FRAME_HDR0 ? 1 : 0); break;
    case 2: c->ack_st = (b == LD_FRAME_HDR2) ? 3 : (b == LD_FRAME_HDR0 ? 1 : 0); break;
    case 3: c->ack_st = (b == LD_FRAME_HDR3) ? 4 : (b == LD_FRAME_HDR0 ? 1 : 0); break;
    case 4: c->ack_len = b; c->ack_st = 5; break;
    case 5: c->ack_len |= (uint16_t)(b << 8);
            if (c->ack_len < 2 || c->ack_len > sizeof c->ack_buf) { c->ack_st = 0; break; }
            c->ack_n = 0; c->ack_st = 6; break;
    case 6: c->ack_buf[c->ack_n++] = b;
            if (c->ack_n >= c->ack_len) { c->ack_st = 7; c->ack_n = 0; } break;
    case 7: if (b == LD_FRAME_FOOT0) { c->ack_st = 8; } else c->ack_st = 0; break;
    case 8: if (b == LD_FRAME_FOOT1) { c->ack_st = 9; } else c->ack_st = 0; break;
    case 9: if (b == LD_FRAME_FOOT2) { c->ack_st = 10; } else c->ack_st = 0; break;
    case 10:
        if (b == LD_FRAME_FOOT3) {
            c->ack_st = 0;
            c->state = LD_CMD_IDLE;
            c->done = 1;
            uint16_t ack_cmd = (uint16_t)(c->ack_buf[0] | (c->ack_buf[1] << 8));
            c->ack_status = (c->ack_len > 2) ? c->ack_buf[2] : 1u;
            c->ok = (ack_cmd == (uint16_t)(c->cmd_word | 0x0100u)) && (c->ack_status == 0);
            c->ack_data_len = (c->ack_len > 3) ? (uint8_t)(c->ack_len - 3) : 0;
            if (c->ack_data_len) memcpy(c->ack_data, c->ack_buf + 3, c->ack_data_len);
            return 1;
        }
        c->ack_st = 0;
        break;
    }
    return 0;
}

int ld_cmd_done(const ld_cmd_t *c) { return c->done; }
int ld_cmd_ok(const ld_cmd_t *c)  { return c->ok; }

/* =========================================================================
 *  Bounded init-time command sequences
 * ========================================================================= */

static uint8_t g_seq_started = 0;

int ld_config_begin(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        uint8_t v = 0x01;
        if (!ld_cmd_send(c, LD_CMD_ENABLE_CONFIG, &v, 1, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_config_end(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_END_CONFIG, NULL, 0, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_engineering_mode(ld_cmd_t *c, int enable, uint32_t now_ms)
{
    if (!g_seq_started) {
        uint16_t cmd = enable ? LD_CMD_ENGINEERING_ON : LD_CMD_ENGINEERING_OFF;
        if (!ld_cmd_send(c, cmd, NULL, 0, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_set_motion_sensitivity(ld_cmd_t *c, const uint8_t gates[14], uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_MOTION_SENSITIVITY, gates, 14, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_set_static_sensitivity(ld_cmd_t *c, const uint8_t gates[14], uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_STATIC_SENSITIVITY, gates, 14, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_set_base_params(ld_cmd_t *c, uint8_t min_gate, uint8_t max_gate,
                       uint16_t dwell_s, uint8_t polarity, uint32_t now_ms)
{
    if (!g_seq_started) {
        uint8_t v[5] = { min_gate, max_gate,
                         (uint8_t)(dwell_s & 0xFF), (uint8_t)(dwell_s >> 8),
                         polarity };
        if (!ld_cmd_send(c, LD_CMD_BASE_PARAMS, v, 5, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_get_fw_version(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_FW_VERSION, NULL, 0, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_reboot(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_REBOOT, NULL, 0, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_factory_reset(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        if (!ld_cmd_send(c, LD_CMD_FACTORY_RESET, NULL, 0, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_disable_bluetooth(ld_cmd_t *c, uint32_t now_ms)
{
    if (!g_seq_started) {
        uint8_t v[2] = { 0x00, 0x00 };
        if (!ld_cmd_send(c, LD_CMD_SET_BLUETOOTH, v, 2, now_ms)) return 0;
        g_seq_started = 1;
    }
    if (ld_cmd_poll(c, now_ms)) return 0;
    if (c->done) { g_seq_started = 0; return 1; }
    return 0;
}

int ld_send_cmd(UART_HandleTypeDef *huart, uint16_t cmd_word, const uint8_t *val, uint16_t val_len)
{
    uint8_t frame[32];
    size_t n = ld_build_cmd_frame(cmd_word, val, (uint8_t)val_len, frame, sizeof(frame));
    if (n == 0) return -1;
    return HAL_UART_Transmit(huart, frame, (uint16_t)n, 100) == HAL_OK ? 0 : -1;
}

int ld_init_thermal_safe(UART_HandleTypeDef *huart)
{
    uint8_t enable_val[2] = { 0x01u, 0x00u };
    ld_send_cmd(huart, LD_CMD_ENABLE_CONFIG, enable_val, 2);
    HAL_Delay(30);

    uint8_t bt_off[2] = { 0x00u, 0x00u };
    ld_send_cmd(huart, LD_CMD_SET_BLUETOOTH, bt_off, 2);
    HAL_Delay(30);

    ld_send_cmd(huart, LD_CMD_ENGINEERING_OFF, NULL, 0);
    HAL_Delay(30);

    ld_send_cmd(huart, LD_CMD_END_CONFIG, NULL, 0);
    HAL_Delay(30);

    return 0;
}
