#ifndef BME688_PORT_H
#define BME688_PORT_H
#include <stdint.h>
typedef struct { int16_t temp_c100; uint16_t hum_c100; uint16_t press_dhpa;
                 uint32_t gas_ohm; uint8_t gas_valid, heat_stab; uint16_t iaq; uint8_t iaq_accuracy; } bme_sample_t;
int      bme_port_init(void);              /* 0 ok */
int      bme_port_trigger(void);           /* start one forced-mode TPHG cycle */
uint32_t bme_port_meas_ms(void);           /* time to wait before reading */
int      bme_port_read(bme_sample_t *s);   /* 0 ok */
#endif
