#ifndef LCD_I2C_H
#define LCD_I2C_H
int  lcd_init(void);                       /* 0 ok, <0 not found */
void lcd_print(int row, const char *s);    /* 16 chars, padded */
#endif
