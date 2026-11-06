/* Semtech sx126x_driver v2.3.2 HAL port for STM32 HAL (SPI1, software NSS) */
#include "main.h"
#include "sx126x_hal.h"

extern SPI_HandleTypeDef hspi1;

static void wait_busy(void)
{
    uint32_t t0 = HAL_GetTick();
    while (HAL_GPIO_ReadPin(LORA_BUSY_GPIO_Port, LORA_BUSY_Pin) == GPIO_PIN_SET)
        if (HAL_GetTick() - t0 > 200) break;
}
#define NSS_LOW()  HAL_GPIO_WritePin(LORA_NSS_GPIO_Port, LORA_NSS_Pin, GPIO_PIN_RESET)
#define NSS_HIGH() HAL_GPIO_WritePin(LORA_NSS_GPIO_Port, LORA_NSS_Pin, GPIO_PIN_SET)

sx126x_hal_status_t sx126x_hal_write(const void *ctx, const uint8_t *cmd, const uint16_t cl,
                                     const uint8_t *data, const uint16_t dl)
{
    (void)ctx; sx126x_hal_status_t r = SX126X_HAL_STATUS_OK;
    wait_busy(); NSS_LOW();
    if (HAL_SPI_Transmit(&hspi1, (uint8_t *)cmd, cl, 100) != HAL_OK) r = SX126X_HAL_STATUS_ERROR;
    if (r == SX126X_HAL_STATUS_OK && dl &&
        HAL_SPI_Transmit(&hspi1, (uint8_t *)data, dl, 100) != HAL_OK) r = SX126X_HAL_STATUS_ERROR;
    NSS_HIGH();
    return r;
}

sx126x_hal_status_t sx126x_hal_read(const void *ctx, const uint8_t *cmd, const uint16_t cl,
                                    uint8_t *data, const uint16_t dl)
{
    (void)ctx; sx126x_hal_status_t r = SX126X_HAL_STATUS_OK;
    wait_busy(); NSS_LOW();
    if (HAL_SPI_Transmit(&hspi1, (uint8_t *)cmd, cl, 100) != HAL_OK) r = SX126X_HAL_STATUS_ERROR;
    if (r == SX126X_HAL_STATUS_OK && dl &&
        HAL_SPI_Receive(&hspi1, data, dl, 100) != HAL_OK) r = SX126X_HAL_STATUS_ERROR;
    NSS_HIGH();
    return r;
}

sx126x_hal_status_t sx126x_hal_reset(const void *ctx)
{
    (void)ctx;
    HAL_GPIO_WritePin(LORA_NRST_GPIO_Port, LORA_NRST_Pin, GPIO_PIN_RESET);
    HAL_Delay(2);
    HAL_GPIO_WritePin(LORA_NRST_GPIO_Port, LORA_NRST_Pin, GPIO_PIN_SET);
    HAL_Delay(10);
    wait_busy();
    return SX126X_HAL_STATUS_OK;
}

sx126x_hal_status_t sx126x_hal_wakeup(const void *ctx)
{
    (void)ctx;
    NSS_LOW(); HAL_Delay(1); NSS_HIGH();
    wait_busy();
    return SX126X_HAL_STATUS_OK;
}
