/**
 * @file lora_radio.c
 * @brief ESP32 HAL for SX1262 LoRa transceiver
 * 
 * Ported from STM32 version to use ESP-IDF SPI master and GPIO APIs.
 * Implements the same radio_init/send/poll interface for compatibility.
 */

#include "lora_radio.h"
#include "lora_cfg.h"
#include <stdio.h>
#include <string.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_timer.h"

static const char *TAG = "lora_radio";

/* ============================================================================
 * ESP32 GPIO Pin Definitions (matches Docs/ESP32_LoRa_Wiring.md)
 * ============================================================================
 */
#define PIN_NSS_PRIMARY   GPIO_NUM_5    /* Physical wiring per Docs/ESP32_LoRa_Wiring.md */
#define PIN_NSS_ALT       GPIO_NUM_15   /* Fallback NSS pin */
#define PIN_SCK           GPIO_NUM_18
#define PIN_MOSI          GPIO_NUM_23
#define PIN_MISO          GPIO_NUM_19
#define PIN_RESET         GPIO_NUM_14   /* Output, active low */
#define PIN_BUSY          GPIO_NUM_13   /* Input, high when busy */
#define PIN_DIO1          GPIO_NUM_4    /* Input, IRQ line */
#define PIN_TXEN          GPIO_NUM_25   /* Antenna switch TX enable */
#define PIN_RXEN          GPIO_NUM_33   /* Antenna switch RX enable */

/* Active NSS pin (auto-detected between primary GPIO5 and alternate GPIO15) */
static gpio_num_t s_nss_pin = PIN_NSS_PRIMARY;

/* ============================================================================
 * SX126x Opcode Definitions (Semtech Datasheet DS_SX1261-2_V1.2)
 * ============================================================================
 */
#define SX126X_CMD_SET_SLEEP                  0x84
#define SX126X_CMD_SET_STANDBY                0x80
#define SX126X_CMD_SET_FS                     0xC1
#define SX126X_CMD_SET_TX                     0x83
#define SX126X_CMD_SET_RX                     0x82
#define SX126X_CMD_SET_REGULATOR_MODE         0x96
#define SX126X_CMD_CALIBRATE                  0x89
#define SX126X_CMD_CALIBRATE_IMAGE            0x98
#define SX126X_CMD_SET_PA_CONFIG              0x95
#define SX126X_CMD_SET_RX_TX_FALLBACK_MODE    0x93
#define SX126X_CMD_WRITE_REGISTER             0x0D
#define SX126X_CMD_READ_REGISTER              0x1D
#define SX126X_CMD_WRITE_BUFFER               0x0E
#define SX126X_CMD_READ_BUFFER                0x1E
#define SX126X_CMD_SET_DIO_IRQ_PARAMS         0x08
#define SX126X_CMD_GET_IRQ_STATUS             0x12
#define SX126X_CMD_CLEAR_IRQ_STATUS           0x02
#define SX126X_CMD_SET_DIO2_AS_RF_SWITCH_CTRL 0x9D
#define SX126X_CMD_SET_DIO3_AS_TCXO_CTRL      0x97
#define SX126X_CMD_SET_RF_FREQUENCY           0x86
#define SX126X_CMD_SET_PKT_TYPE               0x8A
#define SX126X_CMD_GET_PKT_TYPE               0x11
#define SX126X_CMD_SET_TX_PARAMS              0x8E
#define SX126X_CMD_SET_MODULATION_PARAMS      0x8B
#define SX126X_CMD_SET_PKT_PARAMS             0x8C
#define SX126X_CMD_SET_BUFFER_BASE_ADDRESS    0x8F
#define SX126X_CMD_GET_STATUS                 0xC0
#define SX126X_CMD_GET_RX_BUFFER_STATUS       0x13
#define SX126X_CMD_GET_PKT_STATUS             0x14
#define SX126X_CMD_GET_RSSI_INST              0x15
#define SX126X_CMD_GET_DEVICE_ERRORS          0x17
#define SX126X_CMD_CLEAR_DEVICE_ERRORS        0x07

/* SX126x Register Addresses */
#define SX126X_REG_LR_SYNCWORD                0x0740
#define SX126X_REG_RXGAIN                     0x08AC

/* SX126x IRQ Masks */
#define SX126X_IRQ_NONE                       0x0000
#define SX126X_IRQ_TX_DONE                    (1 << 0)  /* 0x0001 */
#define SX126X_IRQ_RX_DONE                    (1 << 1)  /* 0x0002 */
#define SX126X_IRQ_PREAMBLE_DETECTED          (1 << 2)  /* 0x0004 */
#define SX126X_IRQ_SYNC_WORD_VALID            (1 << 3)  /* 0x0008 */
#define SX126X_IRQ_HEADER_VALID               (1 << 4)  /* 0x0010 */
#define SX126X_IRQ_HEADER_ERROR               (1 << 5)  /* 0x0020 */
#define SX126X_IRQ_CRC_ERROR                  (1 << 6)  /* 0x0040 */
#define SX126X_IRQ_CAD_DONE                   (1 << 7)  /* 0x0080 */
#define SX126X_IRQ_CAD_DETECTED               (1 << 8)  /* 0x0100 */
#define SX126X_IRQ_TIMEOUT                    (1 << 9)  /* 0x0200 */
#define SX126X_IRQ_ALL                        0x03FF

