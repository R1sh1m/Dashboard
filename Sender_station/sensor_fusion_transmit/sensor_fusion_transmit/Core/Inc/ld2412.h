#ifndef LD2412_H
#define LD2412_H
#include <stdint.h>
#include <stddef.h>
#include "stm32f7xx_hal.h"
#define LD_BUF 64u

/* =========================================================================
 *  Basic target report (byte stream via ld_feed)
 * ========================================================================= */
typedef struct {
    uint8_t state;                  /* 0 none, 1 moving, 2 stationary, 3 both */
    uint16_t mov_cm, stat_cm;       /* moving / stationary distance (cm) */
    uint8_t mov_e, stat_e;          /* moving / stationary energy (0-100) */
    uint32_t t_ms;                  /* tick of last good frame */
} ld_target_t;

/* =========================================================================
 *  Engineering mode target data (per-range-gate energy profile)
 * ========================================================================= */
#define LD_ENG_GATES 7u
typedef struct {
    uint8_t  mov_gate_energy[LD_ENG_GATES];   /* energy per gate, moving   */
    uint8_t  stat_gate_energy[LD_ENG_GATES];  /* energy per gate, stationary */
    uint8_t  gate_count;                      /* how many gates are valid  */
    uint32_t t_ms;                            /* tick of last eng frame    */
} ld_eng_t;

/* =========================================================================
 *  Parser state (byte stream)
 * ========================================================================= */
typedef struct { uint8_t st, tail; uint16_t len, n; uint8_t buf[LD_BUF]; } ld_parser_t;

/* Returns 1 when a basic-target frame (0x02) was decoded into *o */
int ld_feed(ld_parser_t *p, uint8_t b, ld_target_t *o, uint32_t now_ms);
/* Returns 1 when an engineering-mode frame (0x01) was decoded into *eng */
int ld_feed_eng(ld_parser_t *p, uint8_t b, ld_eng_t *eng, uint32_t now_ms);

/* =========================================================================
 *  Command interface (full LD2412 command set, Protocol V1.05)
 * ========================================================================= */
typedef enum {
    LD_CMD_IDLE = 0,
    LD_CMD_SENDING = 1,
    LD_CMD_WAIT_ACK = 2
} ld_cmd_state_t;

/* Transmit callback: app.c wires this to HAL_UART_Transmit on huart5 */
typedef void (*ld_tx_byte_fn)(uint8_t b);

typedef struct {
    ld_cmd_state_t state;
    ld_tx_byte_fn tx;
    uint16_t cmd_word;
    uint8_t value[16];
    uint8_t value_len;
    uint8_t frame[32];
    uint8_t frame_pos, frame_len;
    uint32_t t_start;
    uint8_t retries;
    /* ACK frame parser state */
    uint8_t ack_st;
    uint16_t ack_len, ack_n;
    uint8_t ack_buf[32];
    uint8_t ack_status;
    uint8_t ack_data[16];
    uint8_t ack_data_len;
    int done;                       /* 1 when command completed (ok or fail) */
    int ok;                         /* 1 if last command succeeded */
} ld_cmd_t;

/* Command words (per HLK-LD2412 Serial Communication Protocol V1.05) */
#define LD_CMD_ENABLE_CONFIG      0x00FFu   /* Enable configuration (value 0x0001) */
#define LD_CMD_END_CONFIG         0x00FEu   /* End configuration */
#define LD_CMD_RESOLUTION         0x0001u   /* Radar resolution (6 bytes) */
#define LD_CMD_READ_RESOLUTION    0x0011u   /* Read resolution */
#define LD_CMD_BASE_PARAMS        0x0002u   /* Basic params: min_gate,max_gate,dwell(2s LE),polarity (5 bytes) */
#define LD_CMD_READ_BASE_PARAMS   0x0012u   /* Read base parameters */
#define LD_CMD_MOTION_SENSITIVITY 0x0003u   /* Motion sensitivity per gate (14 bytes) */
#define LD_CMD_STATIC_SENSITIVITY 0x0004u   /* Static sensitivity per gate (14 bytes) */
#define LD_CMD_ENGINEERING_ON     0x0062u   /* Enable engineering mode */
#define LD_CMD_ENGINEERING_OFF    0x0063u   /* Disable engineering mode (lower power/heat) */
#define LD_CMD_MOTION_SENS_QUERY  0x0013u   /* Query motion sensitivity */
#define LD_CMD_STATIC_SENS_QUERY  0x0014u   /* Query static sensitivity */
#define LD_CMD_FW_VERSION         0x0015u   /* Read firmware version */
#define LD_CMD_BAUD_RATE          0x001Au   /* Set baud rate */
#define LD_CMD_FACTORY_RESET      0x001Bu   /* Restore factory settings */
#define LD_CMD_REBOOT             0x001Cu   /* Reboot module */
#define LD_CMD_SET_BLUETOOTH      0x00A4u   /* Bluetooth switch: 0x0000 OFF, 0x0100 ON */

