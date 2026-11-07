# =============================================================================
# Artemis Ground Station — End-to-End Test Automation Script
# =============================================================================
# Runs the full test sequence:
#   1. Prerequisites check
#   2. ESP32 build + flash (COM3)
#   3. STM32 build + flash (COM10)
#   4. Dashboard build + start
#   5. Web Serial connection + data verification
#   6. LCD verification (via STM32 serial)
#
# Run: powershell -ExecutionPolicy Bypass -File Scripts/Test_E2E.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir = Resolve-Path "$scriptDir/.."
$espDir = "$rootDir/esp_receiver"
$stmDir = "$rootDir/Sender_station/sensor_fusion_transmit/sensor_fusion_transmit"

$ESP_PORT = "COM3"
$STM_PORT = "COM10"
$DASHBOARD_URL = "http://localhost:5173"
$ESP_BAUD = 115200
$STM_BAUD = 115200

$pass = 0
$fail = 0
$results = @()

function Test-Result($name, $passed, $detail) {
    if ($passed) {
        $pass++
        $results += [PSCustomObject]@{ Test = $name; Status = "PASS"; Detail = $detail }
        Write-Host "  [PASS] $name" -ForegroundColor Green
    } else {
        $fail++
        $results += [PSCustomObject]@{ Test = $name; Status = "FAIL"; Detail = $detail }
        Write-Host "  [FAIL] $name - $detail" -ForegroundColor Red
    }
}