/* ============================================================================
 * SPI Handle & IRQ Flag
 * ============================================================================
 */
static spi_device_handle_t spi_dev = NULL;
static volatile bool dio1_flag = false;

/* ============================================================================
 * GPIO ISR Handler
 * ============================================================================
 */
static void IRAM_ATTR dio1_isr_handler(void *arg)
{
    dio1_flag = true;
}

/* ============================================================================
 * Antenna Switch Control
 * ============================================================================
 */
static void ant_switch_set_tx(bool tx)
{
    gpio_set_level(PIN_TXEN, tx ? 1 : 0);
    gpio_set_level(PIN_RXEN, tx ? 0 : 1);
}

/* ============================================================================
 * SX126x Low-Level HAL Functions
 * ============================================================================
 */

void sx126x_hal_wait_busy(void)
{
    uint32_t start = (uint32_t)(esp_timer_get_time() / 1000);
    while (gpio_get_level(PIN_BUSY) == 1) {
        if ((uint32_t)(esp_timer_get_time() / 1000) - start > 100) {
            ESP_LOGW(TAG, "BUSY timeout");
            break;
        }
        esp_rom_delay_us(10);
    }
}

void sx126x_hal_reset(void)
{
    ESP_LOGI(TAG, "Hardware reset of SX126x (GPIO %d)", PIN_RESET);
    gpio_set_level(PIN_RESET, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(PIN_RESET, 1);
    vTaskDelay(pdMS_TO_TICKS(20));
    sx126x_hal_wait_busy();
}

void sx126x_hal_wakeup(void)
{
    gpio_set_level(s_nss_pin, 0);
    vTaskDelay(pdMS_TO_TICKS(1));
    gpio_set_level(s_nss_pin, 1);
    esp_rom_delay_us(2);
    sx126x_hal_wait_busy();
}

/**
 * @brief SPI write (blocking, atomic transaction)
 */
int sx126x_hal_write(const uint8_t *cmd, uint16_t cmd_len,
                     const uint8_t *data, uint16_t data_len)
{
    esp_err_t ret;
    uint8_t tx_buf[256];
    uint16_t total_len = cmd_len + data_len;
    if (total_len > sizeof(tx_buf)) {
        ESP_LOGE(TAG, "SPI write too large: %u", total_len);
        return -1;
    }
    memcpy(tx_buf, cmd, cmd_len);
    if (data_len > 0 && data != NULL) {
        memcpy(tx_buf + cmd_len, data, data_len);
    }

    sx126x_hal_wait_busy();
    gpio_set_level(s_nss_pin, 0);

    spi_transaction_t trans = {
        .length = total_len * 8,
        .tx_buffer = tx_buf,
        .rx_buffer = NULL,
        .flags = 0
    };
    ret = spi_device_transmit(spi_dev, &trans);

    gpio_set_level(s_nss_pin, 1);
    esp_rom_delay_us(2);
    sx126x_hal_wait_busy();

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI write failed: %d", ret);
        return -1;
    }
    return 0;
}

/**
 * @brief SPI read (blocking, atomic full-duplex with proper rx offset)
 * 
 * In ESP-IDF full-duplex SPI, MISO clocks data simultaneously during MOSI tx.
 * During cmd_len bytes, MISO receives chip status/RFU.
 * During data_len dummy bytes (0x00), MISO receives the actual slave data.
 * The payload is therefore extracted from rx_buf[cmd_len .. cmd_len + data_len - 1].
 */
int sx126x_hal_read(const uint8_t *cmd, uint16_t cmd_len,
                    uint8_t *data, uint16_t data_len)
{
    esp_err_t ret;
    uint8_t tx_buf[256];
    uint8_t rx_buf[256];
    uint16_t total_len = cmd_len + data_len;
    if (total_len > sizeof(tx_buf)) {
        ESP_LOGE(TAG, "SPI read too large: %u", total_len);
        return -1;
    }
    memcpy(tx_buf, cmd, cmd_len);
    memset(tx_buf + cmd_len, 0x00, data_len);

    sx126x_hal_wait_busy();
    gpio_set_level(s_nss_pin, 0);

    spi_transaction_t trans = {
        .length = total_len * 8,
        .tx_buffer = tx_buf,
        .rx_buffer = rx_buf,
        .flags = 0
    };
    ret = spi_device_transmit(spi_dev, &trans);

    gpio_set_level(s_nss_pin, 1);
    esp_rom_delay_us(2);
    sx126x_hal_wait_busy();

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI read failed: %d", ret);
        return -1;
    }

    if (data_len > 0 && data != NULL) {
        memcpy(data, rx_buf + cmd_len, data_len);
    }
    return 0;
}

