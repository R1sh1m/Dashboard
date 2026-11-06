import React, { useRef, useEffect } from 'react';
import type { LogEntry, LogLevel } from '../types/telemetry';
import { Download, Search, Trash2 } from 'lucide-react';

interface LogTerminalProps {
  logs: LogEntry[];
  filterLevel: LogLevel | 'ALL';
  setFilterLevel: (level: LogLevel | 'ALL') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  autoScroll: boolean;
}

export interface LogControlsProps {
  autoScroll: boolean;
  setAutoScroll: (enabled: boolean) => void;
  onExport: () => void;
  onClear: () => void;
}

export const LogControls: React.FC<LogControlsProps> = ({
  autoScroll,
  setAutoScroll,
  onExport,
  onClear,
}) => (
  <div className="log-terminal-actions">
    <button
      onClick={() => setAutoScroll(!autoScroll)}
      className={`log-action-button ${autoScroll ? 'is-active' : ''}`}
      aria-pressed={autoScroll}
      aria-label={autoScroll ? 'Unlock auto-scroll' : 'Lock auto-scroll'}
      title="Auto-scroll lock"
    >
      <span aria-hidden="true">↓</span>
    </button>
    <button onClick={onExport} className="log-action-button" aria-label="Export logs as JSON" title="Export logs as JSON">
      <Download size={15} aria-hidden="true" />
    </button>
    <button onClick={onClear} className="log-action-button is-destructive" aria-label="Clear all logs" title="Clear all logs">
      <Trash2 size={15} aria-hidden="true" />
    </button>
  </div>
);

export const LogTerminal: React.FC<LogTerminalProps> = ({
  logs,
  filterLevel,
  setFilterLevel,
  searchQuery,
  setSearchQuery,
  autoScroll,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((entry) => {
    if (filterLevel !== 'ALL' && entry.level !== filterLevel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.subsystem.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'INFO':
        return '#2997ff';
      case 'WARN':
        return '#ffd60a';
      case 'ERR':
        return '#ff453a';
      case 'RAW':
        return '#8e8e93';
    }
  };

  return (
    <div className="glass-panel flex flex-col h-full overflow-hidden">
      <div className="log-terminal-header select-none">
        <div className="log-terminal-filter-row">
          <div className="log-level-filters">
            {(['ALL', 'INFO', 'WARN', 'ERR'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                aria-pressed={filterLevel === lvl}
                aria-label={`Filter by ${lvl} level`}
                className={`log-filter-button ${
                  filterLevel === lvl ? 'is-active' : ''
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="log-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs"
              aria-label="Search logs"
              className="log-search-input"
            />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 p-2.5 overflow-y-auto font-mono text-base leading-relaxed flex flex-col gap-1 bg-black/40"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-neutral-500 text-center py-8">
            No logs matching filter criteria
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const timeStr = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <div key={entry.id} className="flex items-start gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
                <span className="text-neutral-500 select-none text-sm">{timeStr}</span>
                <span
                  className="font-bold text-sm px-1 rounded-md select-none uppercase"
                  style={{
                    color: getLevelColor(entry.level),
                    backgroundColor: `${getLevelColor(entry.level)}18`,
                  }}
                >
                  {entry.level}
                </span>
                <span className="text-[#bf5af2] text-sm select-none font-semibold">
                  [{entry.subsystem}]
                </span>
                <span className="text-neutral-200 break-all">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
