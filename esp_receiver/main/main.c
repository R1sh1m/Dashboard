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

#include "lora_radio.h"
#include "proto.h"
#include "ground_bridge.h"

static const char *TAG = "artemis_rx";

/**
 * @brief Main receive loop
 * 
 * Polls the LoRa radio for incoming frames, validates them,
 * and passes to the ground bridge for JSON conversion.
 */
void app_main(void)
{
    ESP_LOGI(TAG, "Artemis Ground Receiver booting...");
    
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
            
            /* Pass frame to ground bridge for validation and JSON conversion */
            ground_bridge_process_frame(rx.buf, rx.len, rx.rssi, rx.snr);
            
            /* Radio automatically returns to RX after poll() */
        } else if (evt == RADIO_EVT_TIMEOUT) {
            ESP_LOGW(TAG, "RX timeout - restarting RX");
            radio_start_rx();
        } else if (evt == RADIO_EVT_ERR) {
            ESP_LOGE(TAG, "Radio error");
            radio_start_rx();
        }
        
        /* Heartbeat: print status every 5 seconds if no activity */
        uint32_t now = esp_timer_get_time() / 1000;
        if (now - last_activity > 5000) {
            ESP_LOGI(TAG, "No LoRa activity for %u seconds", (now - last_activity) / 1000);
            last_activity = now;
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}