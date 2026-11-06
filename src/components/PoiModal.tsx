import React, { useState } from 'react';
import type { PoiCategory, PointOfInterest } from '../types/telemetry';
import { MapPin, User, Droplets, Target } from 'lucide-react';

interface PoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  onSavePoi: (poi: PointOfInterest) => void;
  pois: PointOfInterest[];
  onSelectPoi: (poi: PointOfInterest) => void;
}

const CATEGORY_CONFIG: Record<PoiCategory, { label: string; icon: React.ReactNode; color: string }> = {
  HUMAN_RADAR: { label: 'Human Presence', icon: <User className="w-5 h-5" />, color: '#FF453A' },
  ENV_ANOMALY: { label: 'Gas Spike', icon: <Droplets className="w-5 h-5" />, color: '#FFD60A' },
  MANUAL_MARK: { label: 'Manual Mark', icon: <Target className="w-5 h-5" />, color: '#30D158' },
  BASE_HOME: { label: 'Home Base', icon: <MapPin className="w-5 h-5" />, color: '#0A84FF' },
};

export const PoiModal: React.FC<PoiModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  onSavePoi,
  pois,
  onSelectPoi,
}) => {
  const [category, setCategory] = useState<PoiCategory>('MANUAL_MARK');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newPoi: PointOfInterest = {
      id: `poi_${Date.now()}`,
      category,
      lat: currentLat,
      lng: currentLng,
      title: title.trim(),
      notes: notes.trim(),
      timestamp: Date.now(),
    };

    onSavePoi(newPoi);
    setTitle('');
    setNotes('');
    onClose();
  };

  return (
      <div
        className={`poi-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-label="Mark Point of Interest"
      >
        <div className="sheet-header">
          <span className="sheet-title">Mark Point of Interest</span>
        </div>

        <div className="sheet-body overflow-y-auto p-4 space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Category pills — Apple Maps style */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-neutral-300 uppercase tracking-wider">
                Marker Category
              </label>
              <div className="poi-category-grid">
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key as PoiCategory)}
                    className={`poi-category min-hit-target ${
                      category === key
                        ? `bg-[${config.color}]/20 border-[${config.color}] text-[${config.color}]`
                        : 'bg-white/5 border-white/10 text-neutral-300'
                    }`}
                  >
                    {config.icon}
                    <span>{config.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* GPS coordinates */}
            <div className="text-sm font-mono text-neutral-300 bg-black/30 p-2 rounded-lg border border-white/5">
              Latching GPS: {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-300">POI Label / Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Biological presence / Gas spike"
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-lg text-white focus:outline-none focus:border-[#0A84FF]"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-300">Notes (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observation notes, terrain details..."
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-lg text-white focus:outline-none focus:border-[#0A84FF] resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-hit-target btn-apple-secondary text-lg py-2 px-6"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-hit-target btn-apple-primary text-lg py-2 px-6"
              >
                Add Marker
              </button>
            </div>
          </form>

          <section className="poi-list-section" aria-labelledby="poi-list-title">
            <h2 id="poi-list-title">Marked points</h2>
            {pois.length === 0 ? (
              <p className="poi-empty">No points marked yet.</p>
            ) : (
              <div className="poi-list">
                {[...pois].reverse().map((poi) => {
                  const config = CATEGORY_CONFIG[poi.category];
                  return (
                    <button className="poi-list-item" key={poi.id} onClick={() => onSelectPoi(poi)}>
                      <span className="poi-list-icon" style={{ color: config.color }}>{config.icon}</span>
                      <span className="poi-list-copy">
                        <strong>{poi.title}</strong>
                        <small>{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}</small>
                      </span>
                      <span className="poi-list-arrow" aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
  );
};
