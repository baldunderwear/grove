import { useMemo } from 'react';
import { Clock, Code2, FolderOpen, GitMerge, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
        <TableRow key={i} className="border-b border-[var(--grove-canopy)] min-h-[48px]">
          <TableCell className="w-[40px]">
            <Skeleton className="h-4 w-4 rounded-sm" />
          </TableCell>
          <TableCell className="w-[40px]">
            <Skeleton className="w-2 h-2 rounded-full" />
          </TableCell>
          <TableCell className="flex-1 min-w-[200px]">
            <Skeleton className="h-4 w-48 mb-1" />
            <Skeleton className="h-3 w-64" />
          </TableCell>
          <TableCell className="w-[120px]">
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="w-[140px]">
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-14 rounded-full" />
          </TableCell>
        </TableRow>
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
}: BranchTableProps) {
  const sorted = useMemo(() => sortBranches(branches, sortMode), [branches, sortMode]);

  return (
    <ScrollArea className="flex-1">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--grove-deep)] border-b border-[var(--grove-canopy)] hover:bg-[var(--grove-deep)]">
            <TableHead className="w-[40px]">
              <Checkbox
                checked={
                  branches.length > 0 && selectedBranches.size === branches.length
                    ? true
                    : selectedBranches.size > 0
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) => {
                  if (checked) {
                    onSelectionChange(new Set(branches.map((b) => b.worktree_path)));
                  } else {
                    onSelectionChange(new Set());
                  }
                }}
              />
            </TableHead>
            <TableHead className="w-[40px] text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal" />
            <TableHead className="flex-1 min-w-[200px] text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal">
              Branch
            </TableHead>
            <TableHead className="w-[120px] text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal">
              Ahead / Behind
            </TableHead>
            <TableHead className="w-[140px] text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal">
              Last Activity
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal" />
            <TableHead className="w-[120px] text-xs uppercase tracking-wider text-[var(--grove-fog)] font-normal text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={refreshing ? 'opacity-50 transition-opacity duration-200' : ''}>
          {loading ? (
            <SkeletonRows />
          ) : (
            sorted.map((branch) => {
              const stale = isStale(branch.last_commit_timestamp);
              const mergeReady = branch.ahead > 0 && !branch.is_dirty;

              // Status dot color: dirty = amber, stale = gray, clean = emerald
              const dotColor = branch.is_dirty
                ? 'bg-amber-500'
                : stale
                  ? 'bg-gray-500'
                  : 'bg-[var(--grove-leaf)]';

              return (
                <TableRow
                  key={branch.name}
                  className="group border-b border-[var(--grove-canopy)] hover:bg-[#1e1e1e] min-h-[48px]"
                >
                  {/* Selection checkbox */}
                  <TableCell className="w-[40px]">
                    <Checkbox
                      checked={selectedBranches.has(branch.worktree_path)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedBranches);
                        if (checked) next.add(branch.worktree_path);
                        else next.delete(branch.worktree_path);
                        onSelectionChange(next);
                      }}
                    />
                  </TableCell>

                  {/* Status dot */}
                  <TableCell className="w-[40px]">
                    <span className={`block w-2 h-2 rounded-full ${dotColor}`} />
                  </TableCell>

                  {/* Branch name + commit message */}
                  <TableCell className="flex-1 min-w-[200px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-sm text-[var(--grove-white)] truncate max-w-[300px]">
                          {branch.name}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{branch.name}</TooltipContent>
                    </Tooltip>
                    <div className="text-xs text-[var(--grove-fog)] truncate max-w-[400px]">
                      {branch.last_commit_message}
                    </div>
                  </TableCell>

                  {/* Ahead / Behind */}
                  <TableCell className="w-[120px]">
                    <span className={branch.ahead > 0 ? 'text-[var(--grove-sprout)]' : 'text-[var(--grove-stone)]'}>
                      +{branch.ahead}
                    </span>
                    <span className="text-[var(--grove-stone)]"> / -{branch.behind}</span>
                  </TableCell>

                  {/* Last Activity */}
                  <TableCell className="w-[140px]">
                    <span className={`text-sm flex items-center gap-1 ${stale ? 'text-[var(--grove-stone)]' : 'text-[var(--grove-fog)]'}`}>
                      {stale && <Clock className="size-3.5 shrink-0" />}
                      {relativeTime(branch.last_commit_timestamp)}
                    </span>
                  </TableCell>

                  {/* Badges */}
                  <TableCell>
                    <div className="flex gap-2">
                      {mergeReady && (
                        <Badge className="bg-[var(--grove-leaf)]/15 text-emerald-500 border-0 text-xs px-2 py-0.5 rounded-full">
                          Ready
                        </Badge>
                      )}
                      {branch.is_dirty && (
                        <Badge className="bg-amber-500/15 text-amber-500 border-0 text-xs px-2 py-0.5 rounded-full">
                          Dirty
                        </Badge>
                      )}
                      {stale && (
                        <Badge className="bg-gray-500/15 text-[var(--grove-stone)] border-0 text-xs px-2 py-0.5 rounded-full">
                          Stale
                        </Badge>
                      )}
                      {activeSessions[branch.worktree_path] && (
                        <Badge className="bg-[var(--grove-leaf)]/15 text-emerald-500 border-0 text-xs px-2 py-0.5 rounded-full">
                          <span className="relative flex h-2 w-2 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--grove-leaf)]" />
                          </span>
                          Active
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Action buttons */}
                  <TableCell className="w-[120px]">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {mergeReady && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onMerge(branch)}
                              disabled={mergeLoading}
                              aria-label={`Merge into ${mergeTarget}`}
                            >
                              <GitMerge className="h-3.5 w-3.5 text-[var(--grove-sprout)]" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Merge into {mergeTarget}</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onLaunch(branch)}
                            disabled={!!activeSessions[branch.worktree_path]}
                            aria-label="Launch Claude Code"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Launch Claude Code</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onOpenExplorer(branch.worktree_path)}
                            aria-label="Open in Explorer"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in Explorer</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onOpenVscode(branch.worktree_path)}
                            aria-label="Open in VS Code"
                          >
                            <Code2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in VS Code</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
