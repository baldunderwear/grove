import { ScrollArea } from '@/components/ui/scroll-area';
import type { CommitInfo } from '@/types/merge';

interface CommitReviewStepProps {
  commits: CommitInfo[];
}

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function CommitReviewStep({ commits }: CommitReviewStepProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-[13px] font-semibold leading-[1.3] text-[var(--grove-fog)]">
        {commits.length} Commits
      </h4>
      <ScrollArea className="max-h-[300px]">
        <div>
          {commits.map((commit) => (
            <div
              key={commit.oid}
              className="flex items-center gap-3 py-2 px-2 border-b border-[var(--grove-canopy)]"
            >
              <span className="font-mono text-xs text-[var(--grove-stone)] shrink-0">
                {commit.oid.slice(0, 7)}
              </span>
              <span className="text-sm text-[var(--grove-fog)] truncate flex-1">
                {commit.message}
              </span>
              <span className="font-mono text-xs text-[var(--grove-stone)] shrink-0">
                {relativeTime(commit.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