uint32_t sx126x_hal_get_time_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000);
}

/* ============================================================================
 * SX126x Mid-Level Register / Command Wrappers
 * ============================================================================
 */

int sx126x_get_status(uint8_t *status)
{
    const uint8_t cmd[1] = { SX126X_CMD_GET_STATUS };
    return sx126x_hal_read(cmd, 1, status, 1);
}

int sx126x_get_device_errors(uint16_t *errors)
{
    const uint8_t cmd[2] = { SX126X_CMD_GET_DEVICE_ERRORS, 0x00 };
    uint8_t err_bytes[2] = { 0, 0 };
    int ret = sx126x_hal_read(cmd, 2, err_bytes, 2);
    if (ret == 0 && errors != NULL) {
        *errors = ((uint16_t)err_bytes[0] << 8) | err_bytes[1];
    }
    return ret;
}

int sx126x_clear_device_errors(void)
{
    const uint8_t cmd[3] = { SX126X_CMD_CLEAR_DEVICE_ERRORS, 0x00, 0x00 };
    return sx126x_hal_write(cmd, 3, NULL, 0);
}

int sx126x_get_irq_status(uint16_t *irq)
{
    const uint8_t cmd[2] = { SX126X_CMD_GET_IRQ_STATUS, 0x00 };
    uint8_t irq_bytes[2] = { 0, 0 };
    int ret = sx126x_hal_read(cmd, 2, irq_bytes, 2);
    if (ret == 0 && irq != NULL) {
        *irq = ((uint16_t)irq_bytes[0] << 8) | irq_bytes[1];
    }
    return ret;
}

int sx126x_clear_irq_status(uint16_t irq_mask)
{
    const uint8_t cmd[3] = {
        SX126X_CMD_CLEAR_IRQ_STATUS,
        (uint8_t)(irq_mask >> 8),
        (uint8_t)(irq_mask & 0xFF)
    };
    return sx126x_hal_write(cmd, 3, NULL, 0);
}

int sx126x_get_rssi_inst(int16_t *rssi_dbm)
{
    const uint8_t cmd[2] = { SX126X_CMD_GET_RSSI_INST, 0x00 };
    uint8_t rssi_raw = 0;
    int ret = sx126x_hal_read(cmd, 2, &rssi_raw, 1);
    if (ret == 0 && rssi_dbm != NULL) {
        *rssi_dbm = (int8_t)(-((int16_t)rssi_raw) >> 1);
    }
    return ret;
}

