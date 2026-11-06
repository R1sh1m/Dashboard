# Sensor Calibration Guide — STM32 Sender

## Overview

Sensor calibration ensures accurate telemetry before LoRa transmission. Calibration offsets are applied in each driver's read function before data enters the priority queue.

## Calibration Files

| Sensor | Driver File | Calibration Header |
|--------|-------------|-------------------|
| BME688 | `Core/Src/bme688_port.c` | `Core/Inc/sensor_calib.h` |
| NEO-M8N GPS | `Core/Src/gps_ubx.c` | `Core/Inc/sensor_calib.h` |
| LD2412 Radar | `Core/Src/ld2412.c` | `Core/Inc/sensor_calib.h` |

## 1. Create Calibration Header

Create `Sender_station/sensor_fusion_transmit/sensor_fusion_transmit/Core/Inc/sensor_calib.h`:

```c
#ifndef SENSOR_CALIB_H
#define SENSOR_CALIB_H

/* BME688 offsets — adjust after reference comparison */
#define BME688_TEMP_OFFSET_C    0.0f   /* Add to raw temperature */
#define BME688_HUM_OFFSET_PCT   0.0f   /* Add to raw humidity % */
#define BME688_PRES_OFFSET_HPA  0.0f   /* Add to raw pressure hPa */

/* GPS offsets */
#define GPS_TIMEZONE_OFFSET_H   0.0f   /* Hours from UTC */

/* LD2412 Radar offsets */
#define LD2412_RANGE_OFFSET_CM  0      /* Add to raw distance cm */

#endif
```

## 2. BME688 Calibration

**Reference comparison:** Place a calibrated thermometer/hygrometer/barometer next to the BME688. Record readings over 10 minutes, compute average difference.

**Apply in `bme688_port.c`:**

```c
#include "sensor_calib.h"

// After reading raw values:
float temp_c = raw_temperature + BME688_TEMP_OFFSET_C;
float hum_pct = raw_humidity + BME688_HUM_OFFSET_PCT;
float pres_hpa = raw_pressure + BME688_PRES_OFFSET_HPA;
```

**Burn-in:** Run the BME688 for 48 hours before gas (IAQ) calibration. Use the Bosch BSEC library for baseline compensation if available.

## 3. GPS Calibration

**Position:** Compare against a known survey point. Record the offset (lat/lon in e7 degrees, alt in cm).

**Time:** GPS time is UTC. Apply `GPS_TIMEZONE_OFFSET_H` for local time.

**Fix quality:** Only use data when `fixType >= 2` (2D or 3D fix). Check `gps_data_t.fix` in `gps_ubx.c`.

## 4. LD2412 Radar Calibration

**Range:** Place a target at known distances (1m, 2m, 5m). Record measured vs. actual. Apply `LD2412_RANGE_OFFSET_CM`.

**Sensitivity:** Adjust detection threshold in `ld2412.c` based on environment (indoor vs. outdoor, interference).

**State verification:** Confirm `state` transitions: 0=none, 1=moving, 2=stationary, 3=both.

## 5. Calibration Log Template

| Sensor | Parameter | Reference Value | Measured Value | Offset | Date |
|--------|-----------|-----------------|----------------|--------|------|
| BME688 | Temperature | 22.5°C | 23.1°C | -0.6°C | 2026-11-06 |
| BME688 | Humidity | 45% | 47% | -2% | 2026-11-06 |
| GPS | Latitude | 12.345678 | 12.345690 | -12e-7 | 2026-11-06 |
| Radar | Range | 200 cm | 205 cm | -5 cm | 2026-11-06 |

## 6. Verification

After applying calibration:
1. Rebuild and flash STM32
2. Monitor ST-LINK COM at 115200 baud
3. Confirm calibrated values appear in telemetry packets
4. Compare dashboard display against reference instruments
