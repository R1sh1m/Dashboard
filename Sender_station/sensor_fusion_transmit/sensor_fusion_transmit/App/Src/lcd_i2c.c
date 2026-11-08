/* HD44780 16x2 via PCF8574/PCF8574A backpack (4-bit mode) on I2C1 */
/* Wrapper around cristobalgc/STM32_LiquidCrystal_I2C library */
/* PCF8574 pin mapping: P0=RS, P1=R/W, P2=EN, P3=BL, P4-P7=D4-D7 */
/* LCD shares I2C1 with BME688 (0x76/0x77) - no address collision. */
/* Power LCD at 3.3V on the shared bus to avoid damaging the BME. */
#include "lcd_i2c.h"
#include "main.h"
#include "app_config.h"
#include <string.h>
#include <stdio.h>

extern I2C_HandleTypeDef hi2c1;

/* PCF8574 output bit masks */
#define BL_MASK 0x08u   /* P3 - backlight */
#define EN_MASK 0x04u   /* P2 - enable strobe */
#define RS_MASK 0x01u   /* P0 - register select */

/* ---- cristobalgc library types (adapted for STM32F7) ---- */
typedef enum { LCD_NOK, LCD_OK } lcd_error_t;

typedef struct {
    I2C_HandleTypeDef *hi2c;
    uint8_t _cols;
    uint8_t _rows;
    uint8_t _Addr;
    uint8_t _dotSize;
} LCD_cfg_t;

typedef struct {
    uint8_t _Register;
    uint8_t _displayfunction;
    uint8_t _displaycontrol;
    uint8_t _displaymode;
    uint8_t _backlightval;
    uint8_t _invertBigFont;
} LCD_data_t;

typedef struct {
    LCD_cfg_t Config;
    LCD_data_t Data;
} LCD_t;

/* ---- static state ---- */
static LCD_t lcd_obj;
static LCD_cfg_t lcd_cfg;
static int lcd_ok = 0;

/* ---- cristobalgc library functions (adapted for STM32F7, HAL_Delay) ---- */

static lcd_error_t lcd_expanderWrite(LCD_t *lcd, uint8_t data)
{
    data = data | (lcd->Data._backlightval & 0x08u);   /* merge backlight state */
    if (HAL_I2C_Master_Transmit(lcd->Config.hi2c, lcd->Config._Addr, &data, 1, 100) != HAL_OK) {
        return LCD_NOK;
    }
    return LCD_OK;
}

static void lcd_send(LCD_t *lcd, uint8_t value, uint8_t mode)
{
    uint8_t highnib = value & 0xF0u;
    uint8_t lownib  = (value << 4) & 0xF0u;
    uint8_t bl      = lcd->Data._backlightval;

    /* high nibble */
    lcd_expanderWrite(lcd, highnib | mode | bl);
    lcd_expanderWrite(lcd, highnib | mode | bl | EN_MASK);
    HAL_Delay(1);
    lcd_expanderWrite(lcd, (uint8_t)(highnib | mode | (bl & ~EN_MASK)));
    HAL_Delay(50);

    /* low nibble */
    lcd_expanderWrite(lcd, lownib | mode | bl);
    lcd_expanderWrite(lcd, lownib | mode | bl | EN_MASK);
    HAL_Delay(1);
    lcd_expanderWrite(lcd, (uint8_t)(lownib | mode | (bl & ~EN_MASK)));
    HAL_Delay(50);
}

static void lcd_cmd(LCD_t *lcd, uint8_t cmd)
{
    lcd_send(lcd, cmd, 0x00u);
}

static void lcd_data(LCD_t *lcd, uint8_t data)
{
    lcd_send(lcd, data, RS_MASK);
}

/* ---- Wrapper functions (original API) ---- */

