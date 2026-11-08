/* Bosch BME68x_SensorAPI port: I2C1, forced mode, 300 C / 100 ms heater, non-blocking use */
#include "bme688_port.h"
#include "sensor_calib.h"
#include "main.h"
#include "bme68x.h"
#include <string.h>

extern I2C_HandleTypeDef hi2c1;
extern I2C_HandleTypeDef hi2c2;
extern I2C_HandleTypeDef hi2c3;
static I2C_HandleTypeDef *bme_i2c = &hi2c1;
static struct bme68x_dev bme;
static struct bme68x_conf conf;
static struct bme68x_heatr_conf hc;
static uint8_t i2c_addr;
static uint32_t meas_ms;

static BME68X_INTF_RET_TYPE rd(uint8_t reg, uint8_t *d, uint32_t len, void *p)
{
    uint8_t a = *(uint8_t *)p;
    return HAL_I2C_Mem_Read(bme_i2c, (uint16_t)(a << 1), reg, I2C_MEMADD_SIZE_8BIT, d, (uint16_t)len, 100) == HAL_OK ? 0 : -1;
}
static BME68X_INTF_RET_TYPE wr(uint8_t reg, const uint8_t *d, uint32_t len, void *p)
{
    uint8_t a = *(uint8_t *)p;
    return HAL_I2C_Mem_Write(bme_i2c, (uint16_t)(a << 1), reg, I2C_MEMADD_SIZE_8BIT, (uint8_t *)d, (uint16_t)len, 100) == HAL_OK ? 0 : -1;
}
static void dly(uint32_t us, void *p)
{
    (void)p;
    uint32_t start = DWT->CYCCNT, cyc = us * (SystemCoreClock / 1000000u);
    while ((DWT->CYCCNT - start) < cyc) { }
}

int bme_port_init(void)
{
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->LAR = 0xC5ACCE55;                       /* unlock DWT on Cortex-M7 */
    DWT->CYCCNT = 0; DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;

    I2C_HandleTypeDef *buses[3] = { &hi2c1, &hi2c2, &hi2c3 };
    static const uint8_t addrs[2] = { BME68X_I2C_ADDR_LOW, BME68X_I2C_ADDR_HIGH };  /* 0x76, 0x77 */
    int8_t r = -1;

    for (int b = 0; b < 3 && r != BME68X_OK; b++) {
        if (!buses[b]->Instance) continue;
        bme_i2c = buses[b];
        for (int i = 0; i < 2 && r != BME68X_OK; i++) {
            i2c_addr = addrs[i];
            memset(&bme, 0, sizeof bme);
            bme.intf = BME68X_I2C_INTF; bme.read = rd; bme.write = wr; bme.delay_us = dly;
            bme.intf_ptr = &i2c_addr; bme.amb_temp = 25;
            r = bme68x_init(&bme);
        }
    }
    if (r != BME68X_OK) return -1;

    conf.filter = BME68X_FILTER_OFF; conf.odr = BME68X_ODR_NONE;
    conf.os_hum = BME68X_OS_2X; conf.os_temp = BME68X_OS_2X; conf.os_pres = BME68X_OS_4X;
    if (bme68x_set_conf(&conf, &bme) != BME68X_OK) return -2;
    hc.enable = BME68X_ENABLE; hc.heatr_temp = 300; hc.heatr_dur = 100;   /* datasheet 3.5.1 example */
    if (bme68x_set_heatr_conf(BME68X_FORCED_MODE, &hc, &bme) != BME68X_OK) return -3;
    meas_ms = bme68x_get_meas_dur(BME68X_FORCED_MODE, &conf, &bme) / 1000u + hc.heatr_dur + 20u;
    return 0;
}

int bme_port_trigger(void) { return bme68x_set_op_mode(BME68X_FORCED_MODE, &bme) == BME68X_OK ? 0 : -1; }
uint32_t bme_port_meas_ms(void) { return meas_ms; }

int bme_port_read(bme_sample_t *s)
{
    struct bme68x_data d; uint8_t n = 0;
    int8_t r = -1;
    for (int retry = 0; retry < 5; retry++) {
        r = bme68x_get_data(BME68X_FORCED_MODE, &d, &n, &bme);
        if (r == BME68X_OK && n > 0) break;
        HAL_Delay(10);
    }
    if (r != BME68X_OK || n == 0) return -1;
#ifdef BME68X_USE_FPU                            /* float build (default) */
    s->temp_c100 = (int16_t)((d.temperature * 100.0f) + BME688_TEMP_OFFSET_C * 100.0f);
    s->hum_c100  = (uint16_t)((d.humidity * 100.0f) + BME688_HUM_OFFSET_PCT * 100.0f);
    s->press_dhpa = (uint16_t)((d.pressure / 10.0f) + BME688_PRES_OFFSET_HPA * 10.0f);   /* Pa -> 0.1 hPa */
    s->gas_ohm   = (uint32_t)d.gas_resistance;
#else                                            /* integer build: 0.01 C, Pa, 0.001 %RH */
    s->temp_c100 = d.temperature + (int16_t)(BME688_TEMP_OFFSET_C * 100.0f);
    s->hum_c100  = (uint16_t)((d.humidity / 10u) + BME688_HUM_OFFSET_PCT * 100.0f);
    s->press_dhpa = (uint16_t)((d.pressure / 10u) + BME688_PRES_OFFSET_HPA * 10.0f);
    s->gas_ohm   = d.gas_resistance;
#endif
    s->gas_valid = (d.status & BME68X_GASM_VALID_MSK) ? 1 : 0;
    s->heat_stab = (d.status & BME68X_HEAT_STAB_MSK) ? 1 : 0;
    return 0;
}
