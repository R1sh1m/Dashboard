/* Artemis robot-side telemetry: sensors -> priority queue -> LoRa frames (see PDF Sections 3-5) */
#include "app.h"
#include "main.h"
#include "app_config.h"
#include "proto.h"
#include "gps_ubx.h"
#include "ld2412.h"
#include "lora_radio.h"
#include "bme688_port.h"
#include "bsec_wrapper.h"
#include "lcd_i2c.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

extern UART_HandleTypeDef huart2;   /* GPS   */
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
    if (h->Instance == USART2) { rb_put(&gps_rb, gps_byte); HAL_UART_Receive_IT(h, &gps_byte, 1); }
    else if (h->Instance == UART5)                     { rb_put(&ld_rb,  ld_byte);  HAL_UART_Receive_IT(h, &ld_byte, 1); }
}
void HAL_UART_ErrorCallback(UART_HandleTypeDef *h)
{
    __HAL_UART_CLEAR_OREFLAG(h); __HAL_UART_CLEAR_FEFLAG(h); __HAL_UART_CLEAR_NEFLAG(h);
    if (h->Instance == USART2) HAL_UART_Receive_IT(h, &gps_byte, 1);
    if (h->Instance == UART5) HAL_UART_Receive_IT(h, &ld_byte, 1);
}
void HAL_GPIO_EXTI_Callback(uint16_t pin){ if (pin == LORA_DIO1_Pin) radio_dio1_isr(); }

/* ------------------------------------------------------------------ state */
static ubx_parser_t ubx; static gps_data_t g_gps;
/* NMEA sentence collection buffer (NEO-M8N defaults to NMEA output) */
static char nmea_buf[120]; static uint8_t nmea_len; static bool nmea_in_msg;
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
    uint32_t orig_enq = now;
    if (coalesce) { /* periodic data: newest not-yet-sent sample replaces the old one */
        for (int i = 0; i < (int)Q_DEPTH; i++) {
            if (q[i].used && q[i].type == type && !q[i].seq_set) {
                s = i;
                orig_enq = q[i].enq_ms;  /* preserve enqueue timestamp so aging & queue order are not reset */
                break;
            }
        }
    }
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
    e->len = len; e->enq_ms = orig_enq; if (len) memcpy(e->pl, pl, len);
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
    printf("--> TX_TRY pick=%d type=%d len=%d\r\n", i, (int)e->type, (int)n);
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
{   /* REAL ADC sensing: pack voltage via voltage divider on ADC1_IN0 (PA0),
     * current via shunt amplifier on ADC1_IN1 (PA1). Direct register access
     * (no HAL ADC driver in this project). */
    static int adc_init_done = 0;
    if (!adc_init_done) {
        RCC->APB2ENR |= RCC_APB2ENR_ADC1EN;          /* enable ADC1 clock */
        GPIOA->MODER |= (3u << (0 * 2)) | (3u << (1 * 2));  /* PA0, PA1 analog mode */
        ADC1->CR1 = 0;
        ADC1->CR2 = 0;
        ADC1->SQR1 = 0;                              /* 1 conversion */
        ADC1->SQR2 = 0;
        ADC1->SQR3 = 0;                              /* channel 0 first */
        ADC1->SMPR2 = 0;                             /* 3-cycle sampling */
        ADC1->CR2 |= ADC_CR2_ADON;                   /* enable ADC */
        adc_init_done = 1;
    }
    /* Channel 0: pack voltage */
    ADC1->SQR3 = 0;
    ADC1->CR2 |= ADC_CR2_SWSTART;
    while (!(ADC1->SR & ADC_SR_EOC));
    uint32_t adc_v = ADC1->DR;
    *mv = (uint16_t)((uint64_t)adc_v * 3300u * 11u / 4095u);
    /* Channel 1: pack current */
    ADC1->SQR3 = 1u;
    ADC1->CR2 |= ADC_CR2_SWSTART;
    while (!(ADC1->SR & ADC_SR_EOC));
    uint32_t adc_i = ADC1->DR;
    *ma = (uint16_t)((uint64_t)adc_i * 806u / 500u);
    /* SoC from voltage (3S: 3.3..4.2 V per cell = 9900..12600 mV) */
    uint32_t s = 0;
    if (*mv >= 12600u) s = 100;
    else if (*mv <= 9900u) s = 0;
    else s = 100u * (*mv - 9900u) / (12600u - 9900u);
    *soc = (uint8_t)s;
}
static void send_gps(uint32_t now)
{
    pl_gps_t p = { now, g_gps.lat_e7, g_gps.lon_e7, g_gps.alt_cm, g_gps.speed_cms,
                   g_gps.hdg_cdeg, g_gps.fix, g_gps.sats, g_gps.hdop_x10 };
    txq_push(PKT_GPS_CRITICAL, FLAG_PRIORITY, 2, 0, &p, sizeof p, 1);
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
    uint16_t mv, ma; uint8_t soc;
    power_read_adc(now, &mv, &ma, &soc);
    pl_power_t p = { .t_ms = now, .est_mv = mv, .est_ma = ma, .est_soc = soc };
    txq_push(PKT_POWER_CRIT, 0, 2, 0, &p, sizeof p, 1);
}

