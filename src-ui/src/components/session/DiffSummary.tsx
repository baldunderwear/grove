import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DiffSummaryData } from '@/types/diff';

interface DiffSummaryProps {
  worktreePath: string;
  branchName: string;
  mergeTarget: string;
}

export function DiffSummary({ worktreePath, branchName, mergeTarget }: DiffSummaryProps) {
  const [diffData, setDiffData] = useState<DiffSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<DiffSummaryData>('get_branch_diff_summary', {
      projectPath: worktreePath,
      sourceBranch: branchName,
      mergeTarget,
    })
      .then((data) => {
        if (!cancelled) {
          setDiffData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [worktreePath, branchName, mergeTarget]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-1.5">
        <div className="bg-[var(--grove-canopy)] animate-pulse rounded h-3 w-3/4" />
        <div className="bg-[var(--grove-canopy)] animate-pulse rounded h-3 w-1/2" />
        <div className="bg-[var(--grove-canopy)] animate-pulse rounded h-3 w-2/3" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-sm text-[var(--grove-stone)]">
        Could not load diff summary
      </div>
    );
  }

  // Empty state
  if (!diffData || diffData.files_changed === 0) {
    return (
      <div className="text-sm text-[var(--grove-stone)] text-center">
        No changes detected
      </div>
    );
  }

  // Normal state
  return (
    <div className="flex flex-col gap-2">
      {/* Aggregate stat line */}
      <div className="font-mono text-xs flex items-center gap-1 flex-wrap">
        <span className="text-[var(--grove-stone)]">{diffData.files_changed} files changed</span>
        <span className="text-[var(--grove-stone)]">&middot;</span>
        <span className="text-emerald-400">+{diffData.insertions}</span>
        <span className="text-[var(--grove-stone)]">&middot;</span>
        <span className="text-red-400">-{diffData.deletions}</span>
        <span className="text-[var(--grove-stone)]">&middot;</span>
        <span className="text-[var(--grove-stone)]">{diffData.commits.length} commits</span>
      </div>

      {/* Scrollable file list */}
      <ScrollArea className="max-h-[100px]">
        <div className="space-y-0.5">
          {diffData.files.map((file) => {
            const fileName = file.path.includes('/')
              ? file.path.split('/').pop() ?? file.path
              : file.path;
            return (
              <div key={file.path} className="flex items-center justify-between gap-2">
                <span
                  className="font-mono text-xs text-[var(--grove-bright)] truncate min-w-0"
                  title={file.path}
                >
                  {fileName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                  <span className="text-emerald-400">+{file.insertions}</span>
                  <span className="text-red-400">-{file.deletions}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
