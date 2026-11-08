/* Artemis robot-side telemetry: sensors -> priority queue -> LoRa frames (see PDF Sections 3-5) */
#include "app.h"
#include "main.h"
#include "app_config.h"
#include "proto.h"
#include "gps_ubx.h"
#include "ld2412.h"
#include "lora_radio.h"
#include "bme688_port.h"
#include "lcd_i2c.h"
#include <stdio.h>
#include <string.h>

extern UART_HandleTypeDef huart4;   /* GPS   */
extern UART_HandleTypeDef huart5;   /* radar */

/* ------------------------------------------------------------------ UART RX rings */
#define RB_SZ 512u
typedef struct { volatile uint16_t h, t; uint8_t b[RB_SZ]; } rb_t;
static rb_t gps_rb, ld_rb;
static uint8_t gps_byte, ld_byte;
static void rb_put(rb_t *r, uint8_t c){ uint16_t n = (r->h + 1) % RB_SZ; if (n != r->t) { r->b[r->h] = c; r->h = n; } }
static int  rb_get(rb_t *r, uint8_t *c){ if (r->h == r->t) return 0; *c = r->b[r->t]; r->t = (r->t + 1) % RB_SZ; return 1; }

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *h)
{
    if (h->Instance == UART4) { rb_put(&gps_rb, gps_byte); HAL_UART_Receive_IT(h, &gps_byte, 1); }
    else if (h->Instance == UART5)                     { rb_put(&ld_rb,  ld_byte);  HAL_UART_Receive_IT(h, &ld_byte, 1); }
}
void HAL_UART_ErrorCallback(UART_HandleTypeDef *h)
{
    __HAL_UART_CLEAR_OREFLAG(h); __HAL_UART_CLEAR_FEFLAG(h); __HAL_UART_CLEAR_NEFLAG(h);
    if (h->Instance == UART4) HAL_UART_Receive_IT(h, &gps_byte, 1);
    if (h->Instance == UART5) HAL_UART_Receive_IT(h, &ld_byte, 1);
}
void HAL_GPIO_EXTI_Callback(uint16_t pin){ if (pin == LORA_DIO1_Pin) radio_dio1_isr(); }

/* ------------------------------------------------------------------ state */
static ubx_parser_t ubx; static gps_data_t g_gps;
static ld_parser_t  ldp; static ld_target_t g_rad;
static bme_sample_t g_env; static uint8_t g_env_ok, g_bme_ok, g_bme_busy; static uint32_t g_bme_t0;
static uint16_t g_seq, g_pktid, g_tx_count, g_retries, g_drops;
static int8_t g_rssi, g_snr;
static uint8_t g_estop, g_cmd_seen; static uint16_t g_last_cmd_seq;
static uint8_t g_lcd_ok;

/* ------------------------------------------------------------------ tx queue */
typedef struct {
    uint8_t used, type, flags, prio, ack_req, tries, seq_set, len;
    uint16_t seq; uint32_t enq_ms, not_before_ms; uint8_t pl[TXQ_PL_MAX];
} txe_t;
static txe_t q[Q_DEPTH];
typedef enum { TX_IDLE, TX_SENDING, TX_WAIT_ACK } txs_t;
static txs_t g_txs = TX_IDLE; static int g_cur = -1;
static uint32_t g_ack_deadline, g_tx_started;

static uint32_t rnd_state = 0x1234567u;
static uint32_t rnd(void){ rnd_state ^= rnd_state << 13; rnd_state ^= rnd_state >> 17; rnd_state ^= rnd_state << 5; return rnd_state; }

