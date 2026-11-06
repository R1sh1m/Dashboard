import { describe, expect, it } from 'vitest';
import { parseNmeaSentence } from './gpsParser';

describe('parseNmeaSentence', () => {
  it('parses a NEO-M8 GGA fix into dashboard GPS data', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');

    expect(gps).not.toBeNull();
    expect(gps?.lat).toBeCloseTo(48.1173, 5);
    expect(gps?.lng).toBeCloseTo(11.5166666667, 5);
    expect(gps).toMatchObject({ alt_m: 545.4, fix: 1, sats: 8, hdop: 0.9, valid: true });
  });

  it('rejects invalid checksums and unsupported sentences', () => {
    expect(parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00')).toBeNull();
    expect(parseNmeaSentence('$GPTXT,01,01,02,u-blox AG - www.u-blox.com*20')).toBeNull();
  });
});