int sx126x_set_standby(uint8_t standby_cfg)
{
    const uint8_t cmd[2] = { SX126X_CMD_SET_STANDBY, standby_cfg };
    return sx126x_hal_write(cmd, 2, NULL, 0);
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

/**
 * @brief Initialize the LoRa radio
 * @return 0 on success, -1 on failure
 */
int radio_init(void)
{
    esp_err_t ret;
    ESP_LOGI(TAG, "Initializing SX126x GPIOs and SPI bus...");

    /* Configure inputs: BUSY, DIO1 */
    gpio_config_t in_conf = {
        .pin_bit_mask = (1ULL << PIN_BUSY) | (1ULL << PIN_DIO1),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&in_conf);

    /* Configure outputs: RESET, NSS pins, TXEN, RXEN */
    gpio_config_t out_conf = {
        .pin_bit_mask = (1ULL << PIN_RESET) | (1ULL << PIN_NSS_PRIMARY) | (1ULL << PIN_NSS_ALT) |
                        (1ULL << PIN_TXEN) | (1ULL << PIN_RXEN),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&out_conf);
    gpio_set_level(PIN_RESET, 1);
    gpio_set_level(PIN_NSS_PRIMARY, 1);
    gpio_set_level(PIN_NSS_ALT, 1);
    gpio_set_level(PIN_TXEN, 0);
    gpio_set_level(PIN_RXEN, 1); /* Enable RX antenna path */

    /* Configure DIO1 rising edge interrupt */
    gpio_config_t dio_conf = {
        .pin_bit_mask = (1ULL << PIN_DIO1),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_POSEDGE
    };
    gpio_config(&dio_conf);
    gpio_install_isr_service(0);
    gpio_isr_handler_add(PIN_DIO1, dio1_isr_handler, NULL);

    /* Initialize SPI bus (SPI2_HOST) */
    spi_bus_config_t bus_cfg = {
        .mosi_io_num = PIN_MOSI,
        .miso_io_num = PIN_MISO,
        .sclk_io_num = PIN_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 256
    };
    ret = spi_bus_initialize(SPI2_HOST, &bus_cfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "SPI bus init failed: %d", ret);
        return -1;
    }

    if (spi_dev == NULL) {
        spi_device_interface_config_t dev_cfg = {
            .clock_speed_hz = 2000000, /* 2 MHz conservative */
            .mode = 0,
            .spics_io_num = -1,        /* Managed manually via GPIO NSS */
            .queue_size = 1,
            .flags = SPI_DEVICE_NO_DUMMY
        };
        ret = spi_bus_add_device(SPI2_HOST, &dev_cfg, &spi_dev);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "SPI device add failed: %d", ret);
            return -1;
        }
    }

    /* Hardware reset */
    sx126x_hal_reset();

    /* Auto-detect NSS pin: check PIN_NSS_PRIMARY (GPIO 5) first, then PIN_NSS_ALT (GPIO 15) */
    uint8_t chip_status = 0;
    bool detected = false;

    s_nss_pin = PIN_NSS_PRIMARY;
    sx126x_hal_wakeup();
    sx126x_set_standby(0x00); /* STDBY_RC */
    if (sx126x_get_status(&chip_status) == 0) {
        uint8_t mode = (chip_status >> 4) & 0x07;
        if (mode != 0 && chip_status != 0xFF) {
            ESP_LOGI(TAG, "SX126x detected on primary NSS GPIO %d (status=0x%02x, mode=%d)",
                     s_nss_pin, chip_status, mode);
            detected = true;
        }
    }

    if (!detected) {
        ESP_LOGW(TAG, "No response on NSS GPIO %d (status=0x%02x), trying alternate GPIO %d...",
                 s_nss_pin, chip_status, PIN_NSS_ALT);
        s_nss_pin = PIN_NSS_ALT;
        sx126x_hal_wakeup();
        sx126x_set_standby(0x00);
        if (sx126x_get_status(&chip_status) == 0) {
            uint8_t mode = (chip_status >> 4) & 0x07;
            if (mode != 0 && chip_status != 0xFF) {
                ESP_LOGI(TAG, "SX126x detected on alternate NSS GPIO %d (status=0x%02x, mode=%d)",
                         s_nss_pin, chip_status, mode);
                detected = true;
            }
        }
    }

    if (!detected) {
        ESP_LOGE(TAG, "SX126x not responding on GPIO 5 or GPIO 15 (last status=0x%02x). Check wiring!", chip_status);
        s_nss_pin = PIN_NSS_PRIMARY; /* Default back to GPIO 5 */
    }

    /* Standby RC */
    sx126x_set_standby(0x00);
    vTaskDelay(pdMS_TO_TICKS(5));

    /* Check and configure oscillator (XTAL vs TCXO) */
    sx126x_clear_device_errors();
    sx126x_set_standby(0x01); /* Try STDBY_XOSC */
    vTaskDelay(pdMS_TO_TICKS(5));
    uint16_t osc_err = 0;
    sx126x_get_device_errors(&osc_err);
    uint8_t osc_stat = 0;
    sx126x_get_status(&osc_stat);
    uint8_t osc_mode = (osc_stat >> 4) & 0x07;

    if (osc_mode == 3 && (osc_err & 0x0020) == 0) {
        ESP_LOGI(TAG, "Oscillator check: Passive XTAL locked (mode=%u, errors=0x%04x)", osc_mode, osc_err);
    } else {
        ESP_LOGW(TAG, "XTAL not responding (mode=%u, err=0x%04x). Enabling TCXO on DIO3 (1.8V, 5ms)...", osc_mode, osc_err);
        sx126x_clear_device_errors();
        /* Opcode 0x97: Set DIO3 as TCXO control (1.8V = 0x02, delay = 320 steps = 0x000140) */
        uint8_t tcxo_cmd[5] = { SX126X_CMD_SET_DIO3_AS_TCXO_CTRL, 0x02, 0x00, 0x01, 0x40 };
        sx126x_hal_write(tcxo_cmd, 5, NULL, 0);
        /* Calibrate all blocks with TCXO active */
        uint8_t cal_all_cmd[2] = { SX126X_CMD_CALIBRATE, 0x7F };
        sx126x_hal_write(cal_all_cmd, 2, NULL, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        sx126x_set_standby(0x01); /* Test STDBY_XOSC with TCXO */
        vTaskDelay(pdMS_TO_TICKS(5));
        sx126x_get_device_errors(&osc_err);
        sx126x_get_status(&osc_stat);
        osc_mode = (osc_stat >> 4) & 0x07;

        if (osc_mode == 3 && (osc_err & 0x0020) == 0) {
            ESP_LOGI(TAG, "Oscillator check: TCXO 1.8V locked (mode=%u, errors=0x%04x)", osc_mode, osc_err);
        } else {
            ESP_LOGW(TAG, "TCXO 1.8V failed (mode=%u, err=0x%04x). Trying TCXO 3.3V (0x07)...", osc_mode, osc_err);
            sx126x_clear_device_errors();
            uint8_t tcxo33_cmd[5] = { SX126X_CMD_SET_DIO3_AS_TCXO_CTRL, 0x07, 0x00, 0x01, 0x40 };
            sx126x_hal_write(tcxo33_cmd, 5, NULL, 0);
            sx126x_hal_write(cal_all_cmd, 2, NULL, 0);
            vTaskDelay(pdMS_TO_TICKS(10));
            sx126x_set_standby(0x01);
            vTaskDelay(pdMS_TO_TICKS(5));
            sx126x_get_device_errors(&osc_err);
            sx126x_get_status(&osc_stat);
            osc_mode = (osc_stat >> 4) & 0x07;
            ESP_LOGI(TAG, "Oscillator check: TCXO 3.3V result (mode=%u, errors=0x%04x)", osc_mode, osc_err);
        }
    }
    sx126x_set_standby(0x00);
    vTaskDelay(pdMS_TO_TICKS(5));

#if LORA_USE_DCDC
    /* Set regulator mode to DC-DC (opcode 0x96, mode 0x01) */
    uint8_t dcdc_cmd[2] = { SX126X_CMD_SET_REGULATOR_MODE, 0x01 };
    sx126x_hal_write(dcdc_cmd, 2, NULL, 0);
#else
    /* Set regulator mode to LDO (opcode 0x96, mode 0x00) */
    uint8_t ldo_cmd[2] = { SX126X_CMD_SET_REGULATOR_MODE, 0x00 };
    sx126x_hal_write(ldo_cmd, 2, NULL, 0);
#endif

    /* Enable DIO2 as internal RF switch control (opcode 0x9D 0x01) */
    uint8_t rfsw_cmd[2] = { SX126X_CMD_SET_DIO2_AS_RF_SWITCH_CTRL, 0x01 };
    sx126x_hal_write(rfsw_cmd, 2, NULL, 0);

    /* Set packet type to LoRa (opcode 0x8A 0x01) */
    uint8_t pkt_type_cmd[2] = { SX126X_CMD_SET_PKT_TYPE, 0x01 };
    sx126x_hal_write(pkt_type_cmd, 2, NULL, 0);

    /* Calibrate Image for 863-870 MHz band (opcode 0x98 0xD7 0xDB) */
    uint8_t cal_img_cmd[3] = { SX126X_CMD_CALIBRATE_IMAGE, 0xD7, 0xDB };
    sx126x_hal_write(cal_img_cmd, 3, NULL, 0);
    vTaskDelay(pdMS_TO_TICKS(5));

    /* Set RF frequency: PLL step = (F_RF * 2^25) / F_XOSC
     * For 865.4025 MHz and 32 MHz crystal: (865402500 * 33554432) / 32000000 = 0x36165800 */
    uint32_t pll_step = (uint32_t)(((uint64_t)LORA_FREQ_HZ * (1ULL << 25) + (LORA_XOSC_FREQ_HZ / 2)) / LORA_XOSC_FREQ_HZ);
    uint8_t freq_cmd[5] = {
        SX126X_CMD_SET_RF_FREQUENCY,
        (uint8_t)((pll_step >> 24) & 0xFF),
        (uint8_t)((pll_step >> 16) & 0xFF),
        (uint8_t)((pll_step >> 8) & 0xFF),
        (uint8_t)(pll_step & 0xFF)
    };
    sx126x_hal_write(freq_cmd, 5, NULL, 0);
    ESP_LOGI(TAG, "RF Frequency set to %lu Hz (PLL step 0x%08lx, XOSC %lu Hz)", 
             (unsigned long)LORA_FREQ_HZ, (unsigned long)pll_step, (unsigned long)LORA_XOSC_FREQ_HZ);

    /* Set TX params (SX1261/SX1262 safe settings) */
    uint8_t tx_params_cmd[3] = { SX126X_CMD_SET_TX_PARAMS, (uint8_t)LORA_TX_DBM, 0x04 /* 200us ramp */ };
    sx126x_hal_write(tx_params_cmd, 3, NULL, 0);

    /* Set buffer base addresses: TX=0, RX=0 */
    uint8_t base_addr_cmd[3] = { SX126X_CMD_SET_BUFFER_BASE_ADDRESS, 0x00, 0x00 };
    sx126x_hal_write(base_addr_cmd, 3, NULL, 0);

    /* Set LoRa modulation params: SF, BW, CR, LDRO
     * BW: 0x04 for 125 kHz, 0x05 for 250 kHz
     * CR: 0x01 for CR 4/5 */
    uint8_t bw_code = (LORA_BW == 125) ? 0x04 : 0x05;
    uint8_t cr_code = (LORA_CR >= 4) ? (LORA_CR - 4) : 0x01;
    uint8_t mod_params_cmd[5] = {
        SX126X_CMD_SET_MODULATION_PARAMS,
        (uint8_t)LORA_SF,
        bw_code,
        cr_code,
        0x00 /* LDRO off for SF9/125kHz */
    };
    sx126x_hal_write(mod_params_cmd, 5, NULL, 0);

    /* Set LoRa packet params: Preamble, HeaderType, PayloadLen, CRC, InvertIQ */
    uint8_t pkt_params_cmd[7] = {
        SX126X_CMD_SET_PKT_PARAMS,
        (uint8_t)((LORA_PREAMBLE_SYMB >> 8) & 0xFF),
        (uint8_t)(LORA_PREAMBLE_SYMB & 0xFF),
        0x00, /* Explicit header */
        255,  /* Max payload length */
        0x01, /* CRC on */
        0x00  /* IQ standard */
    };
    sx126x_hal_write(pkt_params_cmd, 7, NULL, 0);

    /* Set LoRa sync word: write 0x1424 to register 0x0740 for private sync word 0x12 */
    uint8_t syncword_cmd[5] = {
        SX126X_CMD_WRITE_REGISTER,
        (uint8_t)((SX126X_REG_LR_SYNCWORD >> 8) & 0xFF),
        (uint8_t)(SX126X_REG_LR_SYNCWORD & 0xFF),
        (uint8_t)((0x04 & 0x0F) | (LORA_SYNCWORD & 0xF0)),
        (uint8_t)((0x04 & 0x0F) | ((LORA_SYNCWORD & 0x0F) << 4))
    };
    sx126x_hal_write(syncword_cmd, 5, NULL, 0);

    /* Set Rx Boosted Gain: write 0x96 to register 0x08AC (+2 dB sensitivity) */
    uint8_t rxgain_cmd[4] = {
        SX126X_CMD_WRITE_REGISTER,
        (uint8_t)((SX126X_REG_RXGAIN >> 8) & 0xFF),
        (uint8_t)(SX126X_REG_RXGAIN & 0xFF),
        0x96 /* Boosted Rx gain */
    };
    sx126x_hal_write(rxgain_cmd, 4, NULL, 0);

    /* Set IQ Polarity Workaround (DS_SX1261-2_V1.2 §15.4): write 0x0736 bit 2 = 1 */
    uint8_t iq_cmd[4] = {
        SX126X_CMD_WRITE_REGISTER,
        0x07, 0x36,
        0x0D
    };
    sx126x_hal_write(iq_cmd, 4, NULL, 0);

    /* Set DIO IRQ mask: enable all interrupts on DIO1 */
    uint8_t dio_irq_cmd[9] = {
        SX126X_CMD_SET_DIO_IRQ_PARAMS,
        (uint8_t)((SX126X_IRQ_ALL >> 8) & 0xFF),
        (uint8_t)(SX126X_IRQ_ALL & 0xFF),
        (uint8_t)((SX126X_IRQ_ALL >> 8) & 0xFF), /* DIO1 mask MSB */
        (uint8_t)(SX126X_IRQ_ALL & 0xFF),        /* DIO1 mask LSB */
        0x00, 0x00, /* DIO2 mask */
        0x00, 0x00  /* DIO3 mask */
    };
    sx126x_hal_write(dio_irq_cmd, 9, NULL, 0);

    /* Clear any pending IRQ flags and device errors */
    sx126x_clear_irq_status(SX126X_IRQ_ALL);
    sx126x_clear_device_errors();

    /* Final validation: verify chip status and check for hardware errors */
    uint16_t dev_errors = 0;
    sx126x_get_device_errors(&dev_errors);
    sx126x_get_status(&chip_status);
    uint8_t chip_mode = (chip_status >> 4) & 0x07;
    uint8_t cmd_status = (chip_status >> 1) & 0x07;

    ESP_LOGI(TAG, "SX126x init status: 0x%02x (mode=%u, cmd_status=%u), device errors: 0x%04x",
             chip_status, chip_mode, cmd_status, dev_errors);

    if (dev_errors != 0) {
        ESP_LOGW(TAG, "Hardware warnings/errors detected: 0x%04x (XOSC err=%d, PLL err=%d)",
                 dev_errors, (dev_errors >> 5) & 1, (dev_errors >> 6) & 1);
    } else {
        ESP_LOGI(TAG, "SX126x radio init SUCCESS: PLL locked, zero hardware errors");
    }

    return 0;
}

