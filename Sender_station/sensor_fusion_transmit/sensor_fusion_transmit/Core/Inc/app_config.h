#ifndef APP_CONFIG_H
#define APP_CONFIG_H

/* ---- periods ---- */
#define GPS_PERIOD_MS      500u
#define HEARTBEAT_MS       5000u
#define POWER_MS           10000u
#define ENV_MS             1000u
#define TELEM_MS           15000u
#define LCD_MS             500u
#define RADAR_REPEAT_MS    2000u   /* re-send alert while a human stays detected */

/* ---- TX queue / reliability ---- */
#define Q_DEPTH            12u
#define TXQ_PL_MAX         64u
#define AGING_MS           5000u   /* priority improves by 1 level per AGING_MS waiting */
#define ACK_TIMEOUT_MS     800u
#define MAX_RETRY          3u
#define BACKOFF_BASE_MS    300u    /* 300, 600, 1200 ms (+jitter) */
#define BACKOFF_JITTER_MS  100u

/* ---- duty cycle (token bucket). 10 = 1 %  (ETSI style). 1000 = disabled ---- */
#define DUTY_PERMILLE      1000u
#define DUTY_WINDOW_S      3600u

/* ---- fragmentation ---- */
#define FRAG_CHUNK         24u

/* ---- power estimation model (no sensors on the pack!) ---- */
#define BATT_CAP_MAH       10000u
#define AVG_LOAD_MA        3000u   /* tune from your servo current-draw estimates */

/* ---- peripherals ---- */
#define LCD_I2C_ADDR       0x27u   /* PCF8574T at 0x27 per hardware wiring (I2C1 PB8/PB9) */

#endif
