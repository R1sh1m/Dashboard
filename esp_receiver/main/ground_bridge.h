#ifndef GROUND_BRIDGE_H
#define GROUND_BRIDGE_H

#include <stdint.h>

/**
 * @file ground_bridge.h
 * @brief Ground-side bridge: fragment reassembly, shadow state, JSON emission
 */

/**
 * @brief Initialize the ground bridge
 */
void ground_bridge_init(void);

/**
 * @brief Process a received LoRa frame
 * @param buf Frame buffer
 * @param len Frame length
 * @param rssi RSSI in dBm
 * @param snr SNR in dB
 */
void ground_bridge_process_frame(const uint8_t *buf, uint8_t len, int8_t rssi, int8_t snr);

/**
 * @brief Poll UART0 for incoming dashboard command lines and forward as PKT_CMD.
 * Non-blocking; call from app_main loop.
 */
void ground_bridge_poll_serial(void);

#endif /* GROUND_BRIDGE_H */
