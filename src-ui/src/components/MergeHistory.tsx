import { GitMerge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { relativeTime } from '@/lib/utils';
import { useMergeStore } from '@/stores/merge-store';

export function MergeHistory() {
  const history = useMergeStore((s) => s.history);

  if (history.length === 0) {
    return (
      <p className="text-sm text-gray-500">No merges this session</p>
    );
  }

  return (
    <ScrollArea className="max-h-64">
      <ul className="space-y-2">
        {history.map((entry, i) => (
          <li
            key={`${entry.source_branch}-${entry.timestamp}-${i}`}
            className="flex flex-col gap-1 rounded border border-gray-800 px-3 py-2"
          >
            <div className="flex items-center gap-1.5 text-sm">
              <GitMerge className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-gray-50 truncate">{entry.source_branch}</span>
              <span className="text-gray-500">&rarr;</span>
              <span className="text-gray-400 truncate">{entry.target_branch}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{entry.result.commits_merged} commits</span>

              {entry.result.new_build != null && (
                <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-800 text-xs px-1.5 py-0">
                  Build {entry.result.new_build}
                </Badge>
              )}

              {entry.result.warnings.length > 0 && (
                <Badge className="bg-amber-900/50 text-amber-300 border-amber-800 text-xs px-1.5 py-0">
                  {entry.result.warnings.length} warning{entry.result.warnings.length !== 1 ? 's' : ''}
                </Badge>
              )}

              <span className="ml-auto text-gray-500">
                {relativeTime(entry.timestamp / 1000)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
