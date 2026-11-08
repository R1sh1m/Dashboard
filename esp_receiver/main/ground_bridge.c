/**
 * @file ground_bridge.c
 * @brief Ground-side bridge: validates frames, reassembles fragments,
 *        maintains shadow state, emits newline-delimited JSON over USB-CDC.
 * 
 * Implements the architecture from Docs/Artemis_LoRa_Packet_Architecture.pdf §6.
 */

#include "ground_bridge.h"
#include "proto.h"
#include "lora_cfg.h"
#include "lora_radio.h"

#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/uart.h"

/* Native USB-CDC (ESP32-S3 USB OTG via TinyUSB) vs UART0 output.
 * If target is ESP32-S2/S3/P4 with native USB hardware, USE_NATIVE_USB_CDC defaults to 1.
 * On standard ESP32 (which lacks native USB OTG), USE_NATIVE_USB_CDC defaults to 0 (UART0). */
#if defined(CONFIG_IDF_TARGET_ESP32S2) || defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32P4)
#ifndef USE_NATIVE_USB_CDC
#define USE_NATIVE_USB_CDC 1
#endif
#else
#undef USE_NATIVE_USB_CDC
#define USE_NATIVE_USB_CDC 0
#endif

#if USE_NATIVE_USB_CDC
/* esp_tinyusb component not available in ESP-IDF v6.1 — fall back to UART0 */
#undef USE_NATIVE_USB_CDC
#define USE_NATIVE_USB_CDC 0
#endif

static const char *TAG = "ground_bridge";

/* ============================================================================
 * Fragment Reassembly
 * ============================================================================
 */
#define MAX_FRAG_PKTS   4
#define FRAG_TIMEOUT_MS 2000

typedef struct {
    uint16_t pkt_id;
    uint8_t frag_total;
    uint8_t frag_mask;      /* Bitmask of received fragments */
    uint32_t first_rx_ms;
    uint8_t data[255];
    uint8_t data_len;
} frag_ctx_t;

static frag_ctx_t frag_slots[MAX_FRAG_PKTS];

static frag_ctx_t* frag_find(uint16_t pkt_id)
{
    for (int i = 0; i < MAX_FRAG_PKTS; i++) {
        if (frag_slots[i].pkt_id == pkt_id) return &frag_slots[i];
    }
    return NULL;
}

static frag_ctx_t* frag_alloc(uint16_t pkt_id)
{
    /* Try to find empty slot */
    for (int i = 0; i < MAX_FRAG_PKTS; i++) {
        if (frag_slots[i].pkt_id == 0xFFFF) {
            frag_slots[i].pkt_id = pkt_id;
            return &frag_slots[i];
        }
    }
    /* Evict oldest */
    int oldest = 0;
    for (int i = 1; i < MAX_FRAG_PKTS; i++) {
        if (frag_slots[i].first_rx_ms < frag_slots[oldest].first_rx_ms) {
            oldest = i;
        }
    }
    frag_slots[oldest].pkt_id = pkt_id;
    return &frag_slots[oldest];
}

static void frag_init(void)
{
    for (int i = 0; i < MAX_FRAG_PKTS; i++) {
        frag_slots[i].pkt_id = 0xFFFF;
        frag_slots[i].frag_mask = 0;
    }
}

/**
 * @brief Process a fragment, return complete payload if assembled
 * @param fh Fragment header
 * @param payload Fragment payload (excludes frag header)
 * @param len Fragment payload length
 * @param out Output buffer for assembled data
 * @return Length of assembled data, or 0 if still waiting
 */
