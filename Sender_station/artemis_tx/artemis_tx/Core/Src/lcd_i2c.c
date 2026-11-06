/* HD44780 16x2 via PCF8574 backpack (4-bit mode) on I2C2 */
#include "lcd_i2c.h"
#include "main.h"
#include "app_config.h"
#include <string.h>

extern I2C_HandleTypeDef hi2c2;
#define ADDR (LCD_I2C_ADDR << 1)
#define BL 0x08
#define EN 0x04
#define RS 0x01
static int ok;

static void wr(uint8_t v) { if (ok) HAL_I2C_Master_Transmit(&hi2c2, ADDR, &v, 1, 20); }
static void nib(uint8_t n, uint8_t rs) { uint8_t d = (uint8_t)((n << 4) | BL | rs); wr(d | EN); wr(d); }
static void send(uint8_t v, uint8_t rs) { nib(v >> 4, rs); nib(v & 0x0F, rs); }

int lcd_init(void)
{
    ok = (HAL_I2C_IsDeviceReady(&hi2c2, ADDR, 2, 20) == HAL_OK);
    if (!ok) return -1;
    HAL_Delay(50);
    nib(3, 0); HAL_Delay(5); nib(3, 0); HAL_Delay(1); nib(3, 0); HAL_Delay(1); nib(2, 0);
    send(0x28, 0); send(0x0C, 0); send(0x01, 0); HAL_Delay(2); send(0x06, 0);
    return 0;
}

void lcd_print(int row, const char *s)
{
    if (!ok) return;
    send((uint8_t)(0x80 | (row ? 0x40 : 0x00)), 0);
    for (int i = 0; i < 16; i++) send(*s ? (uint8_t)*s++ : ' ', RS);
}
