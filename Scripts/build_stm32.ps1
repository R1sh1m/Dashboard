#!/usr/bin/env pwsh
# Build script for STM32F722ZE sensor_fusion_transmit
# Uses arm-none-eabi-gcc directly (make not available)

# Toolchain
$CC = "arm-none-eabi-gcc"
$AS = "arm-none-eabi-as"
$OBJCOPY = "arm-none-eabi-objcopy"
$SIZE = "arm-none-eabi-size"

# Project paths
$ROOT = Split-Path -Parent $PSScriptRoot
$PROJECT = "$ROOT/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit"
$SRC_DIR = "$PROJECT/Core/Src"
$INC_DIR = "$PROJECT/Core/Inc"
$STARTUP_DIR = "$PROJECT/Core/Startup"
$DRIVERS_DIR = "$PROJECT/Drivers"
$HAL_SRC_DIR = "$DRIVERS_DIR/STM32F7xx_HAL_Driver/Src"
$SX126X_DIR = "$PROJECT/sx126x_driver/src"

# Output
$BIN_DIR = "$PROJECT/bin"
$SX126X_OBJ_DIR = "$BIN_DIR/sx126x"
if (-not (Test-Path $SX126X_OBJ_DIR)) {
    New-Item -ItemType Directory -Path $SX126X_OBJ_DIR -Force | Out-Null
}
$ELF = "$BIN_DIR/sensor_fusion_transmit.elf"
$HEX = "$BIN_DIR/sensor_fusion_transmit.hex"
$BIN = "$BIN_DIR/sensor_fusion_transmit.bin"
$MAP = "$BIN_DIR/sensor_fusion_transmit.map"

# Compiler flags for STM32F722ZE Cortex-M7 with FPU
$CFLAGS = @(
    "-mcpu=cortex-m7"
    "-mfpu=fpv5-sp-d16"
    "-mfloat-abi=hard"
    "-mthumb"
    "-O0"
    "-g3"
    "-Wall"
    "-fmessage-length=0"
    "-ffunction-sections"
    "-fdata-sections"
    "-fno-common"
    "-DSTM32F722xx"
    "-DUSE_HAL_DRIVER"
    "-DDEBUG"
)

# Include paths
$INCLUDES = @(
    "-I$INC_DIR"
    "-I$DRIVERS_DIR/STM32F7xx_HAL_Driver/Inc"
    "-I$DRIVERS_DIR/CMSIS/Include"
    "-I$DRIVERS_DIR/CMSIS/Device/ST/STM32F7xx/Include"
    "-I$SX126X_DIR"
    "-I$INC_DIR/bsec"
    "-I$INC_DIR/bsec/config"
)

# Source files
$CSOURCES = @(
    "$SRC_DIR/main.c"
    "$SRC_DIR/stm32f7xx_hal_msp.c"
    "$SRC_DIR/stm32f7xx_it.c"
    "$SRC_DIR/system_stm32f7xx.c"
    "$SRC_DIR/bme68x.c"
    "$SRC_DIR/bme688_port.c"
    "$SRC_DIR/gps_ubx.c"
    "$SRC_DIR/ld2412.c"
    "$SRC_DIR/sx126x_hal_stm32.c"
    "$SRC_DIR/syscalls.c"
    "$SRC_DIR/sysmem.c"
    "$SRC_DIR/app.c"
    "$SRC_DIR/bsec_wrapper.c"
    "$SRC_DIR/lcd_i2c.c"
    "$SRC_DIR/proto.c"
    "$SRC_DIR/lora_radio.c"
    "$INC_DIR/bsec/config/bsec_config.c"
)

$ASOURCES = @(
    "$STARTUP_DIR/startup_stm32f722zetx.s"
)

$SX126X_SOURCES = @(
    "$SX126X_DIR/sx126x.c"
    "$SX126X_DIR/sx126x_driver_version.c"
    "$SX126X_DIR/sx126x_bpsk.c"
    "$SX126X_DIR/sx126x_lr_fhss.c"
    "$SX126X_DIR/lr_fhss_mac.c"
)

# Pre-compiled HAL driver object files
$HAL_OBJECTS = @(
    "$HAL_SRC_DIR/stm32f7xx_hal.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_cortex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_gpio.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_i2c.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_i2c_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_pwr.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_pwr_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_rcc.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_rcc_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_spi.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_spi_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_uart.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_uart_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_pcd.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_pcd_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_dma.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_dma_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_exti.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_flash.o"
    "$HAL_SRC_DIR/stm32f7xx_hal_flash_ex.o"
    "$HAL_SRC_DIR/stm32f7xx_ll_usb.o"
)

