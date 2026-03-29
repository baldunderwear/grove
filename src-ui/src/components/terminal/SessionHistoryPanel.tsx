import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Clock, GitBranch, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StateTransition {
  state: 'working' | 'waiting' | 'idle' | 'error';
  timestamp: number;
}

interface SessionHistoryData {
  terminal_id: string;
  working_dir: string;
  started_at: number;
  duration_ms: number;
  start_head: string;
  git_diff_stat: string | null;
  transitions: StateTransition[];
}

interface SessionHistoryPanelProps {
  terminalId: string;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const stateColors: Record<string, string> = {
  working: 'bg-green-500',
  waiting: 'bg-amber-400',
  idle: 'bg-zinc-500',
  error: 'bg-red-500',
};

const stateLabels: Record<string, string> = {
  working: 'Working',
  waiting: 'Waiting for input',
  idle: 'Idle',
  error: 'Error',
};

export function SessionHistoryPanel({ terminalId, onClose }: SessionHistoryPanelProps) {
  const [history, setHistory] = useState<SessionHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SessionHistoryData>('terminal_get_history', { terminalId })
      .then(setHistory)
      .catch((e) => setError(String(e)));
  }, [terminalId]);

  return (
    <div className="absolute inset-0 bg-zinc-900/95 z-10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Session History
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error ? (
        <div className="p-4 text-sm text-red-400">{error}</div>
      ) : !history ? (
        <div className="p-4 text-sm text-zinc-500">Loading...</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Duration and start info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Clock className="h-4 w-4 text-zinc-500" />
              <span>Duration: {formatDuration(history.duration_ms)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <GitBranch className="h-4 w-4 text-zinc-500" />
              <span>
                Started at commit:{' '}
                <code className="text-xs bg-zinc-800 px-1 rounded">{history.start_head}</code>
              </span>
            </div>
            <div className="text-xs text-zinc-500">Started: {formatTime(history.started_at)}</div>
          </div>

          {/* Git diff stat */}
          {history.git_diff_stat && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Changes since session start
              </h4>
              <pre className="text-xs text-zinc-300 bg-zinc-800/50 rounded p-3 overflow-x-auto font-mono whitespace-pre">
                {history.git_diff_stat}
              </pre>
            </div>
          )}

          {/* State timeline */}
          {history.transitions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                State Timeline
              </h4>
              <div className="space-y-1">
                {history.transitions.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 font-mono w-20">
                      {formatTime(t.timestamp)}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${stateColors[t.state] ?? 'bg-zinc-700'}`}
                    />
                    <span className="text-zinc-300">{stateLabels[t.state] ?? t.state}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