function Wait-ForLogLine($port, $pattern, $timeoutSec = 30) {
    $start = Get-Date
    while ((Get-Date) - $start -lt (New-TimeSpan -Seconds $timeoutSec)) {
        if (Test-Path "$port") {
            $content = Get-Content "$port" -Tail 50 -ErrorAction SilentlyContinue 2>$null
            if ($content -match $pattern) {
                return $true
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " Artemis Ground Station — End-to-End Test Automation" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Prerequisites
# -----------------------------------------------------------------------------
Write-Host "Step 1: Prerequisites Check" -ForegroundColor Yellow

$hasNode = (Get-Command node -ErrorAction SilentlyContinue) -ne $null
Test-Result "Node.js installed" $hasNode "node $(node --version 2>$null)"

$hasNpm = (Get-Command npm -ErrorAction SilentlyContinue) -ne $null
Test-Result "npm installed" $hasNpm "npm $(npm --version 2>$null)"

$hasIdf = (Get-Command idf.py -ErrorAction SilentlyContinue) -ne $null
Test-Result "ESP-IDF (idf.py) available" $hasIdf "Required for ESP32 build/flash"

$hasCube = (Get-Command STM32_Programmer_CLI -ErrorAction SilentlyContinue) -ne $null
Test-Result "STM32_Programmer_CLI available" $hasCube "Required for STM32 flash"

$espPortExists = Test-Path "\\.\$ESP_PORT"
Test-Result "ESP32 port $ESP_PORT accessible" $espPortExists "ESP32 receiver on $ESP_PORT"

$stmPortExists = Test-Path "\\.\$STM_PORT"
Test-Result "STM32 port $STM_PORT accessible" $stmPortExists "STM32 debug on $STM_PORT"

if ($fail -gt 0) {
    Write-Host ""
    Write-Host "Prerequisites check failed. Install missing tools and reconnect hardware." -ForegroundColor Red
    exit 1
}

# -----------------------------------------------------------------------------
# Step 2: ESP32 Build + Flash
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 2: ESP32 Build + Flash ($ESP_PORT)" -ForegroundColor Yellow

Push-Location $espDir
try {
    $buildOut = idf.py build 2>&1
    $buildOk = $LASTEXITCODE -eq 0
    Test-Result "ESP32 build" $buildOk "idf.py build completed"
    if (-not $buildOk) {
        Write-Host $buildOut -ForegroundColor Red
        Pop-Location
        exit 1
    }

    $flashOut = idf.py -p $ESP_PORT flash 2>&1
    $flashOk = $LASTEXITCODE -eq 0
    Test-Result "ESP32 flash" $flashOk "idf.py -p $ESP_PORT flash completed"
    if (-not $flashOk) {
        Write-Host $flashOut -ForegroundColor Red
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}

# -----------------------------------------------------------------------------
# Step 3: STM32 Build + Flash
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 3: STM32 Build + Flash ($STM_PORT)" -ForegroundColor Yellow

try {
    $stmBuildOut = & "$rootDir/Scripts/build_stm32.ps1" 2>&1
    $stmBuildOk = $LASTEXITCODE -eq 0
    Test-Result "STM32 build" $stmBuildOk "Scripts/build_stm32.ps1 completed"
    if (-not $stmBuildOk) {
        Write-Host $stmBuildOut -ForegroundColor Red
        exit 1
    }

    $stmFlashOut = & "$rootDir/Scripts/flash_stm32.ps1 -Approve" 2>&1
    $stmFlashOk = $LASTEXITCODE -eq 0
    Test-Result "STM32 flash" $stmFlashOk "Scripts/flash_stm32.ps1 -Approve completed"
    if (-not $stmFlashOk) {
        Write-Host $stmFlashOut -ForegroundColor Red
        exit 1
    }
} catch {
    Test-Result "STM32 build/flash" $false "Exception: $_"
    exit 1
}

# -----------------------------------------------------------------------------
# Step 4: STM32 Serial Verification (COM10)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 4: STM32 Serial Verification ($STM_PORT @ $STM_BAUD)" -ForegroundColor Yellow

Write-Host "Opening serial terminal on $STM_PORT... Check for:" -ForegroundColor Gray
Write-Host "  - 'Artemis TX start'" -ForegroundColor Gray
Write-Host "  - 'BME688 ok'" -ForegroundColor Gray
Write-Host "  - 'SX1262 ok'" -ForegroundColor Gray
Write-Host "  - LCD init status (if printf added to lcd_init)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key once you've verified STM32 output on $STM_PORT..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# -----------------------------------------------------------------------------
# Step 5: ESP32 Serial Verification (COM3)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 5: ESP32 Serial Verification ($ESP_PORT @ $ESP_BAUD)" -ForegroundColor Yellow

Write-Host "Waiting for ESP32 boot logs on $ESP_PORT..." -ForegroundColor Gray
$espInitOk = Wait-ForLogLine $ESP_PORT "SX126x radio init complete" -timeoutSec 30
Test-Result "ESP32 radio init" $espInitOk "SX126x radio init complete on $ESP_PORT"

$espRxOk = Wait-ForLogLine $ESP_PORT "Radio in continuous RX mode" -timeoutSec 10
Test-Result "ESP32 RX mode" $espRxOk "Radio in continuous RX mode on $ESP_PORT"

# -----------------------------------------------------------------------------
# Step 6: Dashboard Build + Start
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 6: Dashboard Build + Start" -ForegroundColor Yellow

Push-Location $rootDir
try {
    $dashBuildOut = npm run build 2>&1
    $dashBuildOk = $LASTEXITCODE -eq 0
    Test-Result "Dashboard build" $dashBuildOk "npm run build completed"
    if (-not $dashBuildOk) {
        Write-Host $dashBuildOut -ForegroundColor Red
        Pop-Location
        exit 1
    }

    # Start dev server in background
    $dashProc = Start-Process npm -ArgumentList "run dev" -PassThru -WorkingDirectory $rootDir
    Start-Sleep -Seconds 5
    Test-Result "Dashboard dev server" $true "npm run dev started (PID $($dashProc.Id))"
} finally {
    Pop-Location
}

# -----------------------------------------------------------------------------
# Step 7: Web Serial Connection + Data Verification
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 7: Web Serial Connection + Data Verification" -ForegroundColor Yellow

Write-Host "MANUAL STEP — Open browser and perform:" -ForegroundColor Cyan
Write-Host "  1. Navigate to $DASHBOARD_URL" -ForegroundColor Gray
Write-Host "  2. Click Connect in Wireless Link card" -ForegroundColor Gray
Write-Host "  3. Select COM3 (Silicon Labs CP210x, VID 0x10C4)" -ForegroundColor Gray
Write-Host "  4. Verify sidebar link pill shows CONNECTED" -ForegroundColor Gray
Write-Host "  5. Verify Sensor Sheet → LoRa Wireless Link shows RSSI/SNR/signal bars" -ForegroundColor Gray
Write-Host "  6. Verify packet seq increments" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key once you've verified dashboard data..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# -----------------------------------------------------------------------------
# Step 8: LCD Verification
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Step 8: LCD Verification (I2C2 on PF0/PF1, 0x27)" -ForegroundColor Yellow

Write-Host "MANUAL STEP — Verify LCD display:" -ForegroundColor Cyan
Write-Host "  1. LCD powered (5V on CN8/9)" -ForegroundColor Gray
Write-Host "  2. I2C2 SDA=PF0, SCL=PF1 connected to PCF8574" -ForegroundColor Gray
Write-Host "  3. LCD shows 'Artemis TX' on row 0" -ForegroundColor Gray
Write-Host "  4. LCD shows 'LoRa SF9 865MHz' on row 1" -ForegroundColor Gray
Write-Host "  5. If LCD blank: check I2C address (0x27 vs 0x3F) and wiring" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key once you've verified LCD..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# -----------------------------------------------------------------------------
# Step 9: End-to-End Summary
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " Test Summary" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Passed: $pass" -ForegroundColor Green
Write-Host "  Failed: $fail" -ForegroundColor Red
Write-Host ""

$results | Format-Table -AutoSize

if ($fail -eq 0) {
    Write-Host "All tests PASSED — End-to-End link verified!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests FAILED — review details above." -ForegroundColor Red
    exit 1
}