static void send_env(uint32_t now)
{
    pl_env_t p = { now, g_env.temp_c100, g_env.hum_c100, g_env.press_dhpa, g_env.gas_ohm,
                   g_env.iaq, (uint8_t)(g_env.gas_valid | (g_env.heat_stab << 1)) };
    txq_push(PKT_ENV, 0, 2, 0, &p, sizeof p, 1);
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
    uint16_t mv, ma; uint8_t soc_dummy; power_read_adc(now, &mv, &ma, &soc_dummy); t.soc = soc_dummy;
    if (sizeof t <= FRAG_CHUNK) txq_push(PKT_TELEMETRY, 0, 3, 0, &t, sizeof t, 1);
    else send_fragmented(PKT_TELEMETRY, (const uint8_t *)&t, sizeof t);
}

/* ------------------------------------------------------------------ GPS config (UBX) */
static void ubx_tx(uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t len)
{
    uint8_t b[96]; size_t n = ubx_build(b, cls, id, pl, len);
    HAL_UART_Transmit(&huart2, b, (uint16_t)n, 100); HAL_Delay(25);
}

/* Wait up to 600 ms for a UBX-ACK-ACK matching (cls,id) after a config command.
   Drains the GPS ring buffer non-blockingly and feeds bytes through UBX parser. */
static int ubx_wait_ack(uint8_t cls, uint8_t id)
{
    uint32_t t0 = HAL_GetTick();
    ubx_ack_clear();
    while ((int32_t)(HAL_GetTick() - t0) < 600) {
        uint8_t c;
        while (rb_get(&gps_rb, &c)) {
            ubx_feed(&ubx, c, &g_gps, HAL_GetTick());
        }
        if (ubx_ack_seen(cls, id)) return 1;
        HAL_Delay(5);
    }
    return 0;
}

