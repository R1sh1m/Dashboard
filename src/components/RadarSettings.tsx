import React, { useState } from 'react';
import { Settings, ChevronDown } from 'lucide-react';

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(local);
    onApply();
  };

  return (
    <div className="glass-panel p-3.5 flex flex-col gap-3" aria-label="Radar configuration">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 text-left text-neutral-300 hover:text-white transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] rounded-md py-0.5 px-1 -ml-1 flex-1 min-w-0"
          aria-expanded={!isCollapsed}
          aria-controls="radar-config-content"
          title={isCollapsed ? 'Expand radar configuration' : 'Collapse radar configuration'}
        >
          <ChevronDown
            className={`w-4 h-4 text-[#bf5af2] shrink-0 transition-transform duration-200 ${
              isCollapsed ? '-rotate-90' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
          <Settings className="w-3.5 h-3.5 text-[#bf5af2] shrink-0" aria-hidden="true" />
          <span className="text-base font-semibold tracking-wider uppercase truncate">
            LD2410B RADAR CONFIG
          </span>
          {isCollapsed && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-400 shrink-0 hidden sm:inline-block">
              {local.mov_sens}/{local.stat_sens} · {local.range_gate}m
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shrink-0 select-none ${
            isApplying
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:brightness-110 active:scale-95 cursor-pointer'
          }`}
          style={{
            backgroundColor: '#0A84FF',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 2px 8px rgba(10, 132, 255, 0.4)',
          }}
          aria-label="Apply radar configuration"
        >
          {isApplying ? 'Applying…' : 'Apply'}
        </button>
      </div>

      {!isCollapsed && (
        <div id="radar-config-content" className="flex flex-col gap-3 pt-1">
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
              id="radar-eng-mode"
              checked={local.eng_mode}
              onChange={(e) => setLocal({ ...local, eng_mode: e.target.checked })}
              className="accent-[#0A84FF] w-4 h-4 rounded bg-white/10 border border-white/10 focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
            />
            <label htmlFor="radar-eng-mode" className="text-sm text-neutral-300 cursor-pointer select-none">
              Engineering Mode (per-gate range profile)
            </label>
          </div>

          <p className="text-[10px] text-neutral-500 leading-relaxed">
            Sensitivity 1-9 (9 = max detection, more false positives). Range gate 2-8 m
            (8 = maximum range). Blind zone 0-255 cm (0 = no blind zone). Engineering mode
            enables per-range-gate energy profile shown in the Radar card.
          </p>
        </div>
      )}
    </div>
  );
});

RadarSettings.displayName = 'RadarSettings';
