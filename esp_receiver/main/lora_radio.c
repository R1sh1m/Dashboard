/**
 * @file lora_radio.c
 * @brief ESP32 HAL for SX126x LoRa transceiver
 * 
 * Ported from STM32 version to use ESP-IDF SPI master and GPIO APIs.
 * Implements the same radio_init/send/poll interface for compatibility.
 */

#include "lora_radio.h"
#include "lora_cfg.h"
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
 * ESP32 GPIO Pin Definitions (matches Docs/ESP32_Receiver.md pinout)
 * ============================================================================
 */
#define PIN_NSS     GPIO_NUM_15   /* GPIO5 is a strapping pin on ESP32-S3 - conflict with flash */
#define PIN_SCK     GPIO_NUM_18
#define PIN_MOSI    GPIO_NUM_23   /* GPIO11 conflicts with SPI flash on ESP32 */
#define PIN_MISO    GPIO_NUM_19
#define PIN_RESET   GPIO_NUM_14
#define PIN_BUSY    GPIO_NUM_13
#define PIN_DIO1    GPIO_NUM_4
#define PIN_TXEN    GPIO_NUM_26   /* Optional, if LORA_USE_RXTX_PINS */
#define PIN_RXEN    GPIO_NUM_33   /* Optional, if LORA_USE_RXTX_PINS */

/* ============================================================================
 * SPI Handle
 * ============================================================================
 */
static spi_device_handle_t spi_dev = NULL;

/* ============================================================================
 * IRQ Flag (set in ISR, cleared in poll)
 * ============================================================================
 */
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
#if LORA_USE_RXTX_PINS
    gpio_set_level(PIN_TXEN, tx ? 1 : 0);
    gpio_set_level(PIN_RXEN, tx ? 0 : 1);
#else
    (void)tx;
#endif
}

/* ============================================================================
 * SX126x HAL Functions (required by sx126x_driver)
 * ============================================================================
 * These match the interface in sx126x_hal.h from the Semtech driver.
 */

/**
 * @brief Reset the SX126x chip
 */
void sx126x_hal_reset(void)
{
    ESP_LOGD(TAG, "Resetting SX126x");
    gpio_set_level(PIN_RESET, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(PIN_RESET, 1);
    vTaskDelay(pdMS_TO_TICKS(10));
}

/**
 * @brief Wakeup from sleep (pull NSS low briefly)
 */
void sx126x_hal_wakeup(void)
{
    gpio_set_level(PIN_NSS, 0);
    vTaskDelay(pdMS_TO_TICKS(1));
    gpio_set_level(PIN_NSS, 1);
}

/**
 * @brief Wait until BUSY pin goes low
 */
void sx126x_hal_wait_busy(void)
{
    uint32_t start = esp_timer_get_time() / 1000;
    while (gpio_get_level(PIN_BUSY) == 1) {
        if ((esp_timer_get_time() / 1000) - start > 100) {
            ESP_LOGE(TAG, "BUSY timeout");
            break;
        }
    }
}

/**
 * @brief SPI write (blocking)
 */
int sx126x_hal_write(const uint8_t *cmd, uint16_t cmd_len,
                     const uint8_t *data, uint16_t data_len)
{
    esp_err_t ret;
    
    gpio_set_level(PIN_NSS, 0);
    sx126x_hal_wait_busy();
    
    spi_transaction_t trans = {
        .length = cmd_len * 8,
        .tx_buffer = cmd,
        .rx_buffer = NULL,
        .flags = 0
    };
    ret = spi_device_transmit(spi_dev, &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI cmd write failed: %d", ret);
        gpio_set_level(PIN_NSS, 1);
        return -1;
    }
    
    if (data_len > 0) {
        trans.length = data_len * 8;
        trans.tx_buffer = data;
        trans.rx_buffer = NULL;
        trans.flags = 0;
        ret = spi_device_transmit(spi_dev, &trans);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "SPI data write failed: %d", ret);
            gpio_set_level(PIN_NSS, 1);
            return -1;
        }
    }
    
    gpio_set_level(PIN_NSS, 1);
    return 0;
}

/**
 * @brief SPI read (blocking)
 */