/* prio: 0 urgent (ACK), 1 GPS/RADAR, 2 STATUS/POWER, 3 TELEMETRY/ENV/MOTORS */
static int txq_push(uint8_t type, uint8_t flags, uint8_t prio, uint8_t ack_req,
                    const void *pl, uint8_t len, int coalesce)
{
    if (len > TXQ_PL_MAX) return -1;
    uint32_t now = HAL_GetTick(); int s = -1;
    if (coalesce)  /* periodic data: newest not-yet-sent sample replaces the old one */
        for (int i = 0; i < (int)Q_DEPTH; i++)
            if (q[i].used && q[i].type == type && !q[i].seq_set) { s = i; break; }
    if (s < 0) for (int i = 0; i < (int)Q_DEPTH; i++) if (!q[i].used) { s = i; break; }
    if (s < 0) {   /* full: evict the least important, oldest entry (never the in-flight one) */
        int v = -1;
        for (int i = 0; i < (int)Q_DEPTH; i++) {
            if (i == g_cur) continue;
            if (v < 0 || q[i].prio > q[v].prio || (q[i].prio == q[v].prio && q[i].enq_ms < q[v].enq_ms)) v = i;
        }
        if (v < 0 || q[v].prio < prio) { g_drops++; return -2; }
        g_drops++; s = v;
    }
    txe_t *e = &q[s]; memset(e, 0, sizeof *e);
    e->used = 1; e->type = type; e->flags = flags; e->prio = prio; e->ack_req = ack_req;
    e->len = len; e->enq_ms = now; if (len) memcpy(e->pl, pl, len);
    return 0;
}

static uint8_t eff_prio(const txe_t *e, uint32_t now)
{
    if (e->prio == 0) return 0;
    uint32_t age = (now - e->enq_ms) / AGING_MS;           /* aging avoids starvation */
    return (age >= (uint32_t)(e->prio - 1)) ? 1 : (uint8_t)(e->prio - age);
}
static int txq_pick(uint32_t now)
{
    int b = -1; uint8_t bp = 0xFF;
    for (int i = 0; i < (int)Q_DEPTH; i++) {
        if (!q[i].used || (int32_t)(now - q[i].not_before_ms) < 0) continue;
        uint8_t p = eff_prio(&q[i], now);
        if (b < 0 || p < bp || (p == bp && q[i].enq_ms < q[b].enq_ms)) { b = i; bp = p; }
    }
    return b;
}

/* ------------------------------------------------------------------ duty-cycle token bucket */
static uint64_t bucket_us; static uint32_t bucket_t;
#define BUCKET_MAX_US ((uint64_t)DUTY_WINDOW_S * 1000000ULL * DUTY_PERMILLE / 1000ULL)
static void duty_refill(uint32_t now)
{
    uint32_t dt = now - bucket_t; bucket_t = now;
    bucket_us += (uint64_t)dt * DUTY_PERMILLE;               /* ms * permille = us */
    if (bucket_us > BUCKET_MAX_US) bucket_us = BUCKET_MAX_US;
}
static int duty_ok(uint32_t toa_ms){ return DUTY_PERMILLE >= 1000u || bucket_us >= (uint64_t)toa_ms * 1000ULL; }
static void duty_use(uint32_t toa_ms){ if (DUTY_PERMILLE < 1000u) bucket_us -= (uint64_t)toa_ms * 1000ULL; }

/* ------------------------------------------------------------------ TX state machine */
static void tx_try(uint32_t now)
{
    if (g_txs != TX_IDLE) return;
    int i = txq_pick(now); if (i < 0) return;
    txe_t *e = &q[i];
    if (!e->seq_set) { e->seq = g_seq++; e->seq_set = 1; }   /* seq assigned at TX time => gaps == air loss */
    uint8_t fl = e->flags | (e->ack_req ? FLAG_ACK_REQ : 0);
    uint8_t frame[PROTO_MAX_FRAME];
    size_t n = proto_build(frame, e->type, fl, e->seq, ADDR_GROUND, e->pl, e->len);
    if (!n) { e->used = 0; return; }
    uint32_t toa = radio_toa_ms((uint8_t)n);
    if (!duty_ok(toa)) return;                                /* wait for budget */
    if (radio_send(frame, (uint8_t)n) != 0) { printf("radio_send fail\r\n"); return; }
    duty_use(toa);
    if (++e->tries > 1) g_retries++;
    g_tx_count++; g_cur = i; g_txs = TX_SENDING; g_tx_started = now;
}

