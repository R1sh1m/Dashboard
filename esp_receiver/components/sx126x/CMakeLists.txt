# ESP-IDF component for Semtech SX126x driver
# Only core driver files are included. Optional BPSK/LR-FHSS modules can be added if needed.

idf_component_register(
    SRCS
        sx126x.c
        sx126x_driver_version.c
        # Uncomment the following lines to enable optional modules:
        # sx126x_bpsk.c
        # sx126x_lr_fhss.c
        # lr_fhss_mac.c
    INCLUDE_DIRS
        .
)
