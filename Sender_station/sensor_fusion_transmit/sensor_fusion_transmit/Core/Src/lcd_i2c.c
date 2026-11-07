/* HD44780 16x2 via PCF8574/PCF8574A backpack (4-bit mode)
 * Uses Arduino LiquidCrystal_I2C algorithm & timings
 */
#include "lcd_i2c.h"
#include "main.h"
#include <string.h>
#include <stdio.h>

extern I2C_HandleTypeDef hi2c1;

/* PCF8574 output bit masks */
#define RS  0x01u   /* P0 - register select        */
#define RW  0x02u   /* P1 - read/write (always 0)  */
#define EN  0x04u   /* P2 - enable strobe          */
#define BL  0x08u   /* P3 - backlight              */

static int                 ok        = 0;
static uint8_t             lcd_addr8 = (0x27u << 1); /* default 0x27 */
static I2C_HandleTypeDef  *lcd_hi2c  = &hi2c1;
static uint8_t             lcd_bl    = BL;

/* ── Low-level expander write (matches Arduino LiquidCrystal_I2C) ───────── */
static HAL_StatusTypeDef expander_write(uint8_t data)
{
    uint8_t b = (uint8_t)(data | lcd_bl);
    return HAL_I2C_Master_Transmit(lcd_hi2c, lcd_addr8, &b, 1, 50);
}

/* ── Pulse enable (matches Arduino pulseEnable) ─────────────────────────── */
static void pulse_enable(uint8_t data)
{
    expander_write((uint8_t)(data | EN));
    HAL_Delay(1);  /* enable pulse width > 450 ns */
    expander_write((uint8_t)(data & ~EN));
    HAL_Delay(1);  /* execution time > 37 us */
}

/* ── Write 4 bits (matches Arduino write4bits) ──────────────────────────── */
static void write4bits(uint8_t value)
{
    expander_write(value);
    pulse_enable(value);
}

/* ── Send command or data (matches Arduino send) ─────────────────────────── */
static void send(uint8_t value, uint8_t mode)
{
    uint8_t highnib = (uint8_t)(value & 0xF0u);
    uint8_t lownib  = (uint8_t)((value << 4) & 0xF0u);
    write4bits((uint8_t)(highnib | mode));
    write4bits((uint8_t)(lownib  | mode));
}

/* ── Try initializing on a specific 7-bit address ───────────────────────── */
static int try_init_addr(uint8_t addr7)
{
    uint8_t a8 = (uint8_t)(addr7 << 1);
    uint8_t test_byte = BL;

    /* 1. Try sending 1 byte (backlight ON) */
    HAL_StatusTypeDef st = HAL_I2C_Master_Transmit(&hi2c1, a8, &test_byte, 1, 30);
    uint32_t err = hi2c1.ErrorCode;

    printf("  Probe 0x%02X: Transmit=%d (err=0x%lX)\r\n", addr7, st, err);

    if (st != HAL_OK) {
        return 0; /* No ACK */
    }

    printf("  >>> SUCCESS! PCF8574 ACked at 0x%02X! <<<\r\n", addr7);
    lcd_addr8 = a8;
    lcd_hi2c  = &hi2c1;
    ok        = 1;
    lcd_bl    = BL;

    /* Arduino LiquidCrystal_I2C initialization sequence (HD44780 datasheet page 45-46) */
    HAL_Delay(50); /* wait for power to stabilize */

    /* Reset expander and turn backlight on */
    expander_write(lcd_bl);
    HAL_Delay(100);

    /* 3x 0x03 to force 8-bit reset, then 0x02 to switch to 4-bit mode */
    write4bits(0x30);
    HAL_Delay(5);   /* wait > 4.1ms */
    write4bits(0x30);
    HAL_Delay(5);   /* wait > 4.1ms */
    write4bits(0x30);
    HAL_Delay(2);   /* wait > 100us */
    write4bits(0x20);  /* 4-bit mode */
    HAL_Delay(2);

    /* Function set: 2 lines, 5x8 font */
    send(0x28, 0);
    HAL_Delay(2);

    /* Display control: display off */
    send(0x08, 0);
    HAL_Delay(2);

    /* Clear display */
    send(0x01, 0);
    HAL_Delay(5);

    /* Entry mode set: increment cursor, no shift */
    send(0x06, 0);
    HAL_Delay(2);

    /* Display control: display ON, cursor OFF, blink OFF */
    send(0x0C, 0);
    HAL_Delay(2);

    return 1;
}

/* ════════════════════════════════════════════════════════════════════════════
 * lcd_init()
 * ════════════════════════════════════════════════════════════════════════════ */
int lcd_init(void)
{
    ok = 0;

    printf("\r\n=== I2C1 Full Bus Scan (all 127 addresses) ===\r\n");
    int found_any = 0;

    for (uint8_t a = 1; a < 127; a++) {
        uint8_t a8 = (uint8_t)(a << 1);
        uint8_t test_b = BL;
        HAL_StatusTypeDef st = HAL_I2C_Master_Transmit(&hi2c1, a8, &test_b, 1, 20);
        if (st == HAL_OK) {
            printf("  >>> ACK AT ADDRESS 0x%02X! ", a);
            if (a == 0x76 || a == 0x77) {
                printf("[BME688]\r\n");
            } else {
                printf("[POSSIBLE LCD!]\r\n");
                if (try_init_addr(a)) {
                    printf("=== LCD INITIALIZED AT 0x%02X! ===\r\n", a);
                    return 0;
                }
            }
            found_any = 1;
        }
    }

    if (!found_any) {
        printf("  (No devices ACKed on I2C1)\r\n");
    }

    return -1;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

void lcd_clear(void)
{
    if (!ok) return;
    send(0x01, 0);
    HAL_Delay(3);
}

void lcd_cursor(int row, int col)
{
    if (!ok) return;
    uint8_t addr = (uint8_t)((row ? 0x40 : 0x00) + (col & 0x0F));
    send((uint8_t)(0x80 | addr), 0);
    HAL_Delay(1);
}

void lcd_backlight(int on)
{
    lcd_bl = on ? BL : 0;
    if (!ok || lcd_hi2c == NULL) return;
    expander_write(0);
}

void lcd_print(int row, const char *s)
{
    if (!ok) return;
    send((uint8_t)(0x80 | (row ? 0x40 : 0x00)), 0);
    HAL_Delay(1);
    for (int i = 0; i < 16; i++) {
        send(*s ? (uint8_t)*s++ : (uint8_t)' ', RS);
    }
}
