import React, { useState } from 'react';
import { Settings } from 'lucide-react';

interface RadarSettingsProps {
  settings: {
    mov_sens: number;
    stat_sens: number;
    range_gate: number;
    blind_zone_cm: number;
    eng_mode: boolean;
  };
  onChange: (settings: RadarSettingsProps['settings']) => void;
  onApply: () => void;
  isApplying: boolean;
}

export const RadarSettings: React.FC<RadarSettingsProps> = React.memo(({ settings, onChange, onApply, isApplying }) => {
  const [local, setLocal] = useState({ ...settings });

  const handleApply = () => {
    onChange(local);
    onApply();
  };

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-3" aria-label="Radar configuration">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5 text-[#bf5af2]" aria-hidden="true" />
          LD2410B RADAR CONFIG
        </span>
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
            isApplying
              ? 'bg-white/20 text-neutral-400 cursor-not-allowed'
              : 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2'
          }`}
        >
          {isApplying ? 'Applying…' : 'Apply to Rover'}
        </button>
      </div>

      {/* Moving sensitivity */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-neutral-300">
          <span>Moving Sensitivity</span>
          <span className="font-mono">{local.mov_sens}</span>
        </div>
        <input
          type="range"
          min="1"
          max="9"
          step="1"
          value={local.mov_sens}
          onChange={(e) => setLocal({ ...local, mov_sens: parseInt(e.target.value, 10) })}
          className="w-full accent-[#0A84FF] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Stationary sensitivity */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-neutral-300">
          <span>Stationary Sensitivity</span>
          <span className="font-mono">{local.stat_sens}</span>
        </div>
        <input
          type="range"
          min="1"
          max="9"
          step="1"
          value={local.stat_sens}
          onChange={(e) => setLocal({ ...local, stat_sens: parseInt(e.target.value, 10) })}
          className="w-full accent-[#0A84FF] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Range gate */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-neutral-300">
          <span>Max Range Gate</span>
          <span className="font-mono">{local.range_gate} m</span>
        </div>
        <input
          type="range"
          min="2"
          max="8"
          step="1"
          value={local.range_gate}
          onChange={(e) => setLocal({ ...local, range_gate: parseInt(e.target.value, 10) })}
          className="w-full accent-[#0A84FF] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Blind zone */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-neutral-300">
          <span>Blind Zone</span>
          <span className="font-mono">{local.blind_zone_cm} cm</span>
        </div>
        <input
          type="range"
          min="0"
          max="255"
          step="5"
          value={local.blind_zone_cm}
          onChange={(e) => setLocal({ ...local, blind_zone_cm: parseInt(e.target.value, 10) })}
          className="w-full accent-[#0A84FF] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Engineering mode toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={local.eng_mode}
          onChange={(e) => setLocal({ ...local, eng_mode: e.target.checked })}
          className="accent-[#0A84FF] w-4 h-4 rounded bg-white/10 border border-white/10 focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        />
        <label className="text-sm text-neutral-300 cursor-pointer select-none">
          Engineering Mode (per-gate range profile)
        </label>
      </div>

      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Sensitivity 1-9 (9 = max detection, more false positives). Range gate 2-8 m
        (8 = maximum range). Blind zone 0-255 cm (0 = no blind zone). Engineering mode
        enables per-range-gate energy profile shown in the Radar card.
      </p>
    </div>
  );
});

RadarSettings.displayName = 'RadarSettings';