int sx126x_hal_read(const uint8_t *cmd, uint16_t cmd_len,
                    uint8_t *data, uint16_t data_len)
{
    esp_err_t ret;
    
    gpio_set_level(PIN_NSS, 0);
    sx126x_hal_wait_busy();
    
    spi_transaction_t trans = {
        .length = cmd_len * 8,
        .tx_buffer = cmd,
        .rx_buffer = NULL,
        .flags = 0
    };
    ret = spi_device_transmit(spi_dev, &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI cmd write failed: %d", ret);
        gpio_set_level(PIN_NSS, 1);
        return -1;
    }
    
    if (data_len > 0) {
        trans.length = data_len * 8;
        trans.tx_buffer = NULL;
        trans.rx_buffer = data;
        trans.flags = 0;
        ret = spi_device_transmit(spi_dev, &trans);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "SPI data read failed: %d", ret);
            gpio_set_level(PIN_NSS, 1);
            return -1;
        }
    }
    
    gpio_set_level(PIN_NSS, 1);
    return 0;
}

/**
 * @brief Get current time in ms (for timeouts)
 */
uint32_t sx126x_hal_get_time_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000);
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
    
    ESP_LOGI(TAG, "Initializing SX126x GPIOs");
    
    /* Configure GPIOs */
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << PIN_RESET) | (1ULL << PIN_BUSY) | (1ULL << PIN_DIO1),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io_conf);
    
    /* NSS, TXEN, RXEN as outputs */
    io_conf.pin_bit_mask = (1ULL << PIN_NSS);
    io_conf.mode = GPIO_MODE_OUTPUT;
    gpio_config(&io_conf);
    gpio_set_level(PIN_NSS, 1);
    
#if LORA_USE_RXTX_PINS
    io_conf.pin_bit_mask = (1ULL << PIN_TXEN) | (1ULL << PIN_RXEN);
    io_conf.mode = GPIO_MODE_OUTPUT;
    gpio_config(&io_conf);
    ant_switch_set_tx(false); /* Start in RX */
#endif
    
    /* DIO1 interrupt */
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
    
    /* Reset the chip */
    sx126x_hal_reset();
    vTaskDelay(pdMS_TO_TICKS(10));
    
    /* Initialize SPI */
    ESP_LOGI(TAG, "Initializing SPI");
    spi_bus_config_t bus_cfg = {
        .mosi_io_num = PIN_MOSI,
        .miso_io_num = PIN_MISO,
        .sclk_io_num = PIN_SCK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 256
    };
    ret = spi_bus_initialize(SPI2_HOST, &bus_cfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI bus init failed: %d", ret);
        return -1;
    }
    
    spi_device_interface_config_t dev_cfg = {
        .clock_speed_hz = 2000000, /* 2 MHz (conservative) */
        .mode = 0,
        .spics_io_num = -1,        /* NSS managed manually via GPIO, not by SPI driver */
        .queue_size = 1,
        .flags = SPI_DEVICE_NO_DUMMY
    };
    ret = spi_bus_add_device(SPI2_HOST, &dev_cfg, &spi_dev);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI device add failed: %d", ret);
        return -1;
    }
    
    ESP_LOGI(TAG, "SPI initialized at %d Hz", dev_cfg.clock_speed_hz);
    
    /* Now call the Semtech driver init sequence */
    /* This matches the STM32 lora_radio.c init flow */
    sx126x_hal_wakeup();
    
    /* Standby RC */
    uint8_t cmd[] = {0x80, 0x00}; /* SetStandby, STANDBY_RC */
    if (sx126x_hal_write(cmd, 2, NULL, 0) != 0) {
        ESP_LOGE(TAG, "SetStandby failed");
        return -1;
    }
    vTaskDelay(pdMS_TO_TICKS(1));
    
#if LORA_USE_DCDC
    /* SetRegMode to DCDC */
    cmd[0] = 0x9F;
    cmd[1] = 0x01; /* DCDC */
    if (sx126x_hal_write(cmd, 2, NULL, 0) != 0) {
        ESP_LOGE(TAG, "SetRegMode failed");
        return -1;
    }
#endif
    
    /* Set DIO2 as RF switch if enabled */
#if LORA_USE_DIO2_RFSW
    cmd[0] = 0x9D;
    cmd[1] = 0x01; /* Enable */
    sx126x_hal_write(cmd, 2, NULL, 0);
