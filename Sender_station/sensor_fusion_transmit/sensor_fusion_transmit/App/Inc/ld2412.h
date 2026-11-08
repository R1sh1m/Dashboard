#ifndef LD2412_H
#define LD2412_H
#include <stdint.h>
#define LD_BUF 64u
typedef struct {
    uint8_t state;                  /* 0 none, 1 moving, 2 stationary, 3 both */
    uint16_t mov_cm, stat_cm; uint8_t mov_e, stat_e;
    uint32_t t_ms;                  /* tick of last good frame */
} ld_target_t;
typedef struct { uint8_t st, tail; uint16_t len, n; uint8_t buf[LD_BUF]; } ld_parser_t;
/* returns 1 when a basic-target frame was decoded into *o */
int ld_feed(ld_parser_t *p, uint8_t b, ld_target_t *o, uint32_t now_ms);
#endif
