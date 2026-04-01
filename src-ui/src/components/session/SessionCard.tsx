import { useEffect, useState } from 'react';
import { X, Maximize2, Clock } from 'lucide-react';
import type { TerminalTab } from '@/stores/terminal-store';

const stateConfig: Record<string, { label: string; color: string; bg: string }> = {
  working:  { label: 'Working',  color: 'bg-emerald-400', bg: 'from-emerald-500/5' },
  waiting:  { label: 'Waiting',  color: 'bg-amber-400',   bg: 'from-amber-500/8' },
  idle:     { label: 'Idle',     color: 'bg-zinc-500',    bg: 'from-zinc-500/3' },
  error:    { label: 'Error',    color: 'bg-red-500',     bg: 'from-red-500/5' },
};

function formatDuration(createdAt: number): string {
  const elapsed = Math.floor((Date.now() - createdAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

interface SessionCardProps {
  tab: TerminalTab;
  lastLines: string[];
  onFocus: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

export function SessionCard({ tab, lastLines, onFocus, onClose }: SessionCardProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const state = tab.sessionState;
  const cfg = state ? stateConfig[state] : null;
  const isWaiting = state === 'waiting';

  const shortName = tab.branchName.includes('/')
    ? tab.branchName.split('/').pop() ?? tab.branchName
    : tab.branchName;

  return (
    <div
      className={`
        group relative flex flex-col rounded-xl overflow-hidden cursor-pointer
        border transition-all duration-200 ease-out
        hover:scale-[1.01] hover:shadow-xl hover:shadow-black/30
        ${isWaiting
          ? 'border-amber-400/40 shadow-lg shadow-amber-500/10 grove-pulse-border'
          : 'border-[var(--grove-canopy)] hover:border-[var(--grove-moss)]'
        }
      `}
      style={{ background: 'var(--grove-deep)' }}
      onClick={() => onFocus(tab.id)}
    >
      {/* Status gradient overlay */}
      {cfg && (
        <div className={`absolute inset-0 bg-gradient-to-b ${cfg.bg} to-transparent pointer-events-none z-0`} />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg?.color ?? 'bg-zinc-700'} ${state === 'working' ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-semibold text-[var(--grove-white)] truncate">
            {shortName}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1 rounded hover:bg-[var(--grove-canopy)] text-[var(--grove-stone)] hover:text-[var(--grove-white)] transition-colors"
            onClick={(e) => { e.stopPropagation(); onFocus(tab.id); }}
            title="Expand"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1 rounded hover:bg-red-500/20 text-[var(--grove-stone)] hover:text-red-400 transition-colors"
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            title="Close session"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal preview — last N lines of output as styled text */}
      <div
        className="relative z-10 flex-1 mx-3 mb-1 rounded-lg overflow-hidden font-mono text-[10px] leading-[14px] p-2"
        style={{ background: '#0a0e0c' }}
      >
        <div className="h-full overflow-hidden text-[var(--grove-bright)] opacity-60">
          {lastLines.length > 0 ? (
            lastLines.map((line, i) => (
              <div key={i} className="truncate whitespace-pre">{line || '\u00A0'}</div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--grove-stone)] text-xs font-sans">
              {tab.isConnected ? 'Waiting for output...' : 'Connecting...'}
            </div>
          )}
        </div>
        {/* Fade-out gradient at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0a0e0c] to-transparent pointer-events-none" />
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-2.5 pt-1">
        <div className="flex items-center gap-3 text-xs text-[var(--grove-stone)]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(tab.createdAt)}
          </span>
          {cfg && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
              isWaiting
                ? 'bg-amber-400/15 text-amber-300'
                : state === 'error'
                  ? 'bg-red-500/15 text-red-300'
                  : state === 'working'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-500/15 text-zinc-400'
            }`}>
              {cfg.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