static void gps_configure(void)
{
    /* Keep UART2 at 9600 baud (u-blox factory default) */
    /* 1. CFG-MSG: Enable NAV-PVT at 1 per navigation cycle on UART1 (8 bytes) */
    const uint8_t pvt[8]  = { 0x01, 0x07, 0, 1, 0, 0, 0, 0 };
    /* 2. CFG-MSG: Enable NAV-DOP at 1 per navigation cycle on UART1 (8 bytes) */
    const uint8_t dop[8]  = { 0x01, 0x04, 0, 1, 0, 0, 0, 0 };
    /* 3. CFG-RATE: 1000 ms (1 Hz) measurement rate for fast, sensitive satellite lock */
    const uint8_t rate[6] = { 0xE8, 0x03, 0x01, 0x00, 0x01, 0x00 };
    /* 4. CFG-NAV5: Window / degraded environment navigation engine configuration (36 bytes):
     *    mask: 0x0117 (apply dynModel, minEl, posFixMode, pDop, cnoThreshold)
     *    dynModel: 0 (Portable - lowest motion filter thresholds)
     *    fixMode: 3 (Auto 2D/3D - allows 2D fix with 3 satellites)
     *    minElev: 5 degrees (enables low-elevation window satellites)
     *    pDop: 450 (45.0 PDOP limit; allows window geometry where satellites are only on 1 side)
     *    cnoThresh: 15 dB-Hz (allows attenuated window glass signals 15-26 dB-Hz to be used)
     *    cnoThreshNumSVs: 3 (only 3 satellites >= 15 dB-Hz required) */
    uint8_t nav5[36] = { 0 };
    nav5[0] = 0x17; nav5[1] = 0x01;
    nav5[2] = 0x00;
    nav5[3] = 0x03;
    nav5[12] = 0x05;
    nav5[14] = 0xC2; nav5[15] = 0x01;
    nav5[24] = 0x0F;
    nav5[25] = 0x03;

    /* 5. CFG-NAVX5: Enable AssistNow Autonomous (AOP) for rapid indoor/window TTFF (40 bytes):
     *    mask1: 0x4000 (apply aopCfg) at offset 2
     *    aopCfg: 0x01 (useAOP = 1) at offset 27 */
    uint8_t navx5[40] = { 0 };
    navx5[2] = 0x00; navx5[3] = 0x40;
    navx5[27] = 0x01;

    int ok = 1;
    ubx_tx(0x06, 0x01, pvt, 8);   int a1 = ubx_wait_ack(0x06, 0x01); ok &= a1;
    ubx_tx(0x06, 0x01, dop, 8);   int a2 = ubx_wait_ack(0x06, 0x01); ok &= a2;
    ubx_tx(0x06, 0x08, rate, 6);  int a3 = ubx_wait_ack(0x06, 0x08); ok &= a3;
    ubx_tx(0x06, 0x24, nav5, 36); int a4 = ubx_wait_ack(0x06, 0x24); ok &= a4;
    ubx_tx(0x06, 0x23, navx5, 40);int a5 = ubx_wait_ack(0x06, 0x23); ok &= a5;
    printf("GPS config: pvt=%d dop=%d rate=%d nav5=%d aop=%d (all_ok=%d)\r\n", a1, a2, a3, a4, a5, ok);
}

/* ------------------------------------------------------------------ LCD */
static void lcd_update(uint32_t now)
{
    char a[24], b[24]; int t = g_env.temp_c100;
    if (!g_gps.last_ms) {
        snprintf(a, sizeof a, "Wait GPS data...");
    } else {
        snprintf(a, sizeof a, "F%u S%02u TX%04u", g_gps.fix, g_gps.sats, g_tx_count);
    }

    /* Row 1: If coordinates exist, alternate every 3 seconds between Environmental and Coordinates */
    if ((g_gps.lat_e7 != 0 && g_gps.lon_e7 != 0) && ((now / 3000u) & 1)) {
        int32_t lat = g_gps.lat_e7;
        int32_t lon = g_gps.lon_e7;
        char lat_c = (lat >= 0) ? 'N' : 'S';
        char lon_c = (lon >= 0) ? 'E' : 'W';
        if (lat < 0) lat = -lat;
        if (lon < 0) lon = -lon;
        snprintf(b, sizeof b, "%02ld.%04ld%c %03ld.%03ld%c",
                 (long)(lat / 10000000L), (long)((lat % 10000000L) / 1000L), lat_c,
                 (long)(lon / 10000000L), (long)((lon % 10000000L) / 10000L), lon_c);
    } else {
        snprintf(b, sizeof b, "%d.%uC %u%% R:%c%03u", t / 100, (unsigned)((t < 0 ? -t : t) % 100) / 10,
                 g_env.hum_c100 / 100, g_rad.state ? 'M' : '-', g_rad.mov_cm > 999 ? 999 : g_rad.mov_cm);
    }
    (void)now; lcd_print(0, a); lcd_print(1, g_estop ? "** E-STOP **" : b);
}

