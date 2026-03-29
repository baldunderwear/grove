import { useEffect, useState } from 'react';
import { Terminal, X } from 'lucide-react';
import type { TerminalTab, SessionState } from '@/stores/terminal-store';

function getStatusDotClass(state: SessionState): string {
  switch (state) {
    case 'working':  return 'bg-green-500 animate-pulse';
    case 'waiting':  return 'bg-amber-400';
    case 'idle':     return 'bg-zinc-500';
    case 'error':    return 'bg-red-500';
    default:         return 'bg-zinc-700';
  }
}

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

function formatDuration(createdAt: number): string {
  const elapsed = Math.floor((Date.now() - createdAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

export function TerminalTabBar({ tabs, activeTabId, onSwitch, onClose }: TerminalTabBarProps) {
  const [, setTick] = useState(0);

  // Update duration display every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-9 items-center bg-zinc-900 border-b border-zinc-800 overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            className={`group flex items-center gap-1.5 h-full px-3 text-xs font-mono border-r border-zinc-800 shrink-0 transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-100 border-b-2 border-b-[var(--grove-canopy)]'
                : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
            onClick={() => onSwitch(tab.id)}
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${getStatusDotClass(tab.sessionState)}`}
              data-testid="status-dot"
              title={tab.sessionState ?? 'starting'}
            />
            <Terminal className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[150px]">{tab.branchName}</span>
            <span className="text-zinc-500 ml-1">{formatDuration(tab.createdAt)}</span>
            <span
              role="button"
              tabIndex={0}
              className={`ml-1 rounded p-0.5 transition-colors ${
                isActive
                  ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                  : 'text-transparent group-hover:text-zinc-400 hover:!text-zinc-100 hover:bg-zinc-700'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onClose(tab.id);
                }
              }}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