/**
 * @brief Send a frame (non-blocking)
 */
int radio_send(const uint8_t *buf, uint8_t len)
{
    if (len == 0 || len > 253) {
        ESP_LOGE(TAG, "Invalid TX length: %u", len);
        return -1;
    }

    sx126x_set_standby(0x00);
    ant_switch_set_tx(true);

    /* Set packet length */
    uint8_t pkt_params_cmd[7] = {
        SX126X_CMD_SET_PKT_PARAMS,
        (uint8_t)((LORA_PREAMBLE_SYMB >> 8) & 0xFF),
        (uint8_t)(LORA_PREAMBLE_SYMB & 0xFF),
        0x00,
        len,
        0x01,
        0x00
    };
    sx126x_hal_write(pkt_params_cmd, 7, NULL, 0);

    /* Buffer base TX=0 */
    uint8_t base_addr_cmd[3] = { SX126X_CMD_SET_BUFFER_BASE_ADDRESS, 0x00, 0x00 };
    sx126x_hal_write(base_addr_cmd, 3, NULL, 0);

    /* Write buffer: opcode 0x0E, offset 0x00 */
    const uint8_t write_buf_cmd[2] = { SX126X_CMD_WRITE_BUFFER, 0x00 };
    sx126x_hal_write(write_buf_cmd, 2, buf, len);

    /* Clear IRQ */
    sx126x_clear_irq_status(SX126X_IRQ_ALL);

    /* Set TX with 3s timeout (3000ms in 15.625us RTC steps: 3000000 / 15.625 = 192000 = 0x02EE00) */
    uint8_t tx_cmd[4] = { SX126X_CMD_SET_TX, 0x02, 0xEE, 0x00 };
    sx126x_hal_write(tx_cmd, 4, NULL, 0);

    ESP_LOGI(TAG, "TX started: %u bytes", len);
    return 0;
}

