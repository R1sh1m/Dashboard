import React from 'react';
import { Crosshair, LocateFixed, MapPinned, Satellite } from 'lucide-react';
import type { GpsData } from '../types/telemetry';

export type MapControlMode = 'sensor' | 'manual';

interface GpsCardProps {
  gps: GpsData | null;
  mode: MapControlMode;
  onModeChange: (mode: MapControlMode) => void;
}

const formatCoordinate = (value: number | undefined) => (
  value === undefined ? '--.------' : value.toFixed(6)
);

export const GpsCard: React.FC<GpsCardProps> = ({ gps, mode, onModeChange }) => {
  const fixLabel = gps?.valid ? `${gps.fix}D FIX` : 'NO FIX';
  const signalColor = gps?.valid ? '#30d158' : '#ff9f0a';

  return (
    <div className="glass-panel gps-panel p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Satellite className="w-3.5 h-3.5" style={{ color: signalColor }} aria-hidden="true" />
          GPS NEO-M8
        </span>
        <span className="wireless-signal-label" style={{ color: signalColor }}>
          {fixLabel}
        </span>
      </div>

      <div className="gps-coordinate-grid" aria-live="polite">
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">LATITUDE</span>
          <strong className="gps-coordinate-value">{formatCoordinate(gps?.lat)}</strong>
        </div>
        <div className="glass-panel-subtle p-2 flex flex-col">
          <span className="text-sm text-neutral-300">LONGITUDE</span>
          <strong className="gps-coordinate-value">{formatCoordinate(gps?.lng)}</strong>
        </div>
      </div>

      <div className="gps-detail-row">
        <span>ALT {gps?.alt_m.toFixed(1) ?? '--'} m</span>
        <span>SATS {gps?.sats ?? '--'}</span>
        <span>HDOP {gps?.hdop.toFixed(1) ?? '--'}</span>
        <span>{gps ? `${gps.speed_mps.toFixed(2)} m/s` : '-- m/s'}</span>
      </div>

      <div className="gps-mode-control" role="group" aria-label="Map movement mode">
        <button
          type="button"
          className={`gps-mode-button${mode === 'sensor' ? ' is-selected' : ''}`}
          onClick={() => onModeChange('sensor')}
          aria-pressed={mode === 'sensor'}
          title="Follow the NEO-M8 GPS position"
        >
          <LocateFixed size={14} aria-hidden="true" />
          <span>GPS follow</span>
        </button>
        <button
          type="button"
          className={`gps-mode-button${mode === 'manual' ? ' is-selected' : ''}`}
          onClick={() => onModeChange('manual')}
          aria-pressed={mode === 'manual'}
          title="Pan and zoom the map manually"
        >
          <Crosshair size={14} aria-hidden="true" />
          <span>Manual map</span>
        </button>
      </div>

      <div className="gps-source-note">
        <MapPinned size={12} aria-hidden="true" />
        <span>Coordinates refresh with the incoming NEO-M8 stream</span>
      </div>
    </div>
  );
};
