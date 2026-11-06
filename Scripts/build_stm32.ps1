# STM32 Build Script (PowerShell)

# Usage: .\Scripts\build_stm32.ps1
# Requires: STM32CubeCLI installed and `cube` on PATH

$ErrorActionPreference = "Stop"

$projectDir = "C:\Users\Rishi Misra\Desktop\Study Folder\Team Artemis (2026-27)\Dashboard\Sender_station\sensor_fusion_transmit\sensor_fusion_transmit"
$buildDir = Join-Path $projectDir "Build"

Write-Host "=== STM32 Build Script ===" -ForegroundColor Cyan
Write-Host "Project: $projectDir" -ForegroundColor Gray

# Check cube CLI
if (!(Get-Command cube -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'cube' (STM32CubeCLI) not found on PATH." -ForegroundColor Red
    Write-Host "Install from: https://www.st.com/en/development-tools/stm32cubecli.html" -ForegroundColor Yellow
    exit 1
}

# Clean previous build
if (Test-Path $buildDir) {
    Write-Host "Cleaning previous build..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $buildDir
}

# Build
Write-Host "Building firmware..." -ForegroundColor Cyan
cube build --project $projectDir --toolchain gcc

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build succeeded." -ForegroundColor Green
    Get-ChildItem $buildDir -Filter *.elf | Select-Object Name, Length
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit $LASTEXITCODE
}
