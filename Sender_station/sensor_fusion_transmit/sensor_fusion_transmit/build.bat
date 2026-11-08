@echo off
setlocal

REM Set up toolchain paths (STM32CubeCLT official toolchain)
if exist "C:\ST\STM32CubeCLT_1.22.0\GNU-tools-for-STM32\bin" (
    set TOOLCHAIN=C:\ST\STM32CubeCLT_1.22.0\GNU-tools-for-STM32\bin
    set MAKE=C:\ST\STM32CubeCLT_1.22.0\Make\bin
) else if exist "%TEMP%\arm-gnu-toolchain-14.2.rel1-mingw-w64-x86_64-arm-none-eabi\bin" (
    set TOOLCHAIN=%TEMP%\arm-gnu-toolchain-14.2.rel1-mingw-w64-x86_64-arm-none-eabi\bin
    set MAKE=%TEMP%\make-extract\tools\install\bin
)
if defined TOOLCHAIN set PATH=%TOOLCHAIN%;%MAKE%;%PATH%

REM Change to Debug directory (where makefile lives)
cd /d "%~dp0Debug"

REM Clean
echo Cleaning...
del /Q *.elf *.map *.list *.stdout 2>nul
for /d %%d in (..\Core\Src ..\Core\Startup ..\Drivers\STM32F7xx_HAL_Driver\Src ..\sx126x_driver\src ..\Core\Inc\bsec\config) do (
    if exist "%%d" del /Q "%%d\*.o" "%%d\*.d" 2>nul
)

REM Build
echo Building...

echo Compiling Core/Src...
for %%f in (..\Core\Src\*.c) do (
    echo Compiling %%f
    arm-none-eabi-gcc -c %%f -o "%%~dpnf.o" -I"..\Core\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc\Legacy" -I"..\Drivers\CMSIS\Include" -I"..\Drivers\CMSIS\Device\ST\STM32F7xx\Include" -I"..\sx126x_driver\src" -I"..\Core\Inc\bsec" -mcpu=cortex-m7 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -mthumb -O2 -Wall -fdata-sections -ffunction-sections -std=c99 -DUSE_HAL_DRIVER -DSTM32F722xx
)

echo Compiling bsec_config...
arm-none-eabi-gcc -c ..\Core\Inc\bsec\config\bsec_config.c -o ..\Core\Inc\bsec\config\bsec_config.o -I"..\Core\Inc" -I"..\Core\Inc\bsec" -I"..\Core\Inc\bsec\config" -mcpu=cortex-m7 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -mthumb -O2 -Wall -fdata-sections -ffunction-sections -std=c99

echo Compiling bsec_wrapper...
arm-none-eabi-gcc -c ..\Core\Src\bsec_wrapper.c -o ..\Core\Src\bsec_wrapper.o -I"..\Core\Inc" -I"..\Core\Inc\bsec" -I"..\App\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc\Legacy" -I"..\Drivers\CMSIS\Include" -I"..\Drivers\CMSIS\Device\ST\STM32F7xx\Include" -I"..\sx126x_driver\src" -mcpu=cortex-m7 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -mthumb -O2 -Wall -fdata-sections -ffunction-sections -std=c99 -DUSE_HAL_DRIVER -DSTM32F722xx

echo Compiling sx126x_driver...
for %%f in (..\sx126x_driver\src\*.c) do (
    echo Compiling %%f
    arm-none-eabi-gcc -c %%f -o "%%~dpnf.o" -I"..\Core\Inc" -I"..\App\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc\Legacy" -I"..\Drivers\CMSIS\Include" -I"..\Drivers\CMSIS\Device\ST\STM32F7xx\Include" -I"..\sx126x_driver\src" -I"..\Core\Inc\bsec" -mcpu=cortex-m7 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -mthumb -O2 -Wall -fdata-sections -ffunction-sections -std=c99 -DUSE_HAL_DRIVER -DSTM32F722xx
)

