import React from 'react';
import { MapPin, Layers, Search } from 'lucide-react';

interface HeaderProps {
  onOpenMarkPoi: () => void;
  onToggleLayer: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMarkPoi, onToggleLayer }) => {
  return (
    <header
      className="glass-header fixed top-0 left-[260px] right-0 h-12 border-b border-white/10"
      style={{ zIndex: 55 }}
    >
      {/* Left: small robot context pill */}
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-full bg-[#30d158] animate-pulse" />
        <span className="text-[11px] font-medium text-neutral-300">ROBOT ONLINE</span>
      </div>

      {/* Center: Search pill */}
      <div className="search-pill flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-neutral-500" />
        <span>Search Maps</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLayer}
          className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Map layer"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onOpenMarkPoi}
          className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
          title="Mark Point of Interest"
        >
          <MapPin className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
