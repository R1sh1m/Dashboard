/* ===== Core/Src/main.c (CubeMX generated) - only add the lines marked ===== */

/* USER CODE BEGIN Includes */
#include <stdio.h>
#include "app.h"
/* USER CODE END Includes */

/* USER CODE BEGIN 0 */
extern UART_HandleTypeDef huart3;
int _write(int fd, char *ptr, int len)          /* printf -> ST-LINK virtual COM port */
{ (void)fd; HAL_UART_Transmit(&huart3, (uint8_t *)ptr, (uint16_t)len, 100); return len; }
/* USER CODE END 0 */

/* in main(), after all MX_xxx_Init() calls: */
/* USER CODE BEGIN 2 */
app_init();
/* USER CODE END 2 */

/* USER CODE BEGIN WHILE */
while (1)
{
    app_loop();
/* USER CODE END WHILE */
/* USER CODE BEGIN 3 */
}
/* USER CODE END 3 */