#endif
    
    /* Set packet type to LoRa */
    cmd[0] = 0x8A;
    cmd[1] = 0x01; /* PKT_TYPE_LORA */
    sx126x_hal_write(cmd, 2, NULL, 0);
    
    /* Calibration for 868 MHz band */
    cmd[0] = 0x89;
    cmd[1] = 0xD7; /* Image cal freq 1 */
    cmd[2] = 0xDB; /* Image cal freq 2 */
    sx126x_hal_write(cmd, 3, NULL, 0);
    vTaskDelay(pdMS_TO_TICKS(5));
    
    /* Set frequency */
    uint32_t freq = LORA_FREQ_HZ;
    uint8_t freq_buf[4];
    freq_buf[0] = 0x86; /* SetRfFreq */
    freq_buf[1] = (freq >> 24) & 0xFF;
    freq_buf[2] = (freq >> 16) & 0xFF;
    freq_buf[3] = (freq >> 8) & 0xFF;
    sx126x_hal_write(freq_buf, 4, NULL, 0);
    
    /* Set TX params */
    cmd[0] = 0x8E;
    cmd[1] = LORA_TX_DBM; /* Power */
    cmd[2] = 0x04; /* Ramp 200us */
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Set buffer base addresses */
    cmd[0] = 0x8F;
    cmd[1] = 0x00; /* TX base */
    cmd[2] = 0x00; /* RX base */
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Set LoRa modem params */
    cmd[0] = 0x8B;
    cmd[1] = LORA_SF;
    cmd[2] = (LORA_BW == 125) ? 0x04 : 0x05; /* BW encoding */
    cmd[3] = LORA_CR - 4; /* CR encoding */
    cmd[4] = 0; /* LDRO */
    sx126x_hal_write(cmd, 5, NULL, 0);
    
    /* Set LoRa packet params */
    cmd[0] = 0x8C;
    cmd[1] = (LORA_PREAMBLE_SYMB >> 8) & 0xFF;
    cmd[2] = LORA_PREAMBLE_SYMB & 0xFF;
    cmd[3] = 0x00; /* Explicit header */
    cmd[4] = 255; /* Max payload */
    cmd[5] = 0x01; /* CRC on */
    cmd[6] = 0x00; /* IQ normal */
    sx126x_hal_write(cmd, 7, NULL, 0);
    
    /* Set sync word */
    cmd[0] = 0x8D;
    cmd[1] = (LORA_SYNCWORD >> 8) & 0xFF;
    cmd[2] = LORA_SYNCWORD & 0xFF;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Set DIO IRQ mask */
    cmd[0] = 0x08;
    cmd[1] = 0x00; /* IRQ mask MSB */
    cmd[2] = 0xFF; /* IRQ mask LSB (all IRQs) */
    cmd[3] = 0x00; /* DIO1 mask MSB */
    cmd[4] = 0xFF; /* DIO1 mask LSB */
    cmd[5] = 0x00; /* DIO2 mask MSB */
    cmd[6] = 0x00; /* DIO2 mask LSB */
    cmd[7] = 0x00; /* DIO3 mask MSB */
    cmd[8] = 0x00; /* DIO3 mask LSB */
    sx126x_hal_write(cmd, 9, NULL, 0);
    
    /* Clear IRQ status */
    cmd[0] = 0x02;
    cmd[1] = 0xFF; /* Clear all */
    cmd[2] = 0xFF;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    ESP_LOGI(TAG, "SX126x radio init complete");
    return 0;
}

/**
 * @brief Send a frame (non-blocking)
 * @param buf Frame buffer
 * @param len Frame length
 * @return 0 on success (started), -1 on failure
 */
int radio_send(const uint8_t *buf, uint8_t len)
{
    if (len == 0 || len > 253) {
        ESP_LOGE(TAG, "Invalid TX length: %u", len);
        return -1;
    }
    
    ant_switch_set_tx(true);
    
    /* Set packet length */
    uint8_t cmd[7];
    cmd[0] = 0x8C; /* SetPacketParams */
    cmd[1] = (LORA_PREAMBLE_SYMB >> 8) & 0xFF;
    cmd[2] = LORA_PREAMBLE_SYMB & 0xFF;
    cmd[3] = 0x00;
    cmd[4] = len;
    cmd[5] = 0x01; /* CRC on */
    cmd[6] = 0x00;
    sx126x_hal_write(cmd, 7, NULL, 0);
    
    /* Set buffer base address */
    cmd[0] = 0x8F;
    cmd[1] = 0x00;
    cmd[2] = 0x00;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Write buffer */
    uint8_t write_cmd[1] = {0x0D}; /* WriteBuffer */
    sx126x_hal_write(write_cmd, 1, buf, len);
    
    /* Clear IRQ */
    cmd[0] = 0x02;
    cmd[1] = 0xFF;
    cmd[2] = 0xFF;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Set TX with 3s timeout */
    cmd[0] = 0x83;
    cmd[1] = 0x00;
    cmd[2] = 0x00;
    cmd[3] = 0x30; /* ~3 seconds in RTC steps */
    sx126x_hal_write(cmd, 4, NULL, 0);
    
    ESP_LOGD(TAG, "TX started: %u bytes", len);
    return 0;
}

/**
 * @brief Start continuous RX
 */
