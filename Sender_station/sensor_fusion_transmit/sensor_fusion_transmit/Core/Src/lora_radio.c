#include "lora_radio.h"
#include "main.h"
#include "sx126x_hal.h"
#include <stdio.h>
#include <stdbool.h>
#include <stddef.h>

#define CTX NULL
#define RX_CONTINUOUS 0xFFFFFFu
#define CHK(x) do { \
    sx126x_status_t _st = (x); \
    if (_st != SX126X_STATUS_OK) { \
        printf("CHK fail line %d: status=%d\r\n", __LINE__, (int)_st); \
        return -1; \
    } \
} while (0)

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
    printf("radio_init: 1 reset\r\n");
    sx126x_hal_reset(CTX);
    printf("radio_init: 2 wakeup\r\n");
    sx126x_hal_wakeup(CTX);
    printf("radio_init: 3 standby\r\n");
    CHK(sx126x_set_standby(CTX, SX126X_STANDBY_CFG_RC));
#if LORA_USE_DCDC
    printf("radio_init: 4 dcdc\r\n");
    CHK(sx126x_set_reg_mode(CTX, SX126X_REG_MODE_DCDC));
#endif
#if LORA_USE_TCXO
    printf("radio_init: 5 tcxo\r\n");
    CHK(sx126x_set_dio3_as_tcxo_ctrl(CTX, SX126X_TCXO_CTRL_1_8V, 320)); /* 320 * 15.625 us = 5 ms */
    CHK(sx126x_cal(CTX, SX126X_CAL_ALL));
    HAL_Delay(10);
    CHK(sx126x_set_standby(CTX, SX126X_STANDBY_CFG_XOSC));
    HAL_Delay(5);
    CHK(sx126x_clear_device_errors(CTX));
#endif
#if LORA_USE_DIO2_RFSW
    printf("radio_init: 6 rfsw\r\n");
    CHK(sx126x_set_dio2_as_rf_sw_ctrl(CTX, true));
#endif
    printf("radio_init: 7 pkt_type\r\n");
    CHK(sx126x_set_pkt_type(CTX, SX126X_PKT_TYPE_LORA));
    /* image calibration for the 863-870 MHz band (SX1262 datasheet 9.2.1) */
    printf("radio_init: 8 cal_img\r\n");
    CHK(sx126x_cal_img(CTX, 0xD7, 0xDB));
    printf("radio_init: 9 freq\r\n");
    CHK(sx126x_set_rf_freq(CTX, LORA_FREQ_HZ));
    sx126x_pa_cfg_params_t pa = { .pa_duty_cycle = PA_DUTY, .hp_max = PA_HPMAX,
                                  .device_sel = 0x00, .pa_lut = 0x01 };
    printf("radio_init: 10 pa\r\n");
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

    sx126x_errors_mask_t err = 0;
    sx126x_get_device_errors(CTX, &err);
    sx126x_chip_status_t stat;
    sx126x_get_status(CTX, &stat);
    printf("SX1262 init: mode=%d, cmd=%d, err=0x%04x\r\n", stat.chip_mode, stat.cmd_status, (unsigned)err);
    return 0;
}

uint32_t radio_toa_ms(uint8_t len)
{
    sx126x_pkt_params_lora_t p = pkt; p.pld_len_in_bytes = len;
    return sx126x_get_lora_time_on_air_in_ms(&p, &mod);
}

int radio_send(const uint8_t *buf, uint8_t len)
{
    printf("[STM32 TX] radio_send len=%d\r\n", (int)len);
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
    static uint32_t last_poll_ms = 0;
    uint32_t now = HAL_GetTick();
    int should_poll = 0;

    if (dio1_flag || HAL_GPIO_ReadPin(LORA_DIO1_GPIO_Port, LORA_DIO1_Pin) == GPIO_PIN_SET) {
        dio1_flag = 0;
        should_poll = 1;
    } else if (now - last_poll_ms >= 50) {
        /* Fallback poll every 50ms via SPI if DIO1 pin is unasserted/unwired */
        last_poll_ms = now;
        should_poll = 1;
    }

    if (!should_poll) return RADIO_EVT_NONE;

    sx126x_irq_mask_t irq = 0;
    sx126x_status_t st = sx126x_get_irq_status(CTX, &irq);
    if (st != SX126X_STATUS_OK) {
        printf("[STM32 POLL ERR] status=%d\r\n", (int)st);
        return RADIO_EVT_ERR;
    }

    static uint32_t last_dbg_ms = 0;
    if (now - last_dbg_ms >= 1000) {
        last_dbg_ms = now;
        sx126x_chip_status_t stat;
        sx126x_get_status(CTX, &stat);
        sx126x_errors_mask_t err = 0;
        sx126x_get_device_errors(CTX, &err);
        printf("[STM32 RADIO] mode=%d, cmd=%d, irq=0x%04x, err=0x%04x\r\n",
               stat.chip_mode, stat.cmd_status, (unsigned)irq, (unsigned)err);
    }

    if (irq == 0) return RADIO_EVT_NONE;

    printf("[STM32 IRQ] detected 0x%04x\r\n", (unsigned)irq);
    sx126x_clear_irq_status(CTX, irq);

    if (irq & SX126X_IRQ_TX_DONE) {
        printf("[STM32 IRQ] TX_DONE (0x%04x)\r\n", (unsigned)irq);
        radio_start_rx();
        return RADIO_EVT_TX_DONE;
    }
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
    if (irq & SX126X_IRQ_TIMEOUT) {
        printf("[STM32 IRQ] TIMEOUT (0x%04x)\r\n", (unsigned)irq);
        radio_start_rx();
        return RADIO_EVT_TIMEOUT;
    }
    return RADIO_EVT_ERR;
}
