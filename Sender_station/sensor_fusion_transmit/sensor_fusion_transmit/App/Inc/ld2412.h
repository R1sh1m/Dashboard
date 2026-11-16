#ifndef LD2412_H
#define LD2412_H
#include <stdint.h>
#include <stddef.h>
#include "stm32f7xx_hal.h"
#define LD_BUF 64u

/* ---- HLK-LD2410B target state ---- */
typedef struct {
    uint8_t state;                  /* 0 none, 1 moving, 2 stationary, 3 both */
    uint16_t mov_cm, stat_cm;       /* moving / stationary distance (cm) */
    uint8_t mov_e, stat_e;          /* moving / stationary energy (0-100) */
    uint32_t t_ms;                  /* tick of last good frame */
} ld_target_t;

/* ---- Engineering mode (0x01) extended data ---- */
/* Engineering mode reports per-range-gate energy for moving & stationary.
 * LD2410B supports range gates 2..8 m (7 gates).  We store the latest
 * snapshot so the dashboard can render a range-profile heatmap. */
#define LD_ENG_GATES 7u
typedef struct {
    uint8_t  mov_gate_energy[LD_ENG_GATES];   /* energy per gate, moving   */
    uint8_t  stat_gate_energy[LD_ENG_GATES];  /* energy per gate, stationary */
    uint8_t  gate_count;                      /* how many gates are valid  */
    uint32_t t_ms;                            /* tick of last eng frame    */
} ld_eng_t;

/* ---- Parser ---- */
typedef struct { uint8_t st, tail; uint16_t len, n; uint8_t buf[LD_BUF]; } ld_parser_t;
/* returns 1 when a basic-target frame (0x02) was decoded into *o */
int ld_feed(ld_parser_t *p, uint8_t b, ld_target_t *o, uint32_t now_ms);
/* returns 1 when an engineering-mode frame (0x01) was decoded into *eng */
int ld_feed_eng(ld_parser_t *p, uint8_t b, ld_eng_t *eng, uint32_t now_ms);

/* ---- HLK-LD2412 serial command protocol (FD FC FB FA ... 04 03 02 01) ---- */
#define LD_CMD_HEADER0  0xFDu
#define LD_CMD_HEADER1  0xFCu
#define LD_CMD_HEADER2  0xFBu
#define LD_CMD_HEADER3  0xFAu
#define LD_CMD_FOOTER0  0x04u
#define LD_CMD_FOOTER1  0x03u
#define LD_CMD_FOOTER2  0x02u
#define LD_CMD_FOOTER3  0x01u

/* Command words (per HLK-LD2412 Serial Communication Protocol V1.05) */
#define LD_CMD_ENABLE_CONF        0x00FFu   /* Enable configuration */
#define LD_CMD_END_CONF           0x00FEu   /* End configuration */
#define LD_CMD_SET_RESOLUTION     0x0001u   /* Set resolution */
#define LD_CMD_SET_BASE_PARAMS    0x0002u   /* Set max distance gate / unoccupied time */
#define LD_CMD_SET_MOV_SENS       0x0003u   /* Motion sensitivity */
#define LD_CMD_SET_STAT_SENS      0x0004u   /* Static sensitivity */
#define LD_CMD_ENG_MODE_ON        0x0062u   /* Enable engineering mode */
#define LD_CMD_ENG_MODE_OFF       0x0063u   /* Disable engineering mode (lower power/heat) */
#define LD_CMD_READ_FW_VERSION    0x00A0u   /* Read firmware version */
#define LD_CMD_SET_BAUD           0x00A1u   /* Set baud rate */
#define LD_CMD_FACTORY_RESET      0x00A2u   /* Factory reset */
#define LD_CMD_REBOOT             0x00A3u   /* Reboot radar */
#define LD_CMD_SET_BLUETOOTH      0x00A4u   /* Bluetooth switch: 0x0000 OFF, 0x0100 ON */

/* Build an official HLK-LD2412 command frame into *out. Returns frame length or 0 on error. */
int ld_build_cmd(uint16_t cmd_word, const uint8_t *val, uint16_t val_len, uint8_t *out, uint8_t out_len);

/* Transmit a command frame over the given UART handle. */
int ld_send_cmd(UART_HandleTypeDef *huart, uint16_t cmd_word, const uint8_t *val, uint16_t val_len);

/* Thermal protection: shuts down 2.4GHz BLE radio & disables continuous engineering mode.
 * Drops radar operating temperature by 15-20°C and eliminates overheating. */
int ld_init_thermal_safe(UART_HandleTypeDef *huart);

#endif