# Generate .o file paths from sources
$COBJECTS = @()
foreach ($src in $CSOURCES) { $COBJECTS += ($src -replace '\.c$', '.o') }
$ASOBJECTS = @()
foreach ($src in $ASOURCES) { $ASOBJECTS += ($src -replace '\.s$', '.o') }
$SX126X_OBJECTS = @()
foreach ($src in $SX126X_SOURCES) { 
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($src)
    $SX126X_OBJECTS += "$SX126X_OBJ_DIR/$baseName.o" 
}
$OBJECTS = @($COBJECTS + $ASOBJECTS + $SX126X_OBJECTS + $HAL_OBJECTS)

Write-Host "=== STM32F722ZE Sensor Fusion Transmit Build ===" -ForegroundColor Cyan
Write-Host "Project: $PROJECT" -ForegroundColor Yellow
Write-Host "Objects to link: $($OBJECTS.Count)" -ForegroundColor Yellow
Write-Host ""

# Step 1: Compile all .c files to .o
Write-Host "Step 1: Compiling C source files..." -ForegroundColor Green
foreach ($src in $CSOURCES) {
    $obj = $src -replace '\.c$', '.o'
    Write-Host "  Compiling: $($src.Substring($SRC_DIR.Length + 1))"
    & $CC @CFLAGS @INCLUDES -c "$src" -o "$obj" -MMD -MP 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to compile $src"
        exit 1
    }
}
Write-Host "  Done compiling C files`n" -ForegroundColor Green

# Step 2: Assemble .s file to .o
Write-Host "Step 2: Assembling startup file..." -ForegroundColor Green
foreach ($src in $ASOURCES) {
    $obj = $src -replace '\.s$', '.o'
    Write-Host "  Assembling: $($src.Substring($STARTUP_DIR.Length + 1))"
    & $AS "-mcpu=cortex-m7" "-mthumb" "-I$INC_DIR" "-I$DRIVERS_DIR/CMSIS/Include" "-I$DRIVERS_DIR/CMSIS/Device/ST/STM32F7xx/Include" -c "$src" -o "$obj" 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to assemble $src"
        exit 1
    }
}
Write-Host "  Done assembling`n" -ForegroundColor Green

# Step 3: Compile sx126x driver files
Write-Host "Step 3: Compiling SX126x driver files..." -ForegroundColor Green
foreach ($src in $SX126X_SOURCES) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($src)
    $obj = "$SX126X_OBJ_DIR/$baseName.o"
    Write-Host "  Compiling: $($src.Substring($SX126X_DIR.Length + 1))"
    & $CC @CFLAGS @INCLUDES -c "$src" -o "$obj" -MMD -MP 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to compile $src"
        exit 1
    }
}
Write-Host "  Done compiling SX126x driver files`n" -ForegroundColor Green

# Step 4: Link everything into ELF
Write-Host "Step 4: Linking..." -ForegroundColor Green
Write-Host "  Using linker script: $PROJECT/STM32F722ZETX_FLASH.ld"
$linkArgs = @(
    "-mcpu=cortex-m7"
    "-mfpu=fpv5-sp-d16"
    "-mfloat-abi=hard"
    "-mthumb"
    "-O0"
    "-g3"
    "-T$PROJECT/STM32F722ZETX_FLASH.ld"
    "-Wl,-Map,$MAP"
    "-Wl,--gc-sections"
    "-Wl,--start-group"
    "-lc"
    "-lm"
    "$PROJECT/Core/Lib/bsec/libalgobsec.a"
    "-Wl,--end-group"
    "-o$ELF"
)
# Add object files as separate arguments
foreach ($obj in $OBJECTS) { $linkArgs += $obj }

& $CC $linkArgs 2>&1 | ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Error "Linking failed"
    exit 1
}
Write-Host "  Done linking`n" -ForegroundColor Green

# Step 5: Generate hex and bin
Write-Host "Step 5: Generating output formats..." -ForegroundColor Green
& $OBJCOPY -O ihex "$ELF" "$HEX" 2>&1 | ForEach-Object { Write-Host "    $_" }
& $OBJCOPY -O binary "$ELF" "$BIN" 2>&1 | ForEach-Object { Write-Host "    $_" }
Write-Host "  Done generating output formats`n" -ForegroundColor Green

# Step 6: Show size
Write-Host "Step 6: Binary size:" -ForegroundColor Green
& $SIZE "$ELF" 2>&1 | ForEach-Object { Write-Host "    $_" }

Write-Host "" -ForegroundColor Cyan
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "ELF: $ELF" -ForegroundColor Yellow
Write-Host "HEX: $HEX" -ForegroundColor Yellow
Write-Host "BIN: $BIN" -ForegroundColor Yellow