static void retry_or_drop(txe_t *e, uint32_t now)
{
    if (e->tries > MAX_RETRY) { e->used = 0; g_drops++; return; }
    e->not_before_ms = now + (BACKOFF_BASE_MS << (e->tries - 1)) + (rnd() % BACKOFF_JITTER_MS);
}
static void on_tx_done(uint32_t now)
{
    if (g_cur < 0) { g_txs = TX_IDLE; return; }
    txe_t *e = &q[g_cur];
    if (e->ack_req) { g_txs = TX_WAIT_ACK; g_ack_deadline = now + ACK_TIMEOUT_MS; }
    else            { e->used = 0; g_cur = -1; g_txs = TX_IDLE; }
}
static void on_tx_fail(uint32_t now)
{
    if (g_cur >= 0) { txe_t *e = &q[g_cur]; if (e->ack_req) retry_or_drop(e, now); else { e->used = 0; g_drops++; } }
    g_cur = -1; g_txs = TX_IDLE;
}
static void on_ack(uint16_t seq)
{
    if (g_txs == TX_WAIT_ACK && g_cur >= 0 && q[g_cur].seq == seq) { q[g_cur].used = 0; g_cur = -1; g_txs = TX_IDLE; }
}

/* ------------------------------------------------------------------ RX (ACK / CMD) */
__attribute__((weak)) void app_on_cmd(uint8_t cmd, const uint8_t *arg, uint8_t n, uint32_t now)
{
    (void)arg; (void)n; (void)now;
    if (cmd == CMD_ESTOP) {
        g_estop = 1;
        /* TODO: drive a dedicated GPIO to the ESP32 motor controller - the PDF's STM32<->ESP32
           link is simplex (ESP32 -> STM32), so E-STOP needs its own wire. */
        printf("E-STOP received\r\n");
    } else if (cmd == CMD_SYNC_TIME) {
        printf("SYNC_TIME received\r\n");
    }
}
static void handle_rx(const radio_rx_t *r, uint32_t now)
{
    frame_hdr_t h; const uint8_t *pl;
    if (proto_parse(r->buf, r->len, &h, &pl) != 0 || h.dst != ADDR_ROBOT) return;
    g_rssi = r->rssi; g_snr = r->snr;
    if (h.type == PKT_ACK && h.payload_len >= sizeof(pl_ack_t)) {
        pl_ack_t a; memcpy(&a, pl, sizeof a); on_ack(a.acked_seq);
    } else if (h.type == PKT_CMD) {
        if (h.flags & FLAG_ACK_REQ) {                          /* stop-and-wait ACK, urgent */
            pl_ack_t a = { h.seq, 0 };
            txq_push(PKT_ACK, FLAG_URGENT, 0, 0, &a, sizeof a, 0);
        }
        int dup = g_cmd_seen && g_last_cmd_seq == h.seq;       /* ground retry after lost ACK */
        g_cmd_seen = 1; g_last_cmd_seq = h.seq;
        if (!dup && h.payload_len >= 1) app_on_cmd(pl[0], pl + 1, (uint8_t)(h.payload_len - 1), now);
    }
}

