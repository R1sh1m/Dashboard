# STM32 Flash Script (PowerShell)
# Usage: .\Scripts\flash_stm32.ps1 [-Approve]
# Requires: STM32CubeProgrammer CLI or STM32CubeCLI

param(
    [switch]$Approve
)

$ErrorActionPreference = "Stop"

$elfFile = "C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard\Sender_station\sensor_fusion_transmit\sensor_fusion_transmit\Build\sensor_fusion_transmit.elf"

Write-Host "=== STM32 Flash Script ===" -ForegroundColor Cyan

# Safety check: flash is destructive
if (!$Approve) {
    Write-Host "WARNING: Flashing will erase and overwrite device memory." -ForegroundColor Yellow
    Write-Host "Re-run with -Approve to confirm: .\Scripts\flash_stm32.ps1 -Approve" -ForegroundColor Yellow
    exit 0
}

# Check ELF exists
if (!(Test-Path $elfFile)) {
    Write-Host "ERROR: ELF file not found: $elfFile" -ForegroundColor Red
    Write-Host "Run build first: .\Scripts\build_stm32.ps1" -ForegroundColor Yellow
    exit 1
}

# Try STM32CubeProgrammer CLI first
$programmer = Get-Command "STM32_Programmer_CLI" -ErrorAction SilentlyContinue
if ($programmer) {
    Write-Host "Flashing via STM32CubeProgrammer CLI..." -ForegroundColor Cyan
    STM32_Programmer_CLI -c port=SWD -w $elfFile -v -rst
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Flash succeeded." -ForegroundColor Green
    } else {
        Write-Host "Flash failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    exit 0
}

# Fallback to STM32CubeCLI
$cube = Get-Command "cube" -ErrorAction SilentlyContinue
if ($cube) {
    Write-Host "Flashing via STM32CubeCLI..." -ForegroundColor Cyan
    cube program --file $elfFile --connect-mode swd --frequency 1000
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Flash succeeded." -ForegroundColor Green
    } else {
        Write-Host "Flash failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    exit 0
}

Write-Host "ERROR: Neither STM32_Programmer_CLI nor cube found on PATH." -ForegroundColor Red
exit 1
