import type { GpsData } from '../types/telemetry';

const knotsToMetersPerSecond = (knots: number) => knots * 0.514444;

const parseCoordinate = (value: string, hemisphere: string): number | null => {
  if (!value || !hemisphere) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const degrees = Math.floor(numeric / 100);
  const minutes = numeric - degrees * 100;
  const coordinate = degrees + minutes / 60;
  return ['S', 'W'].includes(hemisphere) ? -coordinate : coordinate;
};

const checksumIsValid = (sentence: string): boolean => {
  const checksumIndex = sentence.indexOf('*');
  if (checksumIndex < 0) return true;
  const expected = Number.parseInt(sentence.slice(checksumIndex + 1, checksumIndex + 3), 16);
  if (!Number.isFinite(expected)) return false;
  const payload = sentence.slice(1, checksumIndex);
  const actual = [...payload].reduce((checksum, character) => checksum ^ character.charCodeAt(0), 0);
  return actual === expected;
};

export const parseNmeaSentence = (sentence: string): GpsData | null => {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith('$') || !checksumIsValid(trimmed)) return null;

  const fields = trimmed.slice(1, trimmed.indexOf('*') >= 0 ? trimmed.indexOf('*') : undefined).split(',');
  const messageType = fields[0]?.slice(-3);
  const isGga = messageType === 'GGA';
  const isRmc = messageType === 'RMC';
  if (!isGga && !isRmc) return null;

  const latitude = parseCoordinate(fields[isGga ? 2 : 3] ?? '', fields[isGga ? 3 : 4] ?? '');
  const longitude = parseCoordinate(fields[isGga ? 4 : 5] ?? '', fields[isGga ? 5 : 6] ?? '');
  if (latitude === null || longitude === null) return null;

  const fix = isGga ? Number(fields[6] ?? 0) : fields[2] === 'A' ? 1 : 0;
  const satellites = isGga ? Number(fields[7] ?? 0) : 0;
  const hdop = isGga ? Number(fields[8] ?? 99) : 99;
  const altitude = isGga ? Number(fields[9] ?? 0) : 0;
  const speed = isRmc ? knotsToMetersPerSecond(Number(fields[7] ?? 0)) : 0;
  const heading = isRmc ? Number(fields[8] ?? 0) : undefined;

  return {
    lat: latitude,
    lng: longitude,
    alt_m: Number.isFinite(altitude) ? altitude : 0,
    fix,
    sats: Number.isFinite(satellites) ? satellites : 0,
    speed_mps: Number.isFinite(speed) ? speed : 0,
    hdop: Number.isFinite(hdop) ? hdop : 99,
    valid: fix > 0,
    ...(heading !== undefined && Number.isFinite(heading) ? { heading_deg: heading } : {}),
  };
};
