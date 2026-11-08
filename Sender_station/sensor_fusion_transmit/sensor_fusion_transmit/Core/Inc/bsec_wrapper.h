/* BSEC v3.3.0.1 wrapper for STM32F722 - provides simple IAQ computation interface */
#ifndef BSEC_WRAPPER_H
#define BSEC_WRAPPER_H

#include <stdint.h>
#if __has_include("bsec/bsec_interface.h")
#include "bsec/bsec_interface.h"
#elif __has_include("bsec_interface.h")
#include "bsec_interface.h"
#else
#include "bsec/bsec_interface.h"
#endif

/**
 * Initialize BSEC library with default configuration
 * @return BSEC_OK on success, error code otherwise
 */
bsec_library_return_t bsec_wrapper_init(void);

/**
 * Process sensor data and compute IAQ
 * @param temp_c Temperature in degrees Celsius
 * @param hum_pct Relative humidity in percent
 * @param press_pa Pressure in Pascals
 * @param gas_ohm Gas resistance in Ohms
 * @param iaq Output IAQ value (0-500 scale)
 * @param iaq_accuracy Output accuracy (0-3)
 * @return BSEC_OK on success, error code otherwise
 */
bsec_library_return_t bsec_wrapper_process(float temp_c, float hum_pct, float press_pa, float gas_ohm, uint16_t *iaq, uint8_t *iaq_accuracy);

/**
 * Get BSEC state for persistence
 * @param state Buffer to hold state (at least BSEC_MAX_STATE_BLOB_SIZE bytes)
 * @param state_len [in] Buffer size, [out] actual state size
 * @return BSEC_OK on success, error code otherwise
 */
bsec_library_return_t bsec_wrapper_get_state(uint8_t *state, uint32_t *state_len);

/**
 * Restore BSEC state from persistence
 * @param state State data
 * @param state_len State data length
 * @return BSEC_OK on success, error code otherwise
 */
bsec_library_return_t bsec_wrapper_set_state(const uint8_t *state, uint32_t state_len);

#endif /* BSEC_WRAPPER_H */
