import { ArrowUpDown, Check, Plus, RefreshCw, Settings } from 'lucide-react';
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
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
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
