#ifndef LORA_RADIO_H
#define LORA_RADIO_H
#include <stdint.h>
#include "sx126x.h"

/* ===== RF settings - MUST be mirrored on the ground SX1262 ===== */
#define LORA_FREQ_HZ     865402500UL          /* 865.4025 MHz */
#define LORA_SF          SX126X_LORA_SF9      /* doc: SF7-9   */
#define LORA_BW          SX126X_LORA_BW_125   /* doc: 125/250 */
#define LORA_CR          SX126X_LORA_CR_4_5   /* doc: 4/5, 4/6 */
#define LORA_LDRO        0                    /* 1 only if symbol time > 16 ms (SF11/12 @125k) */
#define LORA_PREAMBLE    12u
#define LORA_SYNCWORD    0x12                 /* 0x12 private, 0x34 public */
#define LORA_TX_DBM      14                   /* 14 / 17 / 20 / 22 */

/* ===== board options - check the Waveshare schematic ===== */
#define LORA_USE_RXTX_PINS   1   /* TXEN/RXEN driven by MCU. Set 0 if DIO2 switches the antenna */
#define LORA_USE_DIO2_RFSW   0
#define LORA_USE_TCXO        0   /* 1 = TCXO powered from DIO3 (1.8 V) */
#define LORA_USE_DCDC        1

typedef enum { RADIO_EVT_NONE, RADIO_EVT_TX_DONE, RADIO_EVT_RX_DONE,
               RADIO_EVT_TIMEOUT, RADIO_EVT_ERR } radio_evt_t;
typedef struct { uint8_t buf[255]; uint8_t len; int8_t rssi; int8_t snr; } radio_rx_t;

int         radio_init(void);
int         radio_send(const uint8_t *buf, uint8_t len);   /* non-blocking, 0 = started */
void        radio_start_rx(void);                          /* continuous RX */
radio_evt_t radio_poll(radio_rx_t *rx);                    /* call from main loop */
uint32_t    radio_toa_ms(uint8_t len);
void        radio_dio1_isr(void);                          /* call from EXTI callback */
#endif