/* Frame constants */
#define LD_FRAME_HDR0  0xFDu
#define LD_FRAME_HDR1  0xFCu
#define LD_FRAME_HDR2  0xFBu
#define LD_FRAME_HDR3  0xFAu
#define LD_FRAME_FOOT0 0x04u
#define LD_FRAME_FOOT1 0x03u
#define LD_FRAME_FOOT2 0x02u
#define LD_FRAME_FOOT3 0x01u

/* Basic target data output frame header: FD 02 01 04 */
#define LD_DATA_HDR0   0xFDu
#define LD_DATA_HDR1   0x02u
#define LD_DATA_HDR2   0x01u
#define LD_DATA_HDR3   0x04u
#define LD_DATA_TAIL0  0xF8u
#define LD_DATA_TAIL1  0xF7u
#define LD_DATA_TAIL2  0xF6u
#define LD_DATA_TAIL3  0xF5u

/* ---- Command encoder ---- */
/* Builds a command frame into *out, returns frame length (0 if out too small) */
size_t ld_build_cmd_frame(uint16_t cmd_word, const uint8_t *value, uint8_t value_len,
                          uint8_t *out, size_t out_len);

/* ---- Command state machine (non-blocking) ---- */
void ld_cmd_init(ld_cmd_t *c, ld_tx_byte_fn tx);
int  ld_cmd_send(ld_cmd_t *c, uint16_t cmd_word, const uint8_t *value, uint8_t value_len,
                 uint32_t now_ms);
/* Call from app_loop; transmits pending bytes via c->tx. Returns 1 if a byte was sent. */
int  ld_cmd_poll(ld_cmd_t *c, uint32_t now_ms);
/* Feed an incoming UART byte (ACK response); returns 1 when command completed */
int  ld_cmd_ack_byte(ld_cmd_t *c, uint8_t b, uint32_t now_ms);
int  ld_cmd_done(const ld_cmd_t *c);
int  ld_cmd_ok(const ld_cmd_t *c);

/* ---- Convenience: bounded init-time configuration sequences ---- */
/* Each returns 1 when the sequence has completed (success or final failure). */
int ld_config_begin(ld_cmd_t *c, uint32_t now_ms);
int ld_config_end(ld_cmd_t *c, uint32_t now_ms);
int ld_engineering_mode(ld_cmd_t *c, int enable, uint32_t now_ms);
int ld_set_motion_sensitivity(ld_cmd_t *c, const uint8_t gates[14], uint32_t now_ms);
int ld_set_static_sensitivity(ld_cmd_t *c, const uint8_t gates[14], uint32_t now_ms);
int ld_set_base_params(ld_cmd_t *c, uint8_t min_gate, uint8_t max_gate,
                       uint16_t dwell_s, uint8_t polarity, uint32_t now_ms);
int ld_get_fw_version(ld_cmd_t *c, uint32_t now_ms);
int ld_reboot(ld_cmd_t *c, uint32_t now_ms);
int ld_factory_reset(ld_cmd_t *c, uint32_t now_ms);
int ld_disable_bluetooth(ld_cmd_t *c, uint32_t now_ms);

#include "stm32f7xx_hal.h"
#define LD_CMD_ENABLE_CONF    LD_CMD_ENABLE_CONFIG
#define LD_CMD_END_CONF       LD_CMD_END_CONFIG
#define LD_CMD_ENG_MODE_ON    LD_CMD_ENGINEERING_ON
#define LD_CMD_ENG_MODE_OFF   LD_CMD_ENGINEERING_OFF

int ld_send_cmd(UART_HandleTypeDef *huart, uint16_t cmd_word, const uint8_t *val, uint16_t val_len);
int ld_init_thermal_safe(UART_HandleTypeDef *huart);

#endif /* LD2412_H */