/**
 * @brief Start continuous RX
 */
void radio_start_rx(void)
{
    /* Standby RC before changing mode */
    sx126x_set_standby(0x00);
    ant_switch_set_tx(false);

    /* Set max packet length (255) */
    uint8_t pkt_params_cmd[7] = {
        SX126X_CMD_SET_PKT_PARAMS,
        (uint8_t)((LORA_PREAMBLE_SYMB >> 8) & 0xFF),
        (uint8_t)(LORA_PREAMBLE_SYMB & 0xFF),
        0x00,
        255,
        0x01,
        0x00
    };
    sx126x_hal_write(pkt_params_cmd, 7, NULL, 0);

    /* Buffer base RX=0 */
    uint8_t base_addr_cmd[3] = { SX126X_CMD_SET_BUFFER_BASE_ADDRESS, 0x00, 0x00 };
    sx126x_hal_write(base_addr_cmd, 3, NULL, 0);

    /* Clear IRQ */
    sx126x_clear_irq_status(SX126X_IRQ_ALL);

    /* Set RX continuous (timeout = 0xFFFFFF) */
    uint8_t rx_cmd[4] = { SX126X_CMD_SET_RX, 0xFF, 0xFF, 0xFF };
    sx126x_hal_write(rx_cmd, 4, NULL, 0);

    dio1_flag = false;

    /* Verify RX mode */
    vTaskDelay(pdMS_TO_TICKS(2));
    uint8_t status = 0;
    sx126x_get_status(&status);
    uint8_t mode = (status >> 4) & 0x07;

    uint16_t dev_errors = 0;
    sx126x_get_device_errors(&dev_errors);

    int16_t rssi_inst = 0;
    sx126x_get_rssi_inst(&rssi_inst);

    ESP_LOGI(TAG, "RX continuous active: status=0x%02x (mode=%u: %s), errors=0x%04x, initial noise floor=%d dBm",
             status, mode, (mode == 5) ? "RX" : "WARN_NOT_RX", dev_errors, rssi_inst);
}

/**
 * @brief Poll for radio events
 * @param rx Output buffer for RX data
 * @return Event type
 */
radio_evt_t radio_poll(radio_rx_t *rx)
{
    static uint32_t last_poll_ms = 0;
    uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    bool should_poll = false;

    if (dio1_flag) {
        dio1_flag = false;
        should_poll = true;
    } else if (now - last_poll_ms >= 500) {
        /* Polling fallback every 500 ms in case DIO1 interrupt is missed */
        last_poll_ms = now;
        should_poll = true;
    }

    if (!should_poll) {
        return RADIO_EVT_NONE;
    }

    /* Read IRQ status */
    uint16_t irq = 0;
    if (sx126x_get_irq_status(&irq) != 0) {
        return RADIO_EVT_ERR;
    }

    /* Read instantaneous RSSI to measure live RF energy / noise floor */
    int16_t rssi_inst = 0;
    sx126x_get_rssi_inst(&rssi_inst);

    /* Read chip mode */
    uint8_t chip_status = 0;
    sx126x_get_status(&chip_status);
    uint8_t mode = (chip_status >> 4) & 0x07;

    /* Log periodic diagnostic if noise floor or IRQ detected */
    if (irq != 0 || (now - last_poll_ms == 0)) {
        ESP_LOGI(TAG, "radio_poll: mode=%u (%s), IRQ=0x%04x, RSSI_inst=%d dBm",
                 mode, (mode == 5) ? "RX" : (mode == 2 ? "STDBY_RC" : (mode == 3 ? "STDBY_XOSC" : "OTHER")),
                 irq, rssi_inst);
    }

    /* Auto-recovery: If radio dropped out of RX, re-trigger continuous RX */
    if (mode != 5) {
        uint16_t dev_err = 0;
        sx126x_get_device_errors(&dev_err);
        ESP_LOGW(TAG, "radio_poll: radio not in RX (mode=%u, err=0x%04x), re-triggering RX...",
                 mode, dev_err);
        radio_start_rx();
    }

    if (irq == 0) {
        return RADIO_EVT_NONE;
    }

    ESP_LOGI(TAG, "radio_poll: DETECTED IRQ=0x%04x (RX_DONE=%d, PREAMBLE=%d, SYNC=%d, HDR_VAL=%d, CRC_ERR=%d, TIMEOUT=%d), RSSI_inst=%d dBm",
             irq, (irq >> 1) & 1, (irq >> 2) & 1, (irq >> 3) & 1, (irq >> 4) & 1, (irq >> 6) & 1, (irq >> 9) & 1, rssi_inst);

    /* Clear the detected IRQs */
    sx126x_clear_irq_status(irq);

    /* Process RX_DONE (bit 1: 0x0002) */
    if (irq & SX126X_IRQ_RX_DONE) {
        if (irq & (SX126X_IRQ_CRC_ERROR | SX126X_IRQ_HEADER_ERROR)) {
            ESP_LOGW(TAG, "Packet received with CRC or header error (irq=0x%04x)", irq);
            radio_start_rx();
            return RADIO_EVT_ERR;
        }

        /* Get RX buffer status: opcode 0x13 0x00 -> returns payload_len, start_ptr */
        const uint8_t buf_status_cmd[2] = { SX126X_CMD_GET_RX_BUFFER_STATUS, 0x00 };
        uint8_t buf_status[2] = { 0, 0 };
        if (sx126x_hal_read(buf_status_cmd, 2, buf_status, 2) != 0) {
            ESP_LOGE(TAG, "Failed to read RX buffer status");
            radio_start_rx();
            return RADIO_EVT_ERR;
        }
        uint8_t payload_len = buf_status[0];
        uint8_t start_ptr = buf_status[1];

        if (payload_len > 0) {
            /* Read buffer: opcode 0x1E, start_ptr, NOP 0x00 */
            uint8_t read_buf_cmd[3] = { SX126X_CMD_READ_BUFFER, start_ptr, 0x00 };
            if (sx126x_hal_read(read_buf_cmd, 3, rx->buf, payload_len) != 0) {
                ESP_LOGE(TAG, "Failed to read payload from buffer");
                radio_start_rx();
                return RADIO_EVT_ERR;
            }
            rx->len = payload_len;

            /* Read packet status: RSSI & SNR */
            const uint8_t pkt_status_cmd[2] = { SX126X_CMD_GET_PKT_STATUS, 0x00 };
            uint8_t pkt_status[3] = { 0, 0, 0 };
            if (sx126x_hal_read(pkt_status_cmd, 2, pkt_status, 3) == 0) {
                rx->rssi = (int8_t)(-((int16_t)pkt_status[0]) >> 1);
                rx->snr = (((int8_t)pkt_status[1]) + 2) >> 2;
            } else {
                rx->rssi = (int8_t)rssi_inst;
                rx->snr = 0;
            }

            ESP_LOGI(TAG, ">>> RX_DONE: %u bytes, RSSI=%d dBm, SNR=%d dB <<<", rx->len, rx->rssi, rx->snr);
            return RADIO_EVT_RX_DONE;
        }
        return RADIO_EVT_ERR;
    }

    /* Process TX_DONE (bit 0: 0x0001) */
    if (irq & SX126X_IRQ_TX_DONE) {
        ESP_LOGI(TAG, "TX_DONE event");
        radio_start_rx();
        return RADIO_EVT_TX_DONE;
    }

    /* Process TIMEOUT (bit 9: 0x0200) */
    if (irq & SX126X_IRQ_TIMEOUT) {
        ESP_LOGI(TAG, "RX_TIMEOUT event — restarting continuous RX");
        radio_start_rx();
        return RADIO_EVT_TIMEOUT;
    }

    /* Process CRC_ERROR (bit 6: 0x0040) */
    if (irq & SX126X_IRQ_CRC_ERROR) {
        ESP_LOGW(TAG, "CRC_ERROR event");
        radio_start_rx();
        return RADIO_EVT_ERR;
    }

    return RADIO_EVT_NONE;
}

/**
 * @brief Calculate Time-on-Air in ms
 */
uint32_t radio_toa_ms(uint8_t len)
{
    float symbol_time_ms = 4.096f; /* SF9, BW125 */
    float preamble_syms = (float)LORA_PREAMBLE_SYMB;
    float header_syms = 8.25f;
    float payload_syms = (float)len * (4.0f / (float)(LORA_SF - 2));
    float total_syms = preamble_syms + header_syms + payload_syms;
    return (uint32_t)(total_syms * symbol_time_ms);
}

void radio_dio1_isr(void)
{
    dio1_flag = true;
}