/* ------------------------------------------------------------------ init / loop */
/* Independent Watchdog: LSI ~32 kHz, prescaler /256 (PR=6), reload 500
 * Timeout = (500+1) * 256 / 32000 ≈ 4.0 seconds window.  Kick in app_loop() each pass. */
static void iwdg_init(void)
{
    /* Enable LSI clock */
    RCC->CSR |= RCC_CSR_LSION;
    uint32_t t0 = HAL_GetTick();
    while (!(RCC->CSR & RCC_CSR_LSIRDY)) {
        if (HAL_GetTick() - t0 > 100) break;
    }

    IWDG->KR = 0x00005555u;          /* enable write access to PR/RLR */
    uint32_t sr_t0 = HAL_GetTick();
    while (IWDG->SR != 0u) {
        if (HAL_GetTick() - sr_t0 > 50) break;
    }
    IWDG->PR = 6u;                   /* /256 prescaler */
    IWDG->RLR = 500u;                /* ~4.0s window */
    sr_t0 = HAL_GetTick();
    while (IWDG->SR != 0u) {
        if (HAL_GetTick() - sr_t0 > 50) break;
    }
    IWDG->KR = 0x0000CCCCu;          /* start the watchdog */
    IWDG->KR = 0x0000AAAAu;          /* first reload (kick) */
}

void app_init(void)
{
    const char *boot_msg = "\r\n=== SENDER TX BOOT ===\r\n";
    HAL_UART_Transmit(&huart3, (uint8_t *)boot_msg, (uint16_t)strlen(boot_msg), 100);
    printf("Sender TX start\r\n");

    /* All inits below return quickly with an ok/fail flag.  None blocks
     * indefinitely: lcd_init is time-bounded, bme/radio/gps use bounded HAL
     * timeouts, and app_loop retries LCD hot-plug every 1500 ms. */
    printf(">>> About to init LCD\r\n");
    g_lcd_ok = (lcd_init() == 0); lcd_print(0, "Sender booting");
    printf(">>> LCD init done (g_lcd_ok=%d)\r\n", g_lcd_ok);
    printf(">>> About to init BME688\r\n");
    g_bme_ok = (bme_port_init() == 0);   printf("BME688 %s\r\n", g_bme_ok ? "ok" : "FAIL");
    if (g_bme_ok) {
        bsec_library_return_t bsec_ret = bsec_wrapper_init();
        printf("BSEC init %s\r\n", bsec_ret == BSEC_OK ? "ok" : "FAIL");
    }
    int r = radio_init();                printf("SX1262 %s\r\n", r == 0 ? "ok" : "FAIL");
    if (r == 0) radio_start_rx();
    __HAL_UART_CLEAR_OREFLAG(&huart2);
    __HAL_UART_CLEAR_FEFLAG(&huart2);
    __HAL_UART_CLEAR_NEFLAG(&huart2);
    HAL_UART_Receive_IT(&huart2, &gps_byte, 1);
    HAL_UART_Receive_IT(&huart5, &ld_byte, 1);
    gps_configure();
    bucket_t = HAL_GetTick(); bucket_us = BUCKET_MAX_US;
    rnd_state ^= DWT->CYCCNT | 1u;

    /* Start the independent watchdog once all peripherals are configured */
    iwdg_init();
    printf("App ready, entering main loop\r\n");
}

