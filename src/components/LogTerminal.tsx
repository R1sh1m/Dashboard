import React, { useState, useRef, useEffect } from 'react';
import type { LogEntry, LogLevel } from '../types/telemetry';
import { Terminal, Download, Trash2, ArrowDown, Search } from 'lucide-react';

interface LogTerminalProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogTerminal: React.FC<LogTerminalProps> = ({ logs, onClearLogs }) => {
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
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

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `artemis_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

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
      <div className="h-10 px-3 border-b border-white/10 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#2997ff]" />
          <span className="text-[11px] font-semibold tracking-wider text-neutral-300 uppercase">
            LIVE TELEMETRY LOGS
          </span>
          <span className="text-[10px] font-mono text-neutral-400">
            ({filteredLogs.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-black/30 rounded-lg p-0.5 border border-white/10 text-[10px]">
            {(['ALL', 'INFO', 'WARN', 'ERR'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-1.5 py-0.5 rounded font-mono transition-all ${
                  filterLevel === lvl
                    ? 'bg-white/20 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-neutral-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-black/30 border border-white/10 rounded-lg pl-6 pr-2 py-0.5 text-[10px] text-white placeholder-neutral-500 focus:outline-none focus:border-[#007AFF] w-20 md:w-28"
            />
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded border transition-colors ${
              autoScroll ? 'bg-white/20 text-[#2997ff] border-white/20' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5'
            }`}
            title="Auto-scroll lock"
          >
            <ArrowDown className="w-3 h-3" />
          </button>

          <button
            onClick={exportLogsAsJson}
            className="p-1 rounded hover:bg-white/10 text-neutral-300 transition-colors"
            title="Export logs as JSON"
          >
            <Download className="w-3 h-3" />
          </button>

          <button
            onClick={onClearLogs}
            className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-red-400 transition-colors"
            title="Clear all logs"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] leading-relaxed flex flex-col gap-1 bg-black/40"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-neutral-500 text-center py-8">
            No telemetry logs matching filter criteria
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const timeStr = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <div key={entry.id} className="flex items-start gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
                <span className="text-neutral-500 select-none text-[10px]">{timeStr}</span>
                <span
                  className="font-bold text-[10px] px-1 rounded-md select-none uppercase"
                  style={{
                    color: getLevelColor(entry.level),
                    backgroundColor: `${getLevelColor(entry.level)}18`,
                  }}
                >
                  {entry.level}
                </span>
                <span className="text-[#bf5af2] text-[10px] select-none font-semibold">
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