/* ------------------------------------------------------------------ packet producers */
static uint8_t sensor_flags(uint32_t now)
{
    return (uint8_t)((g_gps.fix >= 2 ? 1 : 0) | (g_bme_ok && g_env_ok ? 2 : 0) |
                     ((g_rad.t_ms && now - g_rad.t_ms < 2000) ? 4 : 0) | (g_lcd_ok ? 8 : 0));
}
static void power_read_adc(uint32_t now, uint16_t *mv, uint16_t *ma, uint8_t *soc)
{   /* ESTIMATE ONLY: assumes pack full at boot and constant average load */
    uint32_t used = (uint32_t)((uint64_t)AVG_LOAD_MA * (now / 1000u) / 3600u);
    uint32_t s = used >= BATT_CAP_MAH ? 0 : 100u - used * 100u / BATT_CAP_MAH;
    *soc = (uint8_t)s; *ma = AVG_LOAD_MA;
    *mv = (uint16_t)(9900u + (12600u - 9900u) * s / 100u);    /* 3S: 3.3..4.2 V per cell */
}
static void send_gps(uint32_t now)
{
    pl_gps_t p = { now, g_gps.lat_e7, g_gps.lon_e7, g_gps.alt_cm, g_gps.speed_cms,
                   g_gps.hdg_cdeg, g_gps.fix, g_gps.sats, g_gps.hdop_x10 };
    txq_push(PKT_GPS_CRITICAL, FLAG_PRIORITY, 1, 0, &p, sizeof p, 1);
}
static void send_radar(uint32_t now)
{
    pl_radar_t p = { now, g_rad.state, g_rad.state != 0, g_rad.mov_cm, g_rad.mov_e, g_rad.stat_cm, g_rad.stat_e };
    txq_push(PKT_RADAR_ALERT, FLAG_PRIORITY, 1, 1 /* ACK_REQ */, &p, sizeof p, 1);
}
static void send_status(uint32_t now)
{
    pl_status_t p = { now, g_tx_count, g_retries, g_drops, g_rssi, g_snr, sensor_flags(now) };
    txq_push(PKT_STATUS_HEART, 0, 2, 0, &p, sizeof p, 1);
}
static void send_power(uint32_t now)
{
    pl_power_t p; p.t_ms = now; power_read_adc(now, &p.est_mv, &p.est_ma, &p.est_soc);
    txq_push(PKT_POWER_CRIT, 0, 2, 0, &p, sizeof p, 1);
}
static void send_env(uint32_t now)
{
    pl_env_t p = { now, g_env.temp_c100, g_env.hum_c100, g_env.press_dhpa, g_env.gas_ohm,
                   0xFFFF /* IAQ n/a without BSEC */, (uint8_t)(g_env.gas_valid | (g_env.heat_stab << 1)) };
    txq_push(PKT_ENV, 0, 3, 0, &p, sizeof p, 1);
}
static void send_fragmented(uint8_t type, const uint8_t *data, uint16_t len)
{
    uint8_t total = (uint8_t)((len + FRAG_CHUNK - 1) / FRAG_CHUNK);
    uint16_t id = g_pktid++;
    for (uint8_t i = 0; i < total; i++) {
        uint8_t buf[sizeof(pl_frag_t) + FRAG_CHUNK];
        uint16_t off = (uint16_t)(i * FRAG_CHUNK), n = (uint16_t)(len - off); if (n > FRAG_CHUNK) n = FRAG_CHUNK;
        pl_frag_t fh = { id, i, total }; memcpy(buf, &fh, sizeof fh); memcpy(buf + sizeof fh, data + off, n);
        txq_push(type, FLAG_FRAG, 3, 0, buf, (uint8_t)(sizeof fh + n), 0);
    }
}
static void send_telemetry(uint32_t now)
{
    pl_telem_t t = { now, now / 1000u, g_gps.lat_e7, g_gps.lon_e7, g_gps.alt_cm, g_gps.speed_cms,
                     g_gps.hdg_cdeg, g_gps.fix, g_gps.sats, g_env.temp_c100, g_env.hum_c100,
                     g_env.press_dhpa, g_rad.state, 0, sensor_flags(now) };
    uint16_t mv, ma; power_read_adc(now, &mv, &ma, &t.soc);
    if (sizeof t <= FRAG_CHUNK) txq_push(PKT_TELEMETRY, 0, 3, 0, &t, sizeof t, 1);
    else send_fragmented(PKT_TELEMETRY, (const uint8_t *)&t, sizeof t);
}

/* ------------------------------------------------------------------ GPS config (UBX) */
static void ubx_tx(uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t len)
{
    uint8_t b[64]; size_t n = ubx_build(b, cls, id, pl, len);
    HAL_UART_Transmit(&huart4, b, (uint16_t)n, 100); HAL_Delay(25);
}
static void gps_configure(void)
{
    const uint8_t pvt[3] = { 0x01, 0x07, 1 }, dop[3] = { 0x01, 0x04, 1 };   /* CFG-MSG: NAV-PVT, NAV-DOP @1 */
    const uint8_t rate[6] = { 0xE8, 0x03, 0x01, 0x00, 0x01, 0x00 };         /* CFG-RATE: 1000 ms, GPS time */
    uint8_t nav5[36] = { 0x01, 0x00, 3 };                                   /* CFG-NAV5: dynModel = pedestrian */
    ubx_tx(0x06, 0x01, pvt, 3); ubx_tx(0x06, 0x01, dop, 3);
    ubx_tx(0x06, 0x08, rate, 6); ubx_tx(0x06, 0x24, nav5, 36);
}