/* Pure integer decimal string parser scaled by 10^decimals (no float/double FPU) */
static int32_t parse_fixed(const char *s, int decimals)
{
    if (!s || !*s) return 0;
    int sign = 1;
    if (*s == '-') { sign = -1; s++; }
    else if (*s == '+') s++;
    int32_t val = 0;
    while (*s >= '0' && *s <= '9') {
        val = val * 10 + (*s - '0');
        s++;
    }
    if (*s == '.') {
        s++;
        int count = 0;
        while (*s >= '0' && *s <= '9' && count < decimals) {
            val = val * 10 + (*s - '0');
            s++; count++;
        }
        while (count < decimals) {
            val *= 10; count++;
        }
    } else {
        for (int i = 0; i < decimals; i++) val *= 10;
    }
    return val * sign;
}

/* Parse NMEA DDMM.MMMMM into 1e7 decimal degrees using pure integer math */
static int32_t parse_nmea_coord(const char *s, char hemi, int is_lon)
{
    if (!s || !*s) return 0;
    const char *dot = strchr(s, '.');
    int min_start = 0;
    if (dot) {
        min_start = (int)(dot - s) - 2;
        if (min_start < 0) min_start = 0;
    } else {
        min_start = is_lon ? 3 : 2;
    }
    int deg = 0;
    for (int i = 0; i < min_start; i++) {
        if (s[i] >= '0' && s[i] <= '9') deg = deg * 10 + (s[i] - '0');
    }
    int32_t min_1e5 = parse_fixed(s + min_start, 5);
    int64_t deg_1e7 = (int64_t)deg * 10000000LL + ((int64_t)min_1e5 * 100LL) / 60LL;
    if (hemi == 'S' || hemi == 'W') deg_1e7 = -deg_1e7;
    return (int32_t)deg_1e7;
}

