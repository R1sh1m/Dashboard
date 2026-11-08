/* HD44780 16x2 via PCF8574/PCF8574A backpack (4-bit mode)
 * Uses Arduino LiquidCrystal_I2C algorithm & timings
 */
#include "lcd_i2c.h"
#include "main.h"
#include "app_config.h"
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

/* ── Try initializing on a specific 7-bit address on a given bus ──────────
 * Retries up to LCD_PROBE_RETRIES times with short delays so a slow-to-power-up
 * LCD or momentary I2C glitch doesn't cause a false negative. */
#define LCD_PROBE_RETRIES 3u
#define LCD_PROBE_DELAY_MS 10u

static int try_init_addr(I2C_HandleTypeDef *hi2c, uint8_t addr7)
{
    uint8_t a8 = (uint8_t)(addr7 << 1);
    uint8_t test_byte = BL;

    for (uint32_t attempt = 0; attempt < LCD_PROBE_RETRIES; attempt++) {
        /* 1. Try sending 1 byte (backlight ON) */
        HAL_StatusTypeDef st = HAL_I2C_Master_Transmit(hi2c, a8, &test_byte, 1, 30);
        uint32_t err = hi2c->ErrorCode;

        printf("  Probe 0x%02X attempt %lu: Transmit=%d (err=0x%lX)\r\n", addr7, (unsigned long)(attempt + 1), st, err);

        if (st == HAL_OK) {
            printf("  >>> SUCCESS! PCF8574 ACked at 0x%02X! <<<\r\n", addr7);
            lcd_addr8 = a8;
            lcd_hi2c  = hi2c;
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

        /* Delay before retry (skip delay on last attempt) */
        if (attempt + 1 < LCD_PROBE_RETRIES) {
            HAL_Delay(LCD_PROBE_DELAY_MS);
        }
    }

    return 0; /* No ACK after all retries */
}

/* ════════════════════════════════════════════════════════════════════════════
 * lcd_init()
 * ════════════════════════════════════════════════════════════════════════════ */
int lcd_init(void)
{
    ok = 0;
    int found_any = 0;
    uint32_t scan_start = HAL_GetTick();
    uint32_t scan_budget_ms = 800u;   /* bound full bus scan so boot never hangs */

    /* I2C buses to scan in priority order. I2C1 FIRST per hardware doc. */
    I2C_HandleTypeDef *buses[] = { &hi2c1, &hi2c2, &hi2c3 };
    const char *bus_names[] = { "I2C1 (PB8/PB9)", "I2C2 (PF0/PF1)", "I2C3 (PC9/PA8)" };
    int num_buses = (int)(sizeof(buses) / sizeof(buses[0]));

    /* 1. Probe the configured LCD address (per app_config.h) then standard 0x27
     *    on each bus, in priority order. Stops at first successful init. */
    for (int b = 0; b < num_buses; b++) {
        I2C_HandleTypeDef *hi2c = buses[b];
        const char *bus_name = bus_names[b];

        printf("\r\n=== Probing LCD at configured address 0x%02X (%s) ===\r\n", LCD_I2C_ADDR, bus_name);
        if (try_init_addr(hi2c, LCD_I2C_ADDR)) {
            printf("=== LCD INITIALIZED AT 0x%02X on %s! ===\r\n", LCD_I2C_ADDR, bus_name);
            return 0;
        }
        if (0x27u != LCD_I2C_ADDR) {
            printf("\r\n=== Probing LCD at standard address 0x27 (%s) ===\r\n", bus_name);
            if (try_init_addr(hi2c, 0x27u)) {
                printf("=== LCD INITIALIZED AT 0x27 on %s! ===\r\n", bus_name);
                return 0;
            }
        }
    }

    /* 2. Full bus scan for remaining devices on all buses (BME688 at 0x76/0x77,
     *    plus any other LCD in 0x20-0x3F). Skip already-probed addrs on I2C1.
     *    Bounded by scan_budget_ms so headless boot never hangs. */
    for (int b = 0; b < num_buses; b++) {
        /* Stop scanning if we've used our time budget */
        if ((int32_t)(HAL_GetTick() - scan_start) >= (int32_t)scan_budget_ms) {
            printf("\r\n=== %s Full Bus Scan SKIPPED (time budget expired) ===\r\n", bus_names[b]);
            break;
        }
        I2C_HandleTypeDef *hi2c = buses[b];
        const char *bus_name = bus_names[b];

        printf("\r\n=== %s Full Bus Scan (all 127 addresses) ===\r\n", bus_name);
        for (uint8_t a = 1; a < 127; a++) {
            /* Abort if time budget expired mid-scan */
            if ((int32_t)(HAL_GetTick() - scan_start) >= (int32_t)scan_budget_ms) {
                printf("\r\n=== %s Full Bus Scan ABORTED (time budget expired at 0x%02X) ===\r\n", bus_name, a);
                break;
            }
            /* Skip already-probed addresses on I2C1 only */
            if (b == 0 && (a == LCD_I2C_ADDR || a == 0x27u)) continue;
            uint8_t a8 = (uint8_t)(a << 1);
            uint8_t test_b = BL;
            HAL_StatusTypeDef st = HAL_I2C_Master_Transmit(hi2c, a8, &test_b, 1, 20);
            if (st == HAL_OK) {
                printf("  >>> ACK AT ADDRESS 0x%02X! ", a);
                if (a == 0x76 || a == 0x77) {
                    printf("[BME688]\r\n");
                } else if (a >= 0x20 && a <= 0x3F) {
                    printf("[POSSIBLE LCD!]\r\n");
                    if (try_init_addr(hi2c, a)) {
                        printf("=== LCD INITIALIZED AT 0x%02X on %s! ===\r\n", a, bus_name);
                        return 0;
                    }
                } else {
                    printf("[device]\r\n");
                }
                found_any = 1;
            }
        }
    }

    if (!found_any) {
        printf("  (No devices ACKed on any bus)\r\n");
    }

    /* 3. Single-line diagnostic when no LCD was found in 0x20-0x3F.
     *    Does NOT block the main loop: lcd_init returns -1 and app_loop
     *    retries lcd_init every 1500 ms while g_lcd_ok == 0. */
    if (!ok) {
        printf("[LCD] Scanner: No device detected at 0x20-0x27 or 0x38-0x3F. Continuing headless.\r\n");
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
