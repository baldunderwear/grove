import { useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfigStore } from '@/stores/config-store';
import type { BranchInfo } from '@/types/branch';
import { relativeTime, isStale } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';
import { useState } from 'react';

interface ProjectBranches {
  projectId: string;
  projectName: string;
  branches: BranchInfo[];
  loading: boolean;
  error: string | null;
}

export function AllProjects() {
  const config = useConfigStore((s) => s.config);
  const selectProject = useConfigStore((s) => s.selectProject);
  const projects = config?.projects ?? [];
  const settings = config?.settings;

  const [projectData, setProjectData] = useState<ProjectBranches[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const activeSessions = useSessionStore((s) => s.activeSessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const launchSession = useSessionStore((s) => s.launchSession);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);

    const results: ProjectBranches[] = [];
    const allWorktreePaths: string[] = [];

    for (const project of projects) {
      try {
        const branches = await invoke<BranchInfo[]>('list_branches', {
          projectPath: project.path,
          branchPrefix: project.branch_prefix,
          mergeTarget: project.merge_target,
        });
        results.push({
          projectId: project.id,
          projectName: project.name,
          branches,
          loading: false,
          error: null,
        });
        branches.forEach((b) => allWorktreePaths.push(b.worktree_path));
      } catch (e) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          branches: [],
          loading: false,
          error: String(e),
        });
      }
    }

    if (mountedRef.current) {
      setProjectData(results);
      setRefreshing(false);
    }

    if (allWorktreePaths.length > 0) {
      fetchSessions(allWorktreePaths);
    }
  }, [projects, fetchSessions]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => { mountedRef.current = false; };
  }, [fetchAll]);

  // Auto-refresh
  useEffect(() => {
    const intervalMs = (settings?.refresh_interval ?? 30) * 1000;
    const timer = setInterval(() => fetchAll(true), intervalMs);
    return () => clearInterval(timer);
  }, [fetchAll, settings?.refresh_interval]);

  // Git-changed events
  useEffect(() => {
    const unlisten = listen('git-changed', () => fetchAll(true));
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchAll]);

  const totalBranches = projectData.reduce((sum, p) => sum + p.branches.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--grove-canopy)' }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--grove-white)' }}>All Projects</h2>
          <p className="text-sm" style={{ color: 'var(--grove-stone)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} · {totalBranches} branch{totalBranches !== 1 ? 'es' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchAll()}
          className="text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {projectData.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Skeleton className="h-8 w-48" />
            </div>
          )}

          {projectData.map((pd) => (
            <div key={pd.projectId}>
              {/* Project header */}
              <button
                type="button"
                onClick={() => selectProject(pd.projectId)}
                className="flex items-center gap-2 mb-3 group cursor-pointer"
              >
                <h3 className="text-base font-semibold" style={{ color: 'var(--grove-fog)' }}>
                  {pd.projectName}
                </h3>
                <span className="text-xs group-hover:underline" style={{ color: 'var(--grove-stone)' }}>
                  {pd.branches.length} branch{pd.branches.length !== 1 ? 'es' : ''}
                </span>
              </button>

              {pd.error && (
                <p className="text-sm text-red-400 mb-3">{pd.error}</p>
              )}

              {pd.branches.length === 0 && !pd.error && (
                <p className="text-sm mb-3" style={{ color: 'var(--grove-stone)' }}>No matching branches</p>
              )}

              {/* Branch rows */}
              <div className="space-y-1">
                {pd.branches.map((branch) => {
                  const mergeReady = branch.ahead > 0 && !branch.is_dirty;
                  const stale = isStale(branch.last_commit_timestamp);
                  const hasSession = activeSessions[branch.worktree_path] !== undefined;

                  return (
                    <div
                      key={`${pd.projectId}-${branch.name}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-md group transition-colors hover:bg-[var(--grove-canopy)]"
                    >
                      {/* Status dot */}
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        hasSession ? 'bg-[var(--grove-sprout)] animate-pulse' :
                        branch.is_dirty ? 'bg-[var(--grove-amber)]' :
                        'bg-[var(--grove-moss)]'
                      }`} />

                      {/* Branch name */}
                      <span className="text-sm font-mono truncate min-w-0 flex-1" style={{ color: 'var(--grove-fog)' }}>
                        {branch.name}
                      </span>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {mergeReady && (
                          <Badge className="text-[10px] px-1.5 py-0 border-0 rounded-full bg-[var(--grove-leaf)]/15 text-[var(--grove-sprout)]">
                            Ready
                          </Badge>
                        )}
                        {stale && (
                          <Badge className="text-[10px] px-1.5 py-0 border-0 rounded-full bg-[var(--grove-amber)]/15 text-[var(--grove-dusk)]">
                            Stale
                          </Badge>
                        )}
                        {hasSession && (
                          <Badge className="text-[10px] px-1.5 py-0 border-0 rounded-full bg-[var(--grove-leaf)]/15 text-[var(--grove-bright)]">
                            Active
                          </Badge>
                        )}
                      </div>

                      {/* Ahead/behind */}
                      <span className="text-xs font-mono flex-shrink-0 w-16 text-right" style={{ color: 'var(--grove-stone)' }}>
                        <span style={branch.ahead > 0 ? { color: 'var(--grove-sprout)' } : {}}>+{branch.ahead}</span>
                        <span> / -{branch.behind}</span>
                      </span>

                      {/* Time */}
                      <span className="text-xs flex-shrink-0 w-20 text-right" style={{ color: stale ? 'var(--grove-amber)' : 'var(--grove-stone)' }}>
                        {relativeTime(branch.last_commit_timestamp)}
                      </span>

                      {/* Launch button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--grove-stone)] hover:text-[var(--grove-sprout)]"
                        disabled={hasSession}
                        onClick={() => launchSession(branch.worktree_path, branch.name, [])}
                      >
                        <span className="text-xs">▶</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
