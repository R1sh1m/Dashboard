import { describe, expect, it } from 'vitest';
import { parseNmeaSentence } from './gpsParser';

describe('parseNmeaSentence', () => {
  it('parses a NEO-M8 GGA fix into dashboard GPS data', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');

    expect(gps).not.toBeNull();
    expect(gps?.lat).toBeCloseTo(48.1173, 5);
    expect(gps?.lng).toBeCloseTo(11.5166666667, 5);
    expect(gps).toMatchObject({ alt_m: 545.4, fix: 2, sats: 8, hdop: 0.9, valid: true });
  });

  it('parses a GGA sentence without a checksum', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,');
    expect(gps).not.toBeNull();
    expect(gps?.valid).toBe(true);
  });

  it('parses a NEO-M8 RMC sentence with speed and heading', () => {
    const gps = parseNmeaSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,0.0,0.0,130706,,');
    expect(gps).not.toBeNull();
    expect(gps?.lat).toBeCloseTo(48.1173, 5);
    expect(gps?.lng).toBeCloseTo(11.5166666667, 5);
    expect(gps?.fix).toBe(2);
    expect(gps?.speed_mps).toBeCloseTo(0, 5);
    expect(gps?.heading_deg).toBeCloseTo(0, 5);
    expect(gps?.valid).toBe(true);
  });

  it('converts RMC speed from knots to meters per second', () => {
    // 10 knots = 5.14444 m/s
    const gps = parseNmeaSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,10.0,0.0,130706,,');
    expect(gps).not.toBeNull();
    expect(gps?.speed_mps).toBeCloseTo(5.14444, 4);
  });

  it('includes heading_deg from an RMC track angle', () => {
    // 90.0 degrees track
    const gps = parseNmeaSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,0.0,90.0,130706,,');
    expect(gps).not.toBeNull();
    expect(gps?.heading_deg).toBeCloseTo(90, 5);
  });

  it('parses Southern and Western hemisphere coordinates as negative', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,S,01131.000,W,1,08,0.9,545.4,M,46.9,M,,');
    expect(gps).not.toBeNull();
    expect(gps?.lat).toBeCloseTo(-48.1173, 5);
    expect(gps?.lng).toBeCloseTo(-11.5166666667, 5);
  });

  it('rejects sentences with no GPS fix as invalid', () => {
    // fixType 0 = no fix
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,0,08,0.9,545.4,M,46.9,M,,');
    expect(gps).not.toBeNull();
    expect(gps?.fix).toBe(0);
    expect(gps?.valid).toBe(false);
  });

  it('rejects RMC void status as invalid', () => {
    // V = void (invalid)
    const gps = parseNmeaSentence('$GPRMC,123519,V,4807.038,N,01131.000,E,0.0,0.0,130706,,');
    expect(gps).not.toBeNull();
    expect(gps?.fix).toBe(0);
    expect(gps?.valid).toBe(false);
  });

  it('rejects invalid checksums', () => {
    expect(parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00')).toBeNull();
  });

  it('rejects malformed checksum fields', () => {
    expect(parseNmeaSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*4')).toBeNull();
  });

  it('rejects coordinates with invalid minute fields', () => {
    expect(parseNmeaSentence('$GPGGA,123519,4860.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')).toBeNull();
  });

  it('rejects unsupported sentence types', () => {
    expect(parseNmeaSentence('$GPTXT,01,01,02,u-blox AG - www.u-blox.com*20')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseNmeaSentence('')).toBeNull();
    expect(parseNmeaSentence('   ')).toBeNull();
  });

  it('returns null for input without dollar prefix', () => {
    expect(parseNmeaSentence('GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')).toBeNull();
  });

  it('returns null for incomplete GGA missing coordinates', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,,N,,E,1,08,0.9,545.4,M,46.9,M,,');
    expect(gps).toBeNull();
  });

  it('returns null for truncated sentences', () => {
    const gps = parseNmeaSentence('$GPGGA,123519,4807.038,N');
    expect(gps).toBeNull();
  });
});