void app_loop(void)
{
    static uint32_t t_gps, t_hb, t_pwr, t_env, t_tel, t_lcd, t_alert; static uint8_t last_det;
    uint32_t now = HAL_GetTick(); uint8_t c;

    /* Kick the independent watchdog every pass (~500 ms window) so a
     * transient fault or brownout triggers an automatic reset + reboot. */
    IWDG->KR = 0x0000AAAAu;

    while (rb_get(&gps_rb, &c)) {
        /* ---- NMEA sentence collection ---- */
        if (c == '$') {
            nmea_len = 0; nmea_in_msg = true; nmea_buf[nmea_len++] = (char)c; nmea_buf[nmea_len] = '\0';
        }
        else if (nmea_in_msg) {
            if (c == '\n' || c == '\r') {
                if (nmea_len > 0) {
                    nmea_buf[nmea_len] = '\0';
                    printf("[NMEA] %s\r\n", nmea_buf);
                    /* Safe field extraction using comma tokens */
                    char *f[18] = {0};
                    int f_idx = 0;
                    char *cur = nmea_buf;
                    while (cur && f_idx < 18) {
                        f[f_idx++] = cur;
                        cur = strchr(cur, ',');
                        if (cur) {
                            *cur = '\0';
                            cur++;
                        }
                    }

                    if (strncmp(nmea_buf, "$GPGGA", 6) == 0 || strncmp(nmea_buf, "$GNGGA", 6) == 0) {
                        /* f[0]=sentence, f[1]=time, f[2]=lat, f[3]=N/S, f[4]=lon, f[5]=E/W, f[6]=fix, f[7]=sats */
                        if (f_idx > 6 && f[6] && *f[6]) {
                            uint8_t q = (uint8_t)atoi(f[6]);
                            if (q > 0) {
                                g_gps.fix = (q == 1) ? 3 : (q == 2 ? 4 : q);
                                g_gps.last_fix_ms = now ? now : 1;
                            } else {
                                /* Holdover: maintain 2D fix for GPS_HOLDOVER_MS if satellites fluctuate at window */
                                if (g_gps.last_fix_ms && (now - g_gps.last_fix_ms < GPS_HOLDOVER_MS)) {
                                    if (g_gps.fix < 2) g_gps.fix = 2; /* 2D holdover */
                                } else {
                                    g_gps.fix = 0;
                                }
                            }
                        }
                        if (f_idx > 7 && f[7] && *f[7]) {
                            uint8_t used = (uint8_t)atoi(f[7]);
                            if (used > 0 || g_gps.fix > 0) g_gps.sats = used;
                        }
                        if (f_idx > 3 && f[2] && *f[2] && f[3] && *f[3]) {
                            g_gps.lat_e7 = parse_nmea_coord(f[2], *f[3], 0);
                        }
                        if (f_idx > 5 && f[4] && *f[4] && f[5] && *f[5]) {
                            g_gps.lon_e7 = parse_nmea_coord(f[4], *f[5], 1);
                        }
                        if (f_idx > 8 && f[8] && *f[8]) {
                            int32_t hdop = parse_fixed(f[8], 1);
                            if (hdop > 0 && hdop < 990) g_gps.hdop_x10 = (uint8_t)hdop;
                        }
                        if (f_idx > 9 && f[9] && *f[9]) {
                            g_gps.alt_cm = parse_fixed(f[9], 2);
                        }
                        g_gps.last_ms = now ? now : 1;
                    }
                    else if (strncmp(nmea_buf, "$GPRMC", 6) == 0 || strncmp(nmea_buf, "$GNRMC", 6) == 0) {
                        /* f[2]=status ('A'=valid, 'V'=warning) */
                        if (f_idx > 2 && f[2] && *f[2] == 'A') {
                            if (g_gps.fix == 0) g_gps.fix = 3;
                            g_gps.last_fix_ms = now ? now : 1;
                        }
                        /* f[7]=speed_knots, f[8]=cog_degrees */
                        if (f_idx > 7 && f[7] && *f[7]) {
                            /* knots * 51.4444 cm/s */
                            int32_t k100 = parse_fixed(f[7], 2);
                            g_gps.speed_cms = (uint16_t)((k100 * 5144LL) / 10000LL);
                        }
                        if (f_idx > 8 && f[8] && *f[8]) {
                            g_gps.hdg_cdeg = (uint16_t)parse_fixed(f[8], 2);
                        }
                        g_gps.last_ms = now ? now : 1;
                    }
                    else if (strncmp(nmea_buf, "$GPGSV", 6) == 0 ||
                             strncmp(nmea_buf, "$GLGSV", 6) == 0 ||
                             strncmp(nmea_buf, "$GAGSV", 6) == 0 ||
                             strncmp(nmea_buf, "$GBGSV", 6) == 0 ||
                             strncmp(nmea_buf, "$GNGSV", 6) == 0) {
                        static uint8_t gsv_gp = 0, gsv_gl = 0, gsv_ga = 0, gsv_gb = 0;
                        if (strncmp(nmea_buf, "$GPGSV", 6) == 0) {
                            if (f_idx > 3 && f[3] && *f[3]) gsv_gp = (uint8_t)atoi(f[3]);
                        } else if (strncmp(nmea_buf, "$GLGSV", 6) == 0) {
                            if (f_idx > 3 && f[3] && *f[3]) gsv_gl = (uint8_t)atoi(f[3]);
                        } else if (strncmp(nmea_buf, "$GAGSV", 6) == 0) {
                            if (f_idx > 3 && f[3] && *f[3]) gsv_ga = (uint8_t)atoi(f[3]);
                        } else if (strncmp(nmea_buf, "$GBGSV", 6) == 0) {
                            if (f_idx > 3 && f[3] && *f[3]) gsv_gb = (uint8_t)atoi(f[3]);
                        } else if (strncmp(nmea_buf, "$GNGSV", 6) == 0) {
                            if (f_idx > 3 && f[3] && *f[3]) gsv_gp = (uint8_t)atoi(f[3]);
                        }
                        uint16_t total_view = (uint16_t)gsv_gp + gsv_gl + gsv_ga + gsv_gb;
                        if (total_view > 99) total_view = 99;
                        if (g_gps.fix == 0) {
                            g_gps.sats = (uint8_t)total_view;
                        }
                        g_gps.last_ms = now ? now : 1;
                    }
                }
                nmea_in_msg = false;
            }
            else if (nmea_len < sizeof(nmea_buf) - 1) {
                nmea_buf[nmea_len++] = (char)c;
            }
        }
        /* ---- UBX binary parsing (fallback if module switched to UBX) ---- */
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
            g_bme_busy = 0; g_env_ok = (bme_port_read(&g_env) == 0);
            if (g_env_ok) {
                printf("BME688: Temp=%d.%02d C, Hum=%d.%02d %%, Press=%d hPa\r\n",
                       g_env.temp_c100 / 100, abs(g_env.temp_c100 % 100),
                       g_env.hum_c100 / 100, g_env.hum_c100 % 100,
                       g_env.press_dhpa / 10);
                /* Compute IAQ via BSEC */
                uint16_t iaq = 0xFFFF;
                uint8_t iaq_acc = 0;
                float temp = g_env.temp_c100 / 100.0f;
                float hum = g_env.hum_c100 / 100.0f;
                float press = g_env.press_dhpa * 100.0f;   /* dhPa -> Pa */
                bsec_wrapper_process(temp, hum, press, (float)g_env.gas_ohm, &iaq, &iaq_acc);
                g_env.iaq = iaq;
                g_env.iaq_accuracy = iaq_acc;
                send_env(now);
            } else {
                g_bme_ok = 0;
                printf("BME688 read failed; retrying sensor initialization\r\n");
            }
        }
    } else {
        static uint32_t last_bme_retry = 0;
        if (now - last_bme_retry >= 2500) {
            last_bme_retry = now;
            if (bme_port_init() == 0) {
                g_bme_ok = 1;
                printf("\r\n*** BME688 DETECTED & INITIALIZED! ***\r\n");
            }
        }
    }
    if (g_gps.last_ms && now - t_gps >= GPS_PERIOD_MS) {
        t_gps = now;
        send_gps(now);
    }
    /* Periodic diagnostic print every 2 seconds */
    static uint32_t gps_log_t = 0;
    if (now - gps_log_t >= 2000) {
        gps_log_t = now;
        printf("[STATUS] fix=%u sats=%u lat=%ld lon=%ld alt=%ldcm | TX=%u drops=%u\r\n",
               g_gps.fix, g_gps.sats, (long)g_gps.lat_e7, (long)g_gps.lon_e7, (long)g_gps.alt_cm, g_tx_count, g_drops);
    }
    /* Auto-recovery: if GPS fix stays at 0 for > 30 seconds (or after boot at window),
     * automatically re-apply the window-optimized UBX acquisition settings. */
    static uint32_t last_gps_reconfig = 0;
    if (g_gps.fix == 0) {
        if (now - last_gps_reconfig >= 30000u) {
            last_gps_reconfig = now;
            printf("[GPS] Auto-recovery: fix=0 at window, re-applying acquisition configuration...\r\n");
            gps_configure();
        }
    } else {
        last_gps_reconfig = now;
    }
    if (now - t_hb  >= HEARTBEAT_MS) { t_hb  = now; send_status(now); }
    if (now - t_pwr >= POWER_MS)     { t_pwr = now; send_power(now); }
    if (now - t_tel >= TELEM_MS)     { t_tel = now; send_telemetry(now); }
    if (now - t_lcd >= LCD_MS) {
        t_lcd = now;
        if (g_lcd_ok) {
            lcd_update(now);
        } else {
            static uint32_t last_lcd_retry = 0;
            if (now - last_lcd_retry >= 1500) {
                last_lcd_retry = now;
                if (lcd_init() == 0) {
                    g_lcd_ok = 1;
                    lcd_print(0, "Artemis Online");
                    printf("\r\n*** LCD HOT-PLUG DETECTED & INITIALIZED! ***\r\n");
                }
            }
        }
    }

    duty_refill(now);
    tx_try(now);
}
