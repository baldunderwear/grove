import { ArrowUpDown, Check, Plus, RefreshCw, Settings, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { relativeTime } from '@/lib/utils';
import type { SortMode } from '@/types/branch';

interface DashboardHeaderProps {
  projectName: string;
  branchCount: number;
  lastRefreshed: number | null;
  refreshing: boolean;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onRefresh: () => void;
  onShowConfig: () => void;
  onNewWorktree: () => void;
  sessionCounts?: { working: number; waiting: number; idle: number; error: number };
  selectedCount?: number;
  batchMode?: boolean;
  onToggleBatchMode?: () => void;
  onBatchLaunch?: () => void;
}

const sortLabels: Record<SortMode, string> = {
  activity: 'Activity',
  name: 'Name',
  commits: 'Commits ahead',
};

export function DashboardHeader({
  projectName,
  branchCount,
  lastRefreshed,
  refreshing,
  sortMode,
  onSortChange,
  onRefresh,
  onShowConfig,
  onNewWorktree,
  sessionCounts,
  selectedCount,
  batchMode,
  onToggleBatchMode,
  onBatchLaunch,
}: DashboardHeaderProps) {
  return (
    <div>
      <div className="flex items-start justify-between">
        {/* Left side */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--grove-white)]">{projectName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[var(--grove-fog)]">
              {branchCount === 1 ? '1 branch' : `${branchCount} branches`}
            </span>
            {lastRefreshed !== null && (
              <>
                <span className="text-xs text-[var(--grove-stone)]">&middot;</span>
                <span className="text-xs text-[var(--grove-fog)]">
                  Updated {relativeTime(Math.floor(lastRefreshed / 1000))}
                </span>
              </>
            )}
            {sessionCounts && (sessionCounts.working + sessionCounts.waiting + sessionCounts.idle + sessionCounts.error) > 0 && (
              <>
                <span className="text-xs text-[var(--grove-stone)]">&middot;</span>
                <span className="text-xs text-[var(--grove-fog)] flex items-center gap-1.5">
                  {sessionCounts.working > 0 && (
                    <span className="flex items-center gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      {sessionCounts.working}
                    </span>
                  )}
                  {sessionCounts.waiting > 0 && (
                    <span className="flex items-center gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {sessionCounts.waiting}
                    </span>
                  )}
                  {sessionCounts.idle > 0 && (
                    <span className="flex items-center gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                      {sessionCounts.idle}
                    </span>
                  )}
                  {sessionCounts.error > 0 && (
                    <span className="flex items-center gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {sessionCounts.error}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {batchMode ? (
            <>
              {selectedCount != null && selectedCount > 0 && onBatchLaunch && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onBatchLaunch}
                  className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-leaf)]/80 text-white mr-1"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Launch Selected ({selectedCount})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleBatchMode}
                className="text-[var(--grove-stone)] mr-1"
              >
                Cancel
              </Button>
            </>
          ) : onToggleBatchMode ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleBatchMode}
                  className="text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Batch Select</TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onShowConfig}
                aria-label="Project settings"
              >
                <Settings className="h-5 w-5 text-[var(--grove-fog)]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Project settings</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-1.5 text-[var(--grove-fog)]">
                <ArrowUpDown className="size-4" />
                <span className="text-sm">{sortLabels[sortMode]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(sortLabels) as SortMode[]).map((mode) => (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => onSortChange(mode)}
                  className="gap-2"
                >
                  {mode === sortMode ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {sortLabels[mode]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewWorktree}
                aria-label="New worktree"
              >
                <Plus className="h-5 w-5 text-[var(--grove-fog)]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New worktree</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                aria-label="Refresh branches"
              >
                <RefreshCw
                  className={`h-5 w-5 text-[var(--grove-fog)] ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh branches</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Separator className="mt-4" />
    </div>
  );
}
