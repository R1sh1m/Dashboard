#ifndef LORA_RADIO_H
#define LORA_RADIO_H

#include <stdint.h>

/**
 * @file lora_radio.h
 * @brief ESP32-S3 LoRa radio API (mirrors STM32 interface)
 */

typedef enum {
    RADIO_EVT_NONE,
    RADIO_EVT_TX_DONE,
    RADIO_EVT_RX_DONE,
    RADIO_EVT_TIMEOUT,
    RADIO_EVT_ERR
} radio_evt_t;

typedef struct {
    uint8_t buf[255];
    uint8_t len;
    int8_t rssi;
    int8_t snr;
} radio_rx_t;

/**
 * @brief Initialize the LoRa radio
 * @return 0 on success, -1 on failure
 */
int radio_init(void);

/**
 * @brief Send a frame (non-blocking)
 * @param buf Frame buffer
 * @param len Frame length
 * @return 0 on success (started), -1 on failure
 */
int radio_send(const uint8_t *buf, uint8_t len);

/**
 * @brief Start continuous RX
 */
void radio_start_rx(void);

/**
 * @brief Poll for radio events
 * @param rx Output buffer for RX data
 * @return Event type
 */
radio_evt_t radio_poll(radio_rx_t *rx);

/**
 * @brief Calculate Time-on-Air in ms
 * @param len Payload length in bytes
 * @return ToA in milliseconds
 */
uint32_t radio_toa_ms(uint8_t len);

/**
 * @brief DIO1 ISR callback (called from main app)
 */
void radio_dio1_isr(void);

#endif /* LORA_RADIO_H */