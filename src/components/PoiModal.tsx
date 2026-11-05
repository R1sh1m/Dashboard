import React, { useState } from 'react';
import type { PoiCategory, PointOfInterest } from '../types/telemetry';
import { X, MapPin } from 'lucide-react';

interface PoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  onSavePoi: (poi: PointOfInterest) => void;
}

export const PoiModal: React.FC<PoiModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  onSavePoi,
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-sm p-4 flex flex-col gap-3 shadow-2xl border border-white/20">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[13px] font-semibold text-white flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#30d158]" />
            Mark Point of Interest (POI)
          </span>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-neutral-400">Marker Category</label>
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setCategory('HUMAN_RADAR')}
                className={`py-1.5 px-2 rounded-lg border text-center font-medium transition-all ${
                  category === 'HUMAN_RADAR'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-white/5 border-white/10 text-neutral-400'
                }`}
              >
                Human (Red)
              </button>
              <button
                type="button"
                onClick={() => setCategory('ENV_ANOMALY')}
                className={`py-1.5 px-2 rounded-lg border text-center font-medium transition-all ${
                  category === 'ENV_ANOMALY'
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                    : 'bg-white/5 border-white/10 text-neutral-400'
                }`}
              >
                Gas (Yellow)
              </button>
              <button
                type="button"
                onClick={() => setCategory('MANUAL_MARK')}
                className={`py-1.5 px-2 rounded-lg border text-center font-medium transition-all ${
                  category === 'MANUAL_MARK'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-white/5 border-white/10 text-neutral-400'
                }`}
              >
                Misc (Green)
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-neutral-400 bg-black/30 p-2 rounded-lg border border-white/5">
            Latching GPS: {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-neutral-400">POI Label / Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Biological presence / Gas spike"
              className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-neutral-400">Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observation notes, terrain details..."
              className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-apple-secondary text-[12px] py-1 px-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-apple-primary text-[12px] py-1 px-3"
            >
              Add Marker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