int lcd_init(void)
{
    uint8_t addr = LCD_I2C_ADDR;   /* 0x27 from app_config.h */

    printf("LCD init: probing PCF8574 at 0x%02X on I2C1...\r\n", addr);

    if (HAL_I2C_IsDeviceReady(&hi2c1, (uint16_t)(addr << 1), 2, 20) != HAL_OK) {
        printf("LCD init: NO PCF8574 found at 0x%02X on I2C1\r\n", addr);
        lcd_ok = 0;
        return -1;
    }

    /* Configure cristobalgc library */
    memset(&lcd_cfg, 0, sizeof(lcd_cfg));
    lcd_cfg.hi2c  = &hi2c1;
    lcd_cfg._cols = 16;
    lcd_cfg._rows = 2;
    lcd_cfg._Addr = addr;          /* 7-bit address, STM32 HAL convention */
    lcd_cfg._dotSize = 0;

    memset(&lcd_obj, 0, sizeof(lcd_obj));
    memcpy(&lcd_obj.Config, &lcd_cfg, sizeof(lcd_cfg));
    lcd_obj.Data._Register     = 0;
    lcd_obj.Data._backlightval = BL_MASK;   /* backlight on */
    lcd_obj.Data._displaycontrol = 0;
    lcd_obj.Data._displaymode = 0;
    lcd_obj.Data._invertBigFont = 0;

    lcd_obj.Data._displayfunction = 0x00u;   /* 4-bit, 1-line, 5x8 */
    if (lcd_cfg._rows > 1u) {
        lcd_obj.Data._displayfunction = 0x08u;   /* 2-line */
    }

    /* Power-on delay >40 ms */
    HAL_Delay(50);

    /* HD44780 4-bit initialization sequence */
    lcd_expanderWrite(&lcd_obj, lcd_obj.Data._backlightval);
    HAL_Delay(500);

    lcd_expanderWrite(&lcd_obj, 0x30u | lcd_obj.Data._backlightval);
    HAL_Delay(5);
    lcd_expanderWrite(&lcd_obj, 0x30u | lcd_obj.Data._backlightval);
    HAL_Delay(1);
    lcd_expanderWrite(&lcd_obj, 0x30u | lcd_obj.Data._backlightval);
    HAL_Delay(1);
    lcd_expanderWrite(&lcd_obj, 0x20u | lcd_obj.Data._backlightval);

    lcd_cmd(&lcd_obj, 0x28u);           /* Function set: 4-bit, 2-line, 5x8 */
    HAL_Delay(1);
    lcd_obj.Data._displaycontrol = 0x04u;   /* DISPLAYON | CURSOROFF | BLINKOFF */
    lcd_cmd(&lcd_obj, 0x08u | lcd_obj.Data._displaycontrol);
    lcd_cmd(&lcd_obj, 0x01u);           /* Clear display */
    HAL_Delay(2);
    lcd_obj.Data._displaymode = 0x02u;  /* ENTRYLEFT | ENTRYSHIFTDECREMENT */
    lcd_cmd(&lcd_obj, 0x04u | lcd_obj.Data._displaymode);
    lcd_cmd(&lcd_obj, 0x02u);           /* Home */
    HAL_Delay(2);

    lcd_ok = 1;
    printf("LCD init: PCF8574 at 0x%02X on I2C1 ready\r\n", addr);
    return 0;
}

void lcd_print(int row, const char *s)
{
    if (!lcd_ok) return;
    lcd_cmd(&lcd_obj, (uint8_t)(0x80u | (row ? 0x40u : 0x00u)));
    for (int i = 0; i < 16; i++) {
        char c = *s ? *s++ : ' ';
        lcd_data(&lcd_obj, (uint8_t)c);
    }
}

void lcd_clear(void)
{
    if (!lcd_ok) return;
    lcd_cmd(&lcd_obj, 0x01u);
    HAL_Delay(2);
}

void lcd_cursor(int row, int col)
{
    if (!lcd_ok) return;
    lcd_cmd(&lcd_obj, (uint8_t)(0x80u | (row ? 0x40u : 0x00u) | (uint8_t)col));
}

void lcd_backlight(int on)
{
    if (!lcd_ok) return;
    lcd_obj.Data._backlightval = on ? BL_MASK : 0x00u;
    lcd_expanderWrite(&lcd_obj, lcd_obj.Data._backlightval);
}