/* ------------------------------------------------------------------ LCD */
static void lcd_update(uint32_t now)
{
    char a[24], b[24]; int t = g_env.temp_c100;
    snprintf(a, sizeof a, "F%u S%02u TX%04u", g_gps.fix, g_gps.sats, g_tx_count);
    snprintf(b, sizeof b, "%d.%uC %u%% R:%c%03u", t / 100, (unsigned)((t < 0 ? -t : t) % 100) / 10,
             g_env.hum_c100 / 100, g_rad.state ? 'M' : '-', g_rad.mov_cm > 999 ? 999 : g_rad.mov_cm);
    (void)now; lcd_print(0, a); lcd_print(1, g_estop ? "** E-STOP **" : b);
}

/* ------------------------------------------------------------------ init / loop */
void app_init(void)
{
    printf("\r\nArtemis TX start\r\n");
    g_lcd_ok = (lcd_init() == 0); lcd_print(0, "Artemis booting");
    g_bme_ok = (bme_port_init() == 0);   printf("BME688 %s\r\n", g_bme_ok ? "ok" : "FAIL");
    int r = radio_init();                printf("SX1262 %s\r\n", r == 0 ? "ok" : "FAIL");
    HAL_UART_Receive_IT(&huart4, &gps_byte, 1);
    HAL_UART_Receive_IT(&huart5, &ld_byte, 1);
    gps_configure();
    bucket_t = HAL_GetTick(); bucket_us = BUCKET_MAX_US;
    rnd_state ^= DWT->CYCCNT | 1u;
    radio_start_rx();
}

void app_loop(void)
{
    static uint32_t t_gps, t_hb, t_pwr, t_env, t_tel, t_lcd, t_alert; static uint8_t last_det;
    uint32_t now = HAL_GetTick(); uint8_t c;

    while (rb_get(&gps_rb, &c)) {
        static uint32_t gps_dbg_count = 0;
        gps_dbg_count++;
        if (gps_dbg_count <= 10 || gps_dbg_count % 200 == 1) {
            printf("GPS raw byte %lu: 0x%02X '%c'\n", (unsigned long)gps_dbg_count, c, (c >= 32 && c < 127) ? c : '.');
        }
        ubx_feed(&ubx, c, &g_gps, now);
    }
    while (rb_get(&ld_rb, &c))
        if (ld_feed(&ldp, c, &g_rad, now)) {                  /* event-driven radar alert */
            uint8_t det = g_rad.state != 0;
            if (det != last_det || (det && now - t_alert >= RADAR_REPEAT_MS)) {
                send_radar(now); last_det = det; t_alert = now;
            }
        }

    radio_rx_t rx; radio_evt_t ev = radio_poll(&rx);
    if (ev == RADIO_EVT_TX_DONE) on_tx_done(now);
    else if (ev == RADIO_EVT_TIMEOUT) on_tx_fail(now);
    else if (ev == RADIO_EVT_RX_DONE) handle_rx(&rx, now);

    if (g_txs == TX_WAIT_ACK && (int32_t)(now - g_ack_deadline) >= 0) {
        if (g_cur >= 0) retry_or_drop(&q[g_cur], now);
        g_cur = -1; g_txs = TX_IDLE;
    }
    if (g_txs == TX_SENDING && now - g_tx_started > 5000) { radio_init(); radio_start_rx(); on_tx_fail(now); }

    if (g_bme_ok) {                                           /* non-blocking forced-mode cycle */
        if (!g_bme_busy && now - t_env >= ENV_MS) { if (bme_port_trigger() == 0) { g_bme_busy = 1; g_bme_t0 = now; } t_env = now; }
        else if (g_bme_busy && now - g_bme_t0 >= bme_port_meas_ms()) {
            g_bme_busy = 0; g_env_ok = (bme_port_read(&g_env) == 0); if (g_env_ok) send_env(now);
        }
    }
    if (g_gps.last_ms && now - t_gps >= GPS_PERIOD_MS) { t_gps = now; send_gps(now); }
    if (now - t_hb  >= HEARTBEAT_MS) { t_hb  = now; send_status(now); }
    if (now - t_pwr >= POWER_MS)     { t_pwr = now; send_power(now); }
    if (now - t_tel >= TELEM_MS)     { t_tel = now; send_telemetry(now); }
    if (now - t_lcd >= LCD_MS)       { t_lcd = now; if (g_lcd_ok) lcd_update(now); }

    duty_refill(now);
    tx_try(now);
}
