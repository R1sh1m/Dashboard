#include "lora_radio.h"
#include "main.h"
#include "sx126x_hal.h"
#include <stdbool.h>
#include <stddef.h>

#define CTX NULL
#define RX_CONTINUOUS 0xFFFFFFu
#define CHK(x) do { if ((x) != SX126X_STATUS_OK) return -1; } while (0)

static volatile uint8_t dio1_flag;

static sx126x_mod_params_lora_t mod = {
    .sf = LORA_SF, .bw = LORA_BW, .cr = LORA_CR, .ldro = LORA_LDRO };
static sx126x_pkt_params_lora_t pkt = {
    .preamble_len_in_symb = LORA_PREAMBLE, .header_type = SX126X_LORA_PKT_EXPLICIT,
    .pld_len_in_bytes = 255, .crc_is_on = true, .invert_iq_is_on = false };

/* SX1262 PA settings, datasheet Table 13-21 */
#if   LORA_TX_DBM >= 22
 #define PA_DUTY 0x04
 #define PA_HPMAX 0x07
#elif LORA_TX_DBM >= 20
 #define PA_DUTY 0x03
 #define PA_HPMAX 0x05
#elif LORA_TX_DBM >= 17
 #define PA_DUTY 0x02
 #define PA_HPMAX 0x03
#else
 #define PA_DUTY 0x02
 #define PA_HPMAX 0x02
#endif

static void ant(int tx)
{
#if LORA_USE_RXTX_PINS
    HAL_GPIO_WritePin(LORA_TXEN_GPIO_Port, LORA_TXEN_Pin, tx ? GPIO_PIN_SET : GPIO_PIN_RESET);
    HAL_GPIO_WritePin(LORA_RXEN_GPIO_Port, LORA_RXEN_Pin, tx ? GPIO_PIN_RESET : GPIO_PIN_SET);
#else
    (void)tx;
#endif
}

void radio_dio1_isr(void) { dio1_flag = 1; }

int radio_init(void)
{
    sx126x_hal_reset(CTX);
    sx126x_hal_wakeup(CTX);
    CHK(sx126x_set_standby(CTX, SX126X_STANDBY_CFG_RC));
#if LORA_USE_DCDC
    CHK(sx126x_set_reg_mode(CTX, SX126X_REG_MODE_DCDC));
#endif
#if LORA_USE_TCXO
    CHK(sx126x_set_dio3_as_tcxo_ctrl(CTX, SX126X_TCXO_CTRL_1_8V, 320)); /* 320 * 15.625 us = 5 ms */
    CHK(sx126x_cal(CTX, SX126X_CAL_ALL));
#endif
#if LORA_USE_DIO2_RFSW
    CHK(sx126x_set_dio2_as_rf_sw_ctrl(CTX, true));
#endif
    CHK(sx126x_set_pkt_type(CTX, SX126X_PKT_TYPE_LORA));
    /* image calibration for the 863-870 MHz band (SX1262 datasheet 9.2.1) */
    CHK(sx126x_cal_img(CTX, 0xD7, 0xDB));
    CHK(sx126x_set_rf_freq(CTX, LORA_FREQ_HZ));
    sx126x_pa_cfg_params_t pa = { .pa_duty_cycle = PA_DUTY, .hp_max = PA_HPMAX,
                                  .device_sel = 0x00, .pa_lut = 0x01 };
    CHK(sx126x_set_pa_cfg(CTX, &pa));
    CHK(sx126x_set_tx_params(CTX, LORA_TX_DBM, SX126X_RAMP_200_US));
    CHK(sx126x_set_buffer_base_address(CTX, 0, 0));
    CHK(sx126x_set_lora_mod_params(CTX, &mod));
    CHK(sx126x_set_lora_pkt_params(CTX, &pkt));
    CHK(sx126x_set_lora_sync_word(CTX, LORA_SYNCWORD));
    CHK(sx126x_cfg_rx_boosted(CTX, true));
    const uint16_t m = SX126X_IRQ_TX_DONE | SX126X_IRQ_RX_DONE | SX126X_IRQ_TIMEOUT |
                       SX126X_IRQ_CRC_ERROR | SX126X_IRQ_HEADER_ERROR;
    CHK(sx126x_set_dio_irq_params(CTX, m, m, 0, 0));
    CHK(sx126x_clear_irq_status(CTX, SX126X_IRQ_ALL));
    dio1_flag = 0;
    return 0;
}

uint32_t radio_toa_ms(uint8_t len)
{
    sx126x_pkt_params_lora_t p = pkt; p.pld_len_in_bytes = len;
    return sx126x_get_lora_time_on_air_in_ms(&p, &mod);
}

int radio_send(const uint8_t *buf, uint8_t len)
{
    CHK(sx126x_set_standby(CTX, SX126X_STANDBY_CFG_RC));
    ant(1);
    pkt.pld_len_in_bytes = len;
    CHK(sx126x_set_lora_pkt_params(CTX, &pkt));
    CHK(sx126x_set_buffer_base_address(CTX, 0, 0));
    CHK(sx126x_write_buffer(CTX, 0, buf, len));
    CHK(sx126x_clear_irq_status(CTX, SX126X_IRQ_ALL));
    CHK(sx126x_set_tx(CTX, 3000));            /* 3 s safety timeout */
    return 0;
}

void radio_start_rx(void)
{
    sx126x_set_standby(CTX, SX126X_STANDBY_CFG_RC);
    ant(0);
    pkt.pld_len_in_bytes = 255;
    sx126x_set_lora_pkt_params(CTX, &pkt);
    sx126x_clear_irq_status(CTX, SX126X_IRQ_ALL);
    sx126x_set_rx_with_timeout_in_rtc_step(CTX, RX_CONTINUOUS);
}

radio_evt_t radio_poll(radio_rx_t *rx)
{
    if (!dio1_flag) return RADIO_EVT_NONE;
    dio1_flag = 0;
    sx126x_irq_mask_t irq = 0;
    if (sx126x_get_irq_status(CTX, &irq) != SX126X_STATUS_OK) return RADIO_EVT_ERR;
    sx126x_clear_irq_status(CTX, irq);

    if (irq & SX126X_IRQ_TX_DONE) { radio_start_rx(); return RADIO_EVT_TX_DONE; }
    if (irq & SX126X_IRQ_RX_DONE) {
        if (irq & (SX126X_IRQ_CRC_ERROR | SX126X_IRQ_HEADER_ERROR)) return RADIO_EVT_ERR;
        sx126x_rx_buffer_status_t bs;
        sx126x_pkt_status_lora_t  ps;
        if (sx126x_get_rx_buffer_status(CTX, &bs) != SX126X_STATUS_OK) return RADIO_EVT_ERR;
        if (sx126x_read_buffer(CTX, bs.buffer_start_pointer, rx->buf, bs.pld_len_in_bytes) != SX126X_STATUS_OK)
            return RADIO_EVT_ERR;
        rx->len = bs.pld_len_in_bytes;
        if (sx126x_get_lora_pkt_status(CTX, &ps) == SX126X_STATUS_OK) {
            rx->rssi = ps.rssi_pkt_in_dbm; rx->snr = ps.snr_pkt_in_db;
        }
        return RADIO_EVT_RX_DONE;
    }
    if (irq & SX126X_IRQ_TIMEOUT) { radio_start_rx(); return RADIO_EVT_TIMEOUT; }
    return RADIO_EVT_ERR;
}
