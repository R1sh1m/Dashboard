import React, { useState } from 'react';
import type { PoiCategory, PointOfInterest } from '../types/telemetry';
import { MapPin, User, Droplets, Target, Plus, X, Trash2 } from 'lucide-react';

interface PoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  onSavePoi: (poi: PointOfInterest) => void;
  onDeletePoi: (poiId: string) => void;
  pois: PointOfInterest[];
  onSelectPoi: (poi: PointOfInterest) => void;
  onCategoryChange: (category: PoiCategory) => void;
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
  onDeletePoi,
  pois,
  onSelectPoi,
  onCategoryChange,
}) => {
  const [category, setCategory] = useState<PoiCategory>('MANUAL_MARK');
  const [title, setTitle] = useState('');

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
      timestamp: Date.now(),
    };

    onSavePoi(newPoi);
    setTitle('');
    onClose();
  };

  return (
      <div
        className={`poi-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-label="Mark Point of Interest"
      >
        <div className="sheet-header poi-sheet-header">
          <span className="sheet-title">Mark Point of Interest</span>
          <div className="poi-header-actions">
            <button
              type="button"
              onClick={onClose}
              className="poi-header-action poi-cancel-action"
              aria-label="Cancel marking point of interest"
              title="Cancel"
            >
              <X size={15} aria-hidden="true" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              form="poi-form"
              className="poi-header-action poi-add-action"
              aria-label="Add marker"
              title="Add marker"
            >
              <Plus size={15} aria-hidden="true" />
              <span>Add Marker</span>
            </button>
          </div>
        </div>

        <div className="sheet-body poi-sheet-body overflow-y-auto p-4">
          <form id="poi-form" onSubmit={handleSubmit} className="poi-form">
            {/* Category selection pills */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-neutral-300 uppercase tracking-wider">
                Marker Category
              </label>
              <div className="poi-category-grid">
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      const nextCategory = key as PoiCategory;
                      setCategory(nextCategory);
                      onCategoryChange(nextCategory);
                    }}
                    className={`poi-category min-hit-target ${category === key ? 'is-selected' : ''}`}
                    style={{ '--poi-category-color': config.color } as React.CSSProperties}
                    aria-pressed={category === key}
                    aria-label={`Select ${config.label} category`}
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
                    <div className="poi-list-item" key={poi.id}>
                      <button
                        type="button"
                        className="poi-list-select"
                        onClick={() => onSelectPoi(poi)}
                        aria-label={`Show ${poi.title} on map`}
                      >
                        <span className="poi-list-icon" style={{ color: config.color }}>{config.icon}</span>
                        <span className="poi-list-copy">
                          <strong>{poi.title}</strong>
                          <small>{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}</small>
                        </span>
                        <span className="poi-list-arrow" aria-hidden="true">›</span>
                      </button>
                      <button
                        type="button"
                        className="poi-delete-button"
                        onClick={() => onDeletePoi(poi.id)}
                        aria-label={`Delete ${poi.title}`}
                        title="Delete marked point"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
  );
};
