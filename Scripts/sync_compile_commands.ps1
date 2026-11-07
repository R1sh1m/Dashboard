# sync_compile_commands.ps1
#
# Mirrors the ESP-IDF build-generated compile_commands.json to the workspace
# root so clangd / ccls can auto-discover exact per-file compiler include
# paths for the esp_receiver (ESP-IDF v6.1, xtensa-esp32) target.
#
# Why: clangd reports `sys/features.h` not found (pp_file_not_found) in
# ground_bridge.c when it lacks the xtensa toolchain libc include paths.
# compile_commands.json contains the exact -I flags the real compiler used,
# so pointing clangd at it is the durable fix — no hardcoded local paths.
#
# Usage (run after every esp_idf build / clean rebuild):
#   pwsh -File Scripts/sync_compile_commands.ps1
#
# Prerequisites:
#   - esp_receiver has been built at least once (build/ exists)
#   - Run from the Dashboard workspace root

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir   = Split-Path -Parent $scriptDir          # Dashboard root
$src       = Join-Path $rootDir "esp_receiver/build/compile_commands.json"
$dst       = Join-Path $rootDir "compile_commands.json"

if (-not (Test-Path $src)) {
    Write-Error "Source compile_commands.json not found: $src`nBuild esp_receiver first (esp-idf.esp_build)."
    exit 1
}

Copy-Item -Path $src -Destination $dst -Force
Write-Host "Synced compile_commands.json -> $dst"
Write-Host "clangd will auto-discover it on the next index (reload VS Code window)."
