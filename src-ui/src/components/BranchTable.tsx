import { useMemo } from 'react';
import { Clock, Code2, FolderOpen, GitMerge, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { isStale, relativeTime } from '@/lib/utils';
import type { BranchInfo, SortMode } from '@/types/branch';

interface BranchTableProps {
  branches: BranchInfo[];
  sortMode: SortMode;
  loading: boolean;
  refreshing: boolean;
  activeSessions: Record<string, number>;
  onLaunch: (branch: BranchInfo) => void;
  onMerge: (branch: BranchInfo) => void;
  mergeTarget: string;
  mergeLoading: boolean;
  onOpenVscode: (worktreePath: string) => void;
  onOpenExplorer: (worktreePath: string) => void;
  selectedBranches: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  showSelection?: boolean;
}

function sortBranches(branches: BranchInfo[], mode: SortMode): BranchInfo[] {
  const sorted = [...branches];
  switch (mode) {
    case 'activity':
      return sorted.sort((a, b) => b.last_commit_timestamp - a.last_commit_timestamp);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'commits':
      return sorted.sort((a, b) => b.ahead - a.ahead);
  }
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--grove-canopy)]">
          <Skeleton className="w-2 h-2 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-48 mb-1" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </>
  );
}

export function BranchTable({
  branches,
  sortMode,
  loading,
  refreshing,
  activeSessions,
  onLaunch,
  onMerge,
  mergeTarget,
  mergeLoading,
  onOpenVscode,
  onOpenExplorer,
  selectedBranches,
  onSelectionChange,
  showSelection = false,
}: BranchTableProps) {
  const sorted = useMemo(() => sortBranches(branches, sortMode), [branches, sortMode]);

  return (
    <ScrollArea className="flex-1">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs uppercase tracking-wider text-[var(--grove-stone)] border-b border-[var(--grove-canopy)] sticky top-0 z-10" style={{ background: 'var(--grove-deep)' }}>
        {showSelection && <div className="w-5 shrink-0" />}
        <div className="w-3 shrink-0" />
        <div className="flex-1 min-w-0">Branch</div>
        <div className="w-20 shrink-0 text-right">+/-</div>
        <div className="w-20 shrink-0 text-right">Activity</div>
        <div className="w-28 shrink-0 text-right">Actions</div>
      </div>

      {/* Body */}
      <div className={refreshing ? 'opacity-50 transition-opacity duration-200' : ''}>
        {loading ? (
          <SkeletonRows />
        ) : (
          sorted.map((branch) => {
            const stale = isStale(branch.last_commit_timestamp);
            const mergeReady = branch.ahead > 0 && !branch.is_dirty;
            const hasSession = !!activeSessions[branch.worktree_path];

            const dotColor = branch.is_dirty
              ? 'bg-amber-500'
              : stale
                ? 'bg-[var(--grove-stone)]'
                : 'bg-[var(--grove-leaf)]';

            return (
              <div
                key={branch.name}
                className="group flex items-center gap-3 px-4 py-2.5 border-b border-[var(--grove-canopy)] hover:bg-[var(--grove-canopy)]/30 transition-colors"
              >
                {/* Checkbox */}
                {showSelection && (
                  <div className="w-5 shrink-0">
                    <Checkbox
                      checked={selectedBranches.has(branch.worktree_path)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedBranches);
                        if (checked) next.add(branch.worktree_path);
                        else next.delete(branch.worktree_path);
                        onSelectionChange(next);
                      }}
                    />
                  </div>
                )}

                {/* Status dot */}
                <div className="w-3 shrink-0 flex justify-center">
                  <span className={`block w-2 h-2 rounded-full ${dotColor} ${hasSession ? 'animate-pulse' : ''}`} />
                </div>

                {/* Branch name + commit (flex-1 with min-w-0 for truncation) */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--grove-fog)' }}>
                    {branch.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--grove-stone)' }}>
                    {branch.last_commit_message}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex gap-1 shrink-0">
                  {mergeReady && (
                    <Badge className="bg-[var(--grove-leaf)]/15 text-[var(--grove-sprout)] border-0 text-[10px] px-1.5 py-0 rounded-full">
                      Ready
                    </Badge>
                  )}
                  {hasSession && (
                    <Badge className="bg-[var(--grove-leaf)]/15 text-[var(--grove-bright)] border-0 text-[10px] px-1.5 py-0 rounded-full">
                      Active
                    </Badge>
                  )}
                </div>

                {/* Ahead/Behind */}
                <div className="w-20 shrink-0 text-right text-xs font-mono" style={{ color: 'var(--grove-stone)' }}>
                  <span style={branch.ahead > 0 ? { color: 'var(--grove-sprout)' } : {}}>+{branch.ahead}</span>
                  <span> -{branch.behind}</span>
                </div>

                {/* Last Activity */}
                <div className="w-20 shrink-0 text-right text-xs" style={{ color: stale ? 'var(--grove-amber)' : 'var(--grove-stone)' }}>
                  {stale && <Clock className="inline size-3 mr-0.5" />}
                  {relativeTime(branch.last_commit_timestamp)}
                </div>

                {/* Actions */}
                <div className="w-28 shrink-0 flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {mergeReady && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMerge(branch)} disabled={mergeLoading}>
                          <GitMerge className="h-3.5 w-3.5 text-[var(--grove-sprout)]" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Merge into {mergeTarget}</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onLaunch(branch)} disabled={hasSession}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Launch Claude Code</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenExplorer(branch.worktree_path)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in Explorer</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenVscode(branch.worktree_path)}>
                        <Code2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in VS Code</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
