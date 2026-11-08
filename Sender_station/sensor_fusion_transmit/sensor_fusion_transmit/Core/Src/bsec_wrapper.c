/* BSEC v3.3.0.1 wrapper for STM32F722 - provides simple IAQ computation interface */
#include "bsec_wrapper.h"
#if __has_include("bsec/bsec_interface.h")
#include "bsec/bsec_interface.h"
#elif __has_include("bsec_interface.h")
#include "bsec_interface.h"
#else
#include "bsec/bsec_interface.h"
#endif
#include "main.h"
#include <string.h>

static uint8_t bsec_work_buffer[BSEC_MAX_WORKBUFFER_SIZE];
static void *bsec_inst;
static int bsec_initialized = 0;

/* BSEC config data (3.3V, 3s sampling, 4-day history) - generated from bme688_iaq_33v_3s_4d.config */
#include "bsec/config/bsec_config.c"

bsec_library_return_t bsec_wrapper_init(void)
{
    if (bsec_initialized) return BSEC_OK;

    /* Initialize BSEC instance */
    bsec_inst = (void *)0;
    bsec_library_return_t ret = bsec_init(&bsec_inst);
    if (ret != BSEC_OK) return ret;

    /* Load configuration */
    ret = bsec_set_configuration(&bsec_inst, bsec_config_data, sizeof(bsec_config_data), bsec_work_buffer, sizeof(bsec_work_buffer));
    if (ret != BSEC_OK) return ret;

    /* Subscribe to IAQ output */
    bsec_sensor_configuration_t virtual_sensors[1];
    bsec_sensor_configuration_t required_sensors[BSEC_MAX_PHYSICAL_SENSOR];
    uint8_t n_required = BSEC_MAX_PHYSICAL_SENSOR;

    virtual_sensors[0].sensor_id = BSEC_OUTPUT_IAQ;
    virtual_sensors[0].sample_rate = BSEC_SAMPLE_RATE_LP;  /* 0.33 Hz = 3s */

    ret = bsec_update_subscription(&bsec_inst, virtual_sensors, 1, required_sensors, &n_required);
    if (ret != BSEC_OK) return ret;

    bsec_initialized = 1;
    return BSEC_OK;
}

bsec_library_return_t bsec_wrapper_process(float temp_c, float hum_pct, float press_pa, float gas_ohm, uint16_t *iaq, uint8_t *iaq_accuracy)
{
    if (!bsec_initialized) return BSEC_E_DOSTEPS_INVALIDINPUT;

    int64_t time_stamp = (int64_t)HAL_GetTick() * 1000000LL;  /* ms -> ns */

    /* Get sensor control settings */
    bsec_bme_settings_t sensor_settings;
    bsec_library_return_t ret = bsec_sensor_control(&bsec_inst, time_stamp, &sensor_settings);
    if (ret != BSEC_OK) return ret;

    /* Prepare inputs for BSEC */
    bsec_input_t inputs[4];
    uint8_t n_inputs = 0;

    if (sensor_settings.process_data & BSEC_PROCESS_TEMPERATURE) {
        inputs[n_inputs].sensor_id = BSEC_INPUT_TEMPERATURE;
        inputs[n_inputs].signal = temp_c;
        inputs[n_inputs].time_stamp = time_stamp;
        n_inputs++;
    }
    if (sensor_settings.process_data & BSEC_PROCESS_HUMIDITY) {
        inputs[n_inputs].sensor_id = BSEC_INPUT_HUMIDITY;
        inputs[n_inputs].signal = hum_pct;
        inputs[n_inputs].time_stamp = time_stamp;
        n_inputs++;
    }
    if (sensor_settings.process_data & BSEC_PROCESS_PRESSURE) {
        inputs[n_inputs].sensor_id = BSEC_INPUT_PRESSURE;
        inputs[n_inputs].signal = press_pa;
        inputs[n_inputs].time_stamp = time_stamp;
        n_inputs++;
    }
    if (sensor_settings.process_data & BSEC_PROCESS_GAS) {
        inputs[n_inputs].sensor_id = BSEC_INPUT_GASRESISTOR;
        inputs[n_inputs].signal = gas_ohm;
        inputs[n_inputs].time_stamp = time_stamp;
        n_inputs++;
    }

    /* Process inputs */
    bsec_output_t outputs[BSEC_NUMBER_OUTPUTS];
    uint8_t n_outputs = BSEC_NUMBER_OUTPUTS;

    ret = bsec_do_steps(&bsec_inst, inputs, n_inputs, outputs, &n_outputs);
    if (ret != BSEC_OK) return ret;

    /* Extract IAQ output */
    *iaq = 0xFFFF;
    *iaq_accuracy = 0;
    for (uint8_t i = 0; i < n_outputs; i++) {
        if (outputs[i].sensor_id == BSEC_OUTPUT_IAQ) {
            *iaq = (uint16_t)outputs[i].signal;
            *iaq_accuracy = outputs[i].accuracy;
            break;
        }
    }

    return BSEC_OK;
}

bsec_library_return_t bsec_wrapper_get_state(uint8_t *state, uint32_t *state_len)
{
    if (!bsec_initialized) return BSEC_E_DOSTEPS_INVALIDINPUT;
    if (*state_len < BSEC_MAX_STATE_BLOB_SIZE) return BSEC_E_CONFIG_INSUFFICIENTWORKBUFFER;

    bsec_library_return_t ret = bsec_get_state(&bsec_inst, 0, state, *state_len, bsec_work_buffer, sizeof(bsec_work_buffer), state_len);
    return ret;
}

bsec_library_return_t bsec_wrapper_set_state(const uint8_t *state, uint32_t state_len)
{
    if (!bsec_initialized) return BSEC_E_DOSTEPS_INVALIDINPUT;

    bsec_library_return_t ret = bsec_set_state(&bsec_inst, state, state_len, bsec_work_buffer, sizeof(bsec_work_buffer));
    return ret;
}