void radio_start_rx(void)
{
    ant_switch_set_tx(false);
    
    /* Set max packet length */
    uint8_t cmd[7];
    cmd[0] = 0x8C;
    cmd[1] = (LORA_PREAMBLE_SYMB >> 8) & 0xFF;
    cmd[2] = LORA_PREAMBLE_SYMB & 0xFF;
    cmd[3] = 0x00;
    cmd[4] = 255;
    cmd[5] = 0x01;
    cmd[6] = 0x00;
    sx126x_hal_write(cmd, 7, NULL, 0);
    
    /* Set buffer base */
    cmd[0] = 0x8F;
    cmd[1] = 0x00;
    cmd[2] = 0x00;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Clear IRQ */
    cmd[0] = 0x02;
    cmd[1] = 0xFF;
    cmd[2] = 0xFF;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    /* Set RX continuous (timeout = 0xFFFFFF) */
    cmd[0] = 0x82;
    cmd[1] = 0xFF;
    cmd[2] = 0xFF;
    cmd[3] = 0xFF;
    sx126x_hal_write(cmd, 4, NULL, 0);
    
    dio1_flag = false;
    ESP_LOGD(TAG, "RX continuous started");
}

/**
 * @brief Poll for radio events
 * @param rx Output buffer for RX data
 * @return Event type
 */
radio_evt_t radio_poll(radio_rx_t *rx)
{
    if (!dio1_flag) {
        return RADIO_EVT_NONE;
    }
    dio1_flag = false;
    
    /* Read IRQ status */
    uint8_t cmd[] = {0x12, 0x00, 0x00};
    uint8_t irq_buf[2] = {0, 0};
    sx126x_hal_read(cmd, 3, irq_buf, 2);
    uint16_t irq = (irq_buf[0] << 8) | irq_buf[1];
    
    /* Clear IRQ */
    cmd[0] = 0x02;
    sx126x_hal_write(cmd, 3, NULL, 0);
    
    if (irq & 0x0008) { /* TX_DONE */
        ESP_LOGD(TAG, "TX_DONE");
        radio_start_rx();
        return RADIO_EVT_TX_DONE;
    }
    
    if (irq & 0x0001) { /* RX_DONE */
        /* Read buffer status */
        cmd[0] = 0x13;
        cmd[1] = 0x00;
        cmd[2] = 0x00;
        uint8_t status[3];
        sx126x_hal_read(cmd, 3, status, 3);
        uint8_t len = status[1];
        
        if (len > 0) {
            /* Read buffer */
            uint8_t read_cmd[] = {0x1E, 0x00};
            sx126x_hal_read(read_cmd, 2, rx->buf, len);
            rx->len = len;
            
            /* Read packet status (RSSI/SNR) */
            cmd[0] = 0x14;
            cmd[1] = 0x00;
            cmd[2] = 0x00;
            uint8_t pkt_status[2];
            sx126x_hal_read(cmd, 3, pkt_status, 2);
            rx->rssi = -(int8_t)(pkt_status[0] / 2);
            rx->snr = (int8_t)pkt_status[1] / 4;
            
            ESP_LOGD(TAG, "RX_DONE: %u bytes, RSSI=%d, SNR=%d", len, rx->rssi, rx->snr);
            return RADIO_EVT_RX_DONE;
        }
        return RADIO_EVT_ERR;
    }
    
    if (irq & 0x0002) { /* TIMEOUT */
        ESP_LOGW(TAG, "RX_TIMEOUT");
        radio_start_rx();
        return RADIO_EVT_TIMEOUT;
    }
    
    if (irq & 0x0040) { /* CRC_ERROR */
        ESP_LOGW(TAG, "CRC_ERROR");
        radio_start_rx();
        return RADIO_EVT_ERR;
    }
    
    return RADIO_EVT_NONE;
}

/**
 * @brief Calculate Time-on-Air in ms
 * @param len Payload length in bytes
 * @return ToA in milliseconds
 */
uint32_t radio_toa_ms(uint8_t len)
{
    /* Simplified ToA calculation for SF9, BW125, CR4/5 */
    /* Formula: ToA = (preamble + header + payload) * symbol_time */
    /* Symbol time = 2^SF / BW = 512 / 125000 = 4.096 ms */
    
    float symbol_time_ms = 4.096f;
    float preamble_syms = (float)LORA_PREAMBLE_SYMB;
    float header_syms = 8.25f; /* Fixed overhead */
    float payload_syms = (float)len * (4.0f / (float)(LORA_SF - 2)); /* Approximate */
    
    float total_syms = preamble_syms + header_syms + payload_syms;
    return (uint32_t)(total_syms * symbol_time_ms);
}

/**
 * @brief DIO1 ISR callback (called from main app)
 */
void radio_dio1_isr(void)
{
    dio1_flag = true;
}
