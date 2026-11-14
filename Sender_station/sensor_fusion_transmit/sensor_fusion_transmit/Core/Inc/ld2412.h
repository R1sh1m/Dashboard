#ifndef LD2412_H
#define LD2412_H
#include <stdint.h>
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

/* ---- LD2410B serial command protocol (FD FC FB FA ... 04 03 02 01) ---- */
#define LD_CMD_HEADER0  0xFDu
#define LD_CMD_HEADER1  0xFCu
#define LD_CMD_HEADER2  0xFBu
#define LD_CMD_HEADER3  0xFAu
#define LD_CMD_FOOTER0  0x04u
#define LD_CMD_FOOTER1  0x03u
#define LD_CMD_FOOTER2  0x02u
#define LD_CMD_FOOTER3  0x01u

/* Command opcodes (per HLK-LD2410B Serial Communication Protocol V1.07) */
#define LD_CMD_SET_FACTORY        0xA0u   /* restore factory settings */
#define LD_CMD_SET_SENSITIVITY    0xA2u   /* set moving+stationary sensitivity */
#define LD_CMD_SET_RANGE_GATE     0xA3u   /* set max detection range gate (2-8 m) */
#define LD_CMD_SET_BLIND_ZONE     0xA6u   /* set blind zone (0-255 cm) */
#define LD_CMD_SET_ENG_MODE       0xA7u   /* engineering mode on/off */
#define LD_CMD_QUERY_VERSION      0xA1u   /* query firmware version */

/* Sensitivity encoding: 0-9 per gate pair (moving, stationary).
 * 9 = maximum sensitivity (best detection, more false positives),
 * 1 = minimum sensitivity (fewer false positives, shorter range). */
#define LD_SENS_MIN 1u
#define LD_SENS_MAX 9u
#define LD_SENS_DEFAULT_MOV 8u
#define LD_SENS_DEFAULT_STAT 8u

/* Range gate: 2..8 meters.  8 m = maximum range. */
#define LD_RANGE_MIN 2u
#define LD_RANGE_MAX 8u
#define LD_RANGE_DEFAULT 8u

/* Blind zone: 0..255 cm.  0 = no blind zone (maximum range). */
#define LD_BLIND_MIN 0u
#define LD_BLIND_MAX 255u
#define LD_BLIND_DEFAULT 0u

/* Build a command frame into *out (max 64 bytes).  Returns frame length, or 0 on error. */
int ld_build_cmd(uint8_t opcode, const uint8_t *args, uint8_t nargs, uint8_t *out, uint8_t out_len);

/* Convenience: build the full "best quality / max range" config frame sequence.
 * Writes frames into *out, returns total bytes written (multiple frames concatenated). */
int ld_build_max_config(uint8_t *out, uint8_t out_len);

/* Transmit a command frame over the given UART handle (non-blocking, IT mode). */
int ld_send_cmd(UART_HandleTypeDef *huart, uint8_t opcode, const uint8_t *args, uint8_t nargs);

#endif
