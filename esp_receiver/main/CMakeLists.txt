idf_component_register(SRCS "lora_radio.c" "ground_bridge.c" "proto.c" "main.c"
                       INCLUDE_DIRS "." "../../common"
                       REQUIRES esp_driver_spi esp_driver_uart esp_timer esp_driver_gpio esp_tinyusb)