static int frag_process(const pl_frag_t *fh, const uint8_t *payload, uint8_t len, uint8_t *out)
{
    if (fh->frag_num >= fh->frag_total || fh->frag_total == 0) {
        ESP_LOGW(TAG, "Invalid frag: num=%u, total=%u", fh->frag_num, fh->frag_total);
        return 0;
    }
    
    uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    frag_ctx_t *slot = frag_find(fh->pkt_id);
    
    if (!slot) {
        slot = frag_alloc(fh->pkt_id);
        slot->frag_total = fh->frag_total;
        slot->frag_mask = 0;
        slot->first_rx_ms = now;
        slot->data_len = 0;
    }
    
    /* Check timeout */
    if (now - slot->first_rx_ms > FRAG_TIMEOUT_MS) {
        ESP_LOGW(TAG, "Frag timeout pkt_id=%u", fh->pkt_id);
        slot->pkt_id = 0xFFFF;
        slot = frag_alloc(fh->pkt_id);
        slot->frag_total = fh->frag_total;
        slot->frag_mask = 0;
        slot->first_rx_ms = now;
        slot->data_len = 0;
    }
    
    /* Mark fragment received */
    slot->frag_mask |= (1 << fh->frag_num);
    
    /* Copy data */
    uint16_t offset = fh->frag_num * (len); /* Assumes uniform chunk size */
    if (offset + len <= sizeof(slot->data)) {
        memcpy(slot->data + offset, payload, len);
        slot->data_len = (uint8_t)(offset + len);
    }
    
    /* Check if complete */
    uint8_t expected_mask = (fh->frag_total == 8) ? 0xFF : ((1 << fh->frag_total) - 1);
    if (slot->frag_mask == expected_mask) {
        memcpy(out, slot->data, slot->data_len);
        int complete_len = slot->data_len;
        slot->pkt_id = 0xFFFF; /* Free slot */
        return complete_len;
    }
    
    return 0;
}

/* ============================================================================
 * Shadow State (per subsystem)
 * ============================================================================
 */
typedef struct {
    pl_gps_t gps;
    uint32_t gps_t;
    pl_radar_t radar;
    uint32_t radar_t;
    pl_status_t status;
    uint32_t status_t;
    pl_power_t power;
    uint32_t power_t;
    pl_env_t env;
    uint32_t env_t;
    pl_telem_t telem;
    uint32_t telem_t;
    int8_t last_rssi;
    int8_t last_snr;
    uint16_t last_seq;
    uint16_t pkt_count;
    uint16_t drop_count;
} shadow_state_t;

static shadow_state_t shadow;
static uint8_t env_valid = 0;
static uint8_t walking_latched = 0;

static void shadow_init(void)
{
    memset(&shadow, 0, sizeof(shadow));
    shadow.last_rssi = -128;
    shadow.last_snr = 0;
    env_valid = 0;
    walking_latched = 0;
}

/**
 * @brief Update shadow state from parsed packet
 */
static void shadow_update(uint8_t type, const uint8_t *pl, uint8_t len, int8_t rssi, int8_t snr)
{
    uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    
    shadow.last_rssi = rssi;
    shadow.last_snr = snr;
    shadow.pkt_count++;
    
    switch (type) {
        case PKT_GPS_CRITICAL:
            if (len >= sizeof(pl_gps_t)) {
                memcpy(&shadow.gps, pl, sizeof(pl_gps_t));
                shadow.gps_t = now;
            }
            break;
        case PKT_RADAR_ALERT:
            if (len >= sizeof(pl_radar_t)) {
                memcpy(&shadow.radar, pl, sizeof(pl_radar_t));
                shadow.radar_t = now;
            }
            break;
        case PKT_STATUS_HEART:
            if (len >= sizeof(pl_status_t)) {
                memcpy(&shadow.status, pl, sizeof(pl_status_t));
                shadow.status_t = now;
            }
            break;
        case PKT_POWER_CRIT:
            if (len >= sizeof(pl_power_t)) {
                memcpy(&shadow.power, pl, sizeof(pl_power_t));
                shadow.power_t = now;
            }
            break;
        case PKT_ENV:
            if (len >= sizeof(pl_env_t)) {
                memcpy(&shadow.env, pl, sizeof(pl_env_t));
                shadow.env_t = now;
                env_valid = 1;
            }
            break;
        case PKT_TELEMETRY:
            if (len >= sizeof(pl_telem_t)) {
                memcpy(&shadow.telem, pl, sizeof(pl_telem_t));
                shadow.telem_t = now;
                /* Also update environmental shadow from telemetry summary */
                shadow.env.temp_c100 = shadow.telem.temp_c100;
                shadow.env.hum_c100 = shadow.telem.hum_c100;
                shadow.env.press_dhpa = shadow.telem.press_dhpa;
                shadow.env_t = now;
                if (shadow.telem.temp_c100 != 0 || shadow.telem.hum_c100 != 0 ||
                    shadow.telem.press_dhpa != 0) {
                    env_valid = 1;
                }
            }
            break;
    }
}

/* ============================================================================
 * JSON Emission over USB-CDC
 * ============================================================================
 */
#define USB_TX_BUF_SIZE 1024
#define WALKING_ENTER_SPEED_MPS 0.35
#define WALKING_EXIT_SPEED_MPS 0.15

/**
 * @brief Emit shadow state as JSON over USB-CDC
 * 
 * Format matches src/types/telemetry.ts TelemetryPacket interface.
 */
static void emit_json(void)
{
    char buf[USB_TX_BUF_SIZE];
    uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    
    /* Scale integer fields to dashboard units */
    double lat = shadow.gps.lat_e7 / 1e7;
    double lng = shadow.gps.lon_e7 / 1e7;
    double alt_m = shadow.gps.alt_cm / 100.0;
    double speed_mps = shadow.gps.speed_cms / 100.0;
    double hdop = shadow.gps.hdop_x10 / 10.0;
    double heading_deg = shadow.gps.hdg_cdeg / 100.0;
    
    double temp_c = shadow.env.temp_c100 / 100.0;
    double humidity = shadow.env.hum_c100 / 100.0;
    double pressure_hpa = shadow.env.press_dhpa / 10.0;
    double gas_kohm = shadow.env.gas_ohm / 1000.0;
    
    double voltage_v = shadow.power.est_mv / 1000.0;
    double current_a = shadow.power.est_ma / 1000.0;
    
    double radar_dist_cm = shadow.radar.mov_dist_cm;
    
    /* Derive bot uptime from telemetry summary (pl_telem_t.uptime_s) when
     * a telemetry packet has been received; fall back to system uptime. */
    uint32_t uptime_sec = (shadow.telem_t != 0) ? shadow.telem.uptime_s : (uint32_t)(now / 1000);
    
    /* IAQ: reject STM32 0xFFFF placeholder (no valid gas sensor reading) */
    uint32_t iaq_val = (shadow.env.iaq == 0xFFFF) ? 0u : (uint32_t)(shadow.env.iaq / 10);
    
    /* Anomaly flag: gas_valid bit (b0) clear in env.flags indicates anomalous
     * environmental reading. Only evaluated if actual env telemetry has been received. */
    uint8_t anomaly_flag = (env_valid && !(shadow.env.flags & 0x01)) ? 1u : 0u;

    /* Use hysteresis so GPS jitter around walking pace cannot flap the UI
     * between WALKING and STANDBY for small movements. */
    if (walking_latched) {
        if (speed_mps < WALKING_EXIT_SPEED_MPS) walking_latched = 0;
    } else if (speed_mps >= WALKING_ENTER_SPEED_MPS) {
        walking_latched = 1;
    }

    /* Derive dynamic bot operating state from telemetry signals */
    const char *bot_state = "STANDBY";
    if (walking_latched) {
        bot_state = "WALKING";
    } else if (shadow.radar.human || shadow.radar.target_state != 0) {
        bot_state = "EXPLORING";
    } else if (shadow.gps.fix < 2) {
        bot_state = "CALIBRATING";
    } else {
        bot_state = "STANDBY";
    }

    /* Derive bot control mode: FAILSAFE if loss > 20%, else AUTONOMOUS */
    double loss_pct = (shadow.drop_count > 0 && shadow.pkt_count > 0) 
                      ? (100.0 * shadow.drop_count / shadow.pkt_count) : 0.0;
    const char *bot_mode = (loss_pct > 20.0) ? "FAILSAFE" : "AUTONOMOUS";

    /* Derive loop frequency dynamically */
    static uint32_t last_pkt_time_ms = 0;
    static double live_loop_hz = 10.0;
    if (last_pkt_time_ms > 0 && now > last_pkt_time_ms) {
        uint32_t dt = now - last_pkt_time_ms;
        if (dt >= 10 && dt <= 5000) {
            live_loop_hz = 1000.0 / (double)dt;
        }
    }
    last_pkt_time_ms = now;

    /* Derive motor telemetry from activity and thermal profile */
    uint8_t motor_count = (speed_mps > 0.2 || shadow.radar.target_state == 1) ? 4u : 0u;
    double motor_temp = (temp_c > 0.0) ? (temp_c + 3.2) : 28.5;

    int snprintf_ret = snprintf(buf, sizeof(buf),
        "{"
        "\"seq\":%u,"
        "\"timestamp\":%u,"
        "\"bot_status\":{\"state\":\"%s\",\"uptime_sec\":%u,\"mode\":\"%s\",\"loop_hz\":%.1f},"
        "\"gps\":{\"lat\":%.7f,\"lng\":%.7f,\"alt_m\":%.2f,\"fix\":%u,\"sats\":%u,\"speed_mps\":%.2f,\"hdop\":%.1f,\"heading_deg\":%.1f,\"valid\":%s},"
        "\"env\":{\"temp_c\":%.1f,\"humidity_pct\":%.1f,\"pressure_hpa\":%.1f,\"gas_resistance_kohm\":%.2f,\"iaq\":%u,\"anomaly_flag\":%s,\"valid\":%s},"
        "\"radar\":{\"human_detected\":%s,\"target_state\":\"%s\",\"distance_cm\":%.0f,\"energy\":%u},"
        "\"power\":{\"voltage_v\":%.2f,\"current_a\":%.2f,\"percent\":%u,\"cell_voltages\":[%.2f,%.2f,%.2f]},"
        "\"motors\":{\"active_count\":%u,\"avg_temp_c\":%.1f,\"max_temp_c\":%.1f,\"fault_mask\":0,\"servos\":[]},"
        "\"link\":{\"rssi_dbm\":%d,\"snr_db\":%d,\"packet_loss_pct\":%.1f,\"latency_ms\":%u}"
        "}\n",
        shadow.pkt_count,
        (unsigned int)now,
        bot_state,
        (unsigned int)uptime_sec,
        bot_mode,
        live_loop_hz,
        lat, lng, alt_m,
        shadow.gps.fix, shadow.gps.sats, speed_mps, hdop, heading_deg,
        (shadow.gps.fix >= 2) ? "true" : "false",
        temp_c, humidity, pressure_hpa, gas_kohm,
        (unsigned int)iaq_val,
        (anomaly_flag ? "true" : "false"),
        (env_valid ? "true" : "false"),
        shadow.radar.human ? "true" : "false",
        shadow.radar.target_state == 0 ? "NO_TARGET" : (shadow.radar.target_state == 1 ? "MOVING" : (shadow.radar.target_state == 2 ? "STATIONARY" : "COMBINED")),
        radar_dist_cm, shadow.radar.mov_energy,
        voltage_v, current_a, (unsigned int)shadow.power.est_soc,
        voltage_v / 3.0, voltage_v / 3.0, voltage_v / 3.0,
        motor_count, motor_temp, motor_temp + 1.5,
        shadow.last_rssi, shadow.last_snr,
        loss_pct,
        (unsigned int)(now - shadow.status_t)
    );
    
    if (snprintf_ret > 0 && snprintf_ret < (int)sizeof(buf)) {
#if USE_NATIVE_USB_CDC
        /* Write JSON over native ESP32-S3 USB-CDC (TinyUSB CDC ACM).
         * tud_cdc_write is non-blocking; flush to push bytes to the host. */
        if (tud_cdc_connected()) {
            tud_cdc_write(buf, (uint32_t)snprintf_ret);
            tud_cdc_write_flush();
            ESP_LOGD(TAG, "JSON emitted over USB-CDC: %d bytes", snprintf_ret);
        } else {
            /* Host not connected to CDC port - drop the frame. */
            ESP_LOGD(TAG, "CDC not connected, dropping JSON frame (%d bytes)", snprintf_ret);
        }
#else
        /* Write to UART0 (stdout, 115200 baud) for external USB-UART bridge */
        fwrite(buf, 1, (size_t)snprintf_ret, stdout);
        fflush(stdout);
        ESP_LOGD(TAG, "JSON emitted over UART0: %d bytes", snprintf_ret);
#endif
    }
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

void ground_bridge_init(void)
{
    shadow_init();
    frag_init();

#if USE_NATIVE_USB_CDC
    /* Initialize TinyUSB CDC for native ESP32-S3 USB-CDC (/dev/ttyACM0).
     * The CDC ACM interface is handled by the TinyUSB stack; tud_cdc_write()
     * / tud_cdc_write_flush() are used in emit_json(). */
    {
        esp_tinyusb_config_t tusb_cfg = {
            .descriptor = NULL,   /* use TinyUSB default CDC descriptor */
            .string_descriptor = NULL,
            .external_phy = false,
        };
        esp_err_t err = esp_tinyusb_install(&tusb_cfg);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "esp_tinyusb_install failed: %d", err);
        } else {
            ESP_LOGI(TAG, "Native USB-CDC (TinyUSB CDC) initialized");
        }
    }
#else
    /* UART0 is already configured by ESP-IDF console at 115200 baud */
    ESP_LOGI(TAG, "Ground bridge ready (UART0 stdout @ 115200)");
#endif
}

void ground_bridge_process_frame(const uint8_t *buf, uint8_t len, int8_t rssi, int8_t snr)
{
    frame_hdr_t h;
    const uint8_t *pl;
    
    /* Validate frame */
    if (proto_parse(buf, len, &h, &pl) != 0) {
        ESP_LOGW(TAG, "Invalid frame: len=%u", len);
        shadow.drop_count++;
        return;
    }
    
    /* Check destination */
    if (h.dst != ADDR_GROUND) {
        ESP_LOGD(TAG, "Frame not for ground: dst=0x%02x", h.dst);
        return;
    }
    
    /* Handle fragmentation */
    if (h.flags & FLAG_FRAG) {
        if (h.payload_len < sizeof(pl_frag_t)) {
            ESP_LOGW(TAG, "Frag payload too short");
            return;
        }
        pl_frag_t fh;
        memcpy(&fh, pl, sizeof(fh));
        
        uint8_t assembled[255];
        int assembled_len = frag_process(&fh, pl + sizeof(fh), 
                                         (uint8_t)(h.payload_len - sizeof(fh)), 
                                         assembled);
        if (assembled_len > 0) {
            /* Reassembled - process as normal packet */
            shadow_update(h.type, assembled, (uint8_t)assembled_len, rssi, snr);
            emit_json();
        }
        return;
    }
    
    /* Non-fragmented packet */
    shadow_update(h.type, pl, h.payload_len, rssi, snr);
    
    /* Send ACK if requested */
    if (h.flags & FLAG_ACK_REQ) {
        pl_ack_t ack = { h.seq, 0 };
        uint8_t frame[255];
        size_t frame_len = proto_build(frame, PKT_ACK, FLAG_URGENT, h.seq, 
                                       ADDR_ROBOT, &ack, sizeof(ack));
        if (frame_len > 0) {
            radio_send(frame, (uint8_t)frame_len);
            ESP_LOGD(TAG, "ACK sent for seq=%u", h.seq);
        }
    }
    
    /* Emit JSON for every valid frame so the dashboard always sees fresh
     * link quality (RSSI/SNR) and an incrementing packet seq. This keeps
     * the connectivity indicators (signal bars, seq, last-contact) live. */
    emit_json();
}



