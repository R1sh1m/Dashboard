/* Semtech sx126x_driver v2.3.2 HAL port for STM32 HAL (SPI1, software NSS) */
#include "main.h"
#include "sx126x_hal.h"
#include <string.h>
#include <stdio.h>

extern SPI_HandleTypeDef hspi1;

static void wait_busy(void)
{
    uint32_t t0 = HAL_GetTick();
    if (HAL_GPIO_ReadPin(LORA_BUSY_GPIO_Port, LORA_BUSY_Pin) == GPIO_PIN_SET) {
        while (HAL_GPIO_ReadPin(LORA_BUSY_GPIO_Port, LORA_BUSY_Pin) == GPIO_PIN_SET) {
            if (HAL_GetTick() - t0 > 50) {
                printf("[WARN] BUSY TIMEOUT (PF13 is stuck HIGH!)\r\n");
                break;
            }
        }
    }
}

/* Drive both PA4 and PD14 (D10 on Nucleo-144) for hardware compatibility */
#define NSS_LOW()  do { \
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_RESET); \
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_14, GPIO_PIN_RESET); \
} while (0)

#define NSS_HIGH() do { \
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_SET); \
    HAL_GPIO_WritePin(GPIOD, GPIO_PIN_14, GPIO_PIN_SET); \
} while (0)

sx126x_hal_status_t sx126x_hal_write(const void *ctx, const uint8_t *cmd, const uint16_t cl,
                                     const uint8_t *data, const uint16_t dl)
{
    (void)ctx;
    uint8_t tx[256];
    uint8_t rx[256];
    uint16_t total = cl + dl;
    if (total > sizeof(tx)) return SX126X_HAL_STATUS_ERROR;
    memcpy(tx, cmd, cl);
    if (data && dl) memcpy(tx + cl, data, dl);

    wait_busy();
    NSS_LOW();
    HAL_SPI_TransmitReceive(&hspi1, tx, rx, total, 100);
    NSS_HIGH();
    wait_busy();
    return SX126X_HAL_STATUS_OK;
}

sx126x_hal_status_t sx126x_hal_read(const void *ctx, const uint8_t *cmd, const uint16_t cl,
                                    uint8_t *data, const uint16_t dl)
{
    (void)ctx;
    uint8_t tx[256];
    uint8_t rx[256];
    uint16_t total = cl + dl;
    if (total > sizeof(tx)) return SX126X_HAL_STATUS_ERROR;
    memcpy(tx, cmd, cl);
    if (dl) memset(tx + cl, 0x00, dl);

    wait_busy();
    NSS_LOW();
    HAL_SPI_TransmitReceive(&hspi1, tx, rx, total, 100);
    NSS_HIGH();
    wait_busy();
    if (data && dl) memcpy(data, rx + cl, dl);

    /* SPI debug print disabled for optimal throughput */
    return SX126X_HAL_STATUS_OK;
}

sx126x_hal_status_t sx126x_hal_reset(const void *ctx)
{
    (void)ctx;
    /* Drive both PE11 and PF3 (D8 on Nucleo-144) for hardware compatibility */
    HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOF, GPIO_PIN_3, GPIO_PIN_RESET);
    HAL_Delay(10);
    HAL_GPIO_WritePin(GPIOE, GPIO_PIN_11, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOF, GPIO_PIN_3, GPIO_PIN_SET);
    HAL_Delay(20);
    wait_busy();
    return SX126X_HAL_STATUS_OK;
}

sx126x_hal_status_t sx126x_hal_wakeup(const void *ctx)
{
    (void)ctx;
    NSS_LOW();
    HAL_Delay(1);
    NSS_HIGH();
    wait_busy();
    return SX126X_HAL_STATUS_OK;
}