echo Compiling HAL drivers...
for %%f in (..\Drivers\STM32F7xx_HAL_Driver\Src\*.c) do (
    echo Compiling %%f
    arm-none-eabi-gcc -c %%f -o "%%~dpnf.o" -I"..\Core\Inc" -I"..\App\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc" -I"..\Drivers\STM32F7xx_HAL_Driver\Inc\Legacy" -I"..\Drivers\CMSIS\Include" -I"..\Drivers\CMSIS\Device\ST\STM32F7xx\Include" -I"..\sx126x_driver\src" -I"..\Core\Inc\bsec" -mcpu=cortex-m7 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -mthumb -O2 -Wall -fdata-sections -ffunction-sections -std=c99 -DUSE_HAL_DRIVER -DSTM32F722xx
)

echo Assembling startup...
arm-none-eabi-as ..\Core\Startup\startup_stm32f722zetx.s -o ..\Core\Startup\startup_stm32f722zetx.o

echo Linking...
arm-none-eabi-gcc -o sensor_fusion_transmit.elf ^
    ..\Core\Src\main.o ^
    ..\Core\Src\stm32f7xx_hal_msp.o ^
    ..\Core\Src\stm32f7xx_it.o ^
    ..\Core\Src\system_stm32f7xx.o ^
    ..\Core\Src\bme68x.o ^
    ..\Core\Src\bsec_wrapper.o ^
    ..\Core\Inc\bsec\config\bsec_config.o ^
    ..\Core\Src\syscalls.o ^
    ..\Core\Src\sysmem.o ^
    ..\Core\Startup\startup_stm32f722zetx.o ^
    ..\Core\Src\app.o ^
    ..\Core\Src\proto.o ^
    ..\Core\Src\lora_radio.o ^
    ..\Core\Src\sx126x_hal_stm32.o ^
    ..\Core\Src\bme688_port.o ^
    ..\Core\Src\gps_ubx.o ^
    ..\Core\Src\ld2412.o ^
    ..\Core\Src\lcd_i2c.o ^
    ..\sx126x_driver\src\sx126x.o ^
    ..\sx126x_driver\src\sx126x_driver_version.o ^
    ..\sx126x_driver\src\sx126x_bpsk.o ^
    ..\sx126x_driver\src\sx126x_lr_fhss.o ^
    ..\sx126x_driver\src\lr_fhss_mac.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_cortex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_dma.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_dma_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_exti.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_flash.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_flash_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_gpio.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_i2c.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_i2c_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_pcd.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_pcd_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_pwr.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_pwr_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_rcc.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_rcc_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_spi.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_spi_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_uart.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_hal_uart_ex.o ^
    ..\Drivers\STM32F7xx_HAL_Driver\Src\stm32f7xx_ll_usb.o ^
    -mcpu=cortex-m7 -T"..\STM32F722ZETX_FLASH.ld" --specs=nosys.specs -Wl,-Map="sensor_fusion_transmit.map" -Wl,--gc-sections -static --specs=nano.specs ..\Core\Lib\bsec\libalgobsec.a -mfpu=fpv5-sp-d16 -mfloat-abi=hard -mthumb -Wl,--start-group -lc -lm -Wl,--end-group

echo Checking size...
arm-none-eabi-size sensor_fusion_transmit.elf

echo Generating binary deliverables (.bin and .hex)...
arm-none-eabi-objcopy -O binary sensor_fusion_transmit.elf sensor_fusion_transmit.bin
arm-none-eabi-objcopy -O ihex sensor_fusion_transmit.elf sensor_fusion_transmit.hex
if not exist "..\bin" mkdir "..\bin"
copy /Y sensor_fusion_transmit.elf "..\bin\" >nul
copy /Y sensor_fusion_transmit.bin "..\bin\" >nul
copy /Y sensor_fusion_transmit.hex "..\bin\" >nul
copy /Y sensor_fusion_transmit.map "..\bin\" >nul

echo Done!
if "%1" neq "-nopause" if "%1" neq "--no-pause" pause
goto :eof
