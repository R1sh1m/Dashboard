/**
 * @file main.c
 * @brief ESP32-S3 LoRa Ground Receiver for Artemis Dashboard
 * 
 * Receives LoRa frames from STM32 robot, validates CRC, reassembles fragments,
 * converts to JSON, and emits newline-delimited output over USB-CDC.
 * 
 * Architecture per Docs/Artemis_LoRa_Packet_Architecture.pdf
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/gpio.h"

#include "lora_radio.h"
#include "proto.h"
#include "ground_bridge.h"

static const char *TAG = "artemis_rx";

/* On-board Blue LED (GPIO 2 on classic ESP32 DevKit boards) */
#define PIN_LED_BLUE      GPIO_NUM_2

static uint32_t s_led_off_deadline = 0;

static void led_init(void)
{
    gpio_config_t led_conf = {
        .pin_bit_mask = (1ULL << PIN_LED_BLUE),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&led_conf);
    gpio_set_level(PIN_LED_BLUE, 0);

    /* 3 quick blinks on boot to signal ready */
    for (int i = 0; i < 3; i++) {
        gpio_set_level(PIN_LED_BLUE, 1);
        vTaskDelay(pdMS_TO_TICKS(60));
        gpio_set_level(PIN_LED_BLUE, 0);
        vTaskDelay(pdMS_TO_TICKS(60));
    }
}

static void led_pulse(uint32_t duration_ms)
{
    gpio_set_level(PIN_LED_BLUE, 1);
    s_led_off_deadline = (uint32_t)(esp_timer_get_time() / 1000) + duration_ms;
}

/**
 * @brief Main receive loop
 * 
 * Polls the LoRa radio for incoming frames, validates them,
 * and passes to the ground bridge for JSON conversion.
 */
void app_main(void)
{
    ESP_LOGI(TAG, "Artemis Ground Receiver booting...");

    /* Initialize Blue Activity LED */
    led_init();
    
    /* Initialize LoRa radio */
    int ret = radio_init();
    if (ret != 0) {
        ESP_LOGE(TAG, "radio_init failed: %d", ret);
        /* Continue anyway - may be hardware issue */
    } else {
        ESP_LOGI(TAG, "SX126x radio initialized");
    }
    
    /* Start continuous RX */
    radio_start_rx();
    ESP_LOGI(TAG, "Radio in continuous RX mode");
    
    /* Initialize ground bridge (fragment reassembly + JSON output) */
    ground_bridge_init();
    ESP_LOGI(TAG, "Ground bridge initialized");
    
    /* Main loop: poll radio and process frames */
    radio_rx_t rx;
    uint32_t last_activity = esp_timer_get_time() / 1000;
    
    while (1) {
        radio_evt_t evt = radio_poll(&rx);
        
        if (evt == RADIO_EVT_RX_DONE) {
            last_activity = esp_timer_get_time() / 1000;
            ESP_LOGD(TAG, "RX_DONE: len=%u, RSSI=%d dBm, SNR=%d dB", 
                     rx.len, rx.rssi, rx.snr);
            
            /* Visual indicator: blink blue LED for 80ms on received packet */
            led_pulse(80);

            /* Pass frame to ground bridge for validation and JSON conversion */
            ground_bridge_process_frame(rx.buf, rx.len, rx.rssi, rx.snr);
            
            /* Re-enter continuous RX mode for subsequent packets */
            radio_start_rx();
        } else if (evt == RADIO_EVT_TIMEOUT) {
            ESP_LOGW(TAG, "RX timeout - restarting RX");
            radio_start_rx();
        } else if (evt == RADIO_EVT_ERR) {
            ESP_LOGE(TAG, "Radio error");
            radio_start_rx();
        }
        
        /* Auto turn off activity LED after pulse duration */
        uint32_t now = esp_timer_get_time() / 1000;
        if (s_led_off_deadline && (int32_t)(now - s_led_off_deadline) >= 0) {
            gpio_set_level(PIN_LED_BLUE, 0);
            s_led_off_deadline = 0;
        }

        /* Heartbeat: print status every 5 seconds if no activity */
        if (now - last_activity > 5000) {
            ESP_LOGI(TAG, "No LoRa activity for %u seconds", (now - last_activity) / 1000);
            last_activity = now;
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}