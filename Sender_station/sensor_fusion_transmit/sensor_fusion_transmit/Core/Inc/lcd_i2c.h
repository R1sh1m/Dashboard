#ifndef LCD_I2C_H
#define LCD_I2C_H

int  lcd_init(void);                       /* 0 ok, <0 not found */
int  lcd_reinit(void);                     /* Fast 4-bit HD44780 re-init after brownout */
int  lcd_print(int row, const char *s);    /* 16 chars, padded. Returns 0 ok, <0 fail */
void lcd_clear(void);
void lcd_cursor(int row, int col);
void lcd_backlight(int on);

#endif /* LCD_I2C_H */
