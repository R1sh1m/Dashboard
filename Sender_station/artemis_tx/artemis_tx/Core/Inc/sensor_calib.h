#ifndef SENSOR_CALIB_H
#define SENSOR_CALIB_H

/* BME688 offsets */
#define BME688_TEMP_OFFSET_C    -0.5f   /* BME688 typically reads high */
#define BME688_HUM_OFFSET_PCT   -2.0f   /* BME688 typically reads high */
#define BME688_PRES_OFFSET_HPA  0.0f    /* Pressure usually accurate */

/* GPS offsets */
#define GPS_TIMEZONE_OFFSET_H   0.0f

/* LD2412 Radar offsets */
#define LD2412_RANGE_OFFSET_CM  0

#endif
