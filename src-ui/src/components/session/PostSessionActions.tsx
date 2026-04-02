import { Clock, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TerminalTab } from '@/stores/terminal-store';

interface PostSessionActionsProps {
  tab: TerminalTab;
  hasCommitsAhead: boolean;
  onMerge: () => void;
}

function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs ?? Date.now();
  const elapsed = Math.floor((end - startMs) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

export function PostSessionActions({ tab, hasCommitsAhead, onMerge }: PostSessionActionsProps) {
  const isCrash = tab.exitCode !== null && tab.exitCode !== 0;

  return (
    <div className="flex items-center justify-between px-4 pb-2.5 pt-1">
      <div className="flex items-center gap-1 text-xs text-[var(--grove-stone)]">
        <Clock className="h-3 w-3" />
        {formatDuration(tab.createdAt, tab.exitedAt)}
      </div>
      {hasCommitsAhead && (
        <Button
          size="sm"
          className={`gap-1.5 text-white ${
            isCrash
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onMerge();
          }}
        >
          <GitMerge className="h-3.5 w-3.5" />
          Review &amp; Merge
        </Button>
      )}
    </div>
  );
}
