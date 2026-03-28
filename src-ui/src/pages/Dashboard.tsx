import { useEffect, useState } from 'react';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { BranchEmptyState } from '@/components/BranchEmptyState';
import { BranchTable } from '@/components/BranchTable';
import { DashboardHeader } from '@/components/DashboardHeader';
import { MergeDialog } from '@/components/MergeDialog';
import { MergeHistory } from '@/components/MergeHistory';
import { NewWorktreeDialog } from '@/components/NewWorktreeDialog';
import { useBranchStore } from '@/stores/branch-store';
import { useConfigStore } from '@/stores/config-store';
import { useMergeStore } from '@/stores/merge-store';
import { useSessionStore } from '@/stores/session-store';
import type { BranchInfo } from '@/types/branch';

export function Dashboard() {
  const selectedProjectId = useConfigStore((s) => s.selectedProjectId);
  const config = useConfigStore((s) => s.config);
  const showProjectConfig = useConfigStore((s) => s.showProjectConfig);

  const branches = useBranchStore((s) => s.branches);
  const loading = useBranchStore((s) => s.loading);
  const refreshing = useBranchStore((s) => s.refreshing);
  const error = useBranchStore((s) => s.error);
  const sortMode = useBranchStore((s) => s.sortMode);
  const lastRefreshed = useBranchStore((s) => s.lastRefreshed);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const silentRefresh = useBranchStore((s) => s.silentRefresh);
  const manualRefresh = useBranchStore((s) => s.manualRefresh);
  const setSortMode = useBranchStore((s) => s.setSortMode);
  const clear = useBranchStore((s) => s.clear);

  const activeSessions = useSessionStore((s) => s.activeSessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const launchSession = useSessionStore((s) => s.launchSession);
  const openInVscode = useSessionStore((s) => s.openInVscode);
  const openInExplorer = useSessionStore((s) => s.openInExplorer);
  const clearSessions = useSessionStore((s) => s.clear);

  const [showNewWorktree, setShowNewWorktree] = useState(false);
  const [mergeBranch, setMergeBranch] = useState<BranchInfo | null>(null);
  const mergeLoading = useMergeStore((s) => s.loading);

  const project = config?.projects.find((p) => p.id === selectedProjectId);
  const settings = config?.settings;

  // Effect 0: Listen for keyboard shortcut events
  useEffect(() => {
    const handleNewWorktree = () => setShowNewWorktree(true);
    window.addEventListener('grove:new-worktree', handleNewWorktree);
    return () => window.removeEventListener('grove:new-worktree', handleNewWorktree);
  }, []);

  // Effect 1: Initial fetch + project switch
  useEffect(() => {
    if (!project) return;
    clear();
    clearSessions();
    fetchBranches(project.path, project.branch_prefix, project.merge_target);
    return () => {
      clear();
      clearSessions();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.path, project?.branch_prefix, project?.merge_target]);

  // Effect 2: Auto-refresh timer
  useEffect(() => {
    if (!project) return;
    const intervalMs = (settings?.refresh_interval ?? 30) * 1000;
    const timer = setInterval(() => {
      silentRefresh(project.path, project.branch_prefix, project.merge_target);
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.branch_prefix, project?.merge_target, settings?.refresh_interval]);

  // Effect 3: File watcher event listener (git-changed)
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const unlistenPromise = listen<{ project_path: string; change_type: string }>(
      'git-changed',
      (event) => {
        if (cancelled) return;
        // Normalize backslashes for Windows path comparison
        const eventPath = event.payload.project_path.replace(/\\/g, '/');
        const currentPath = project.path.replace(/\\/g, '/');
        if (eventPath === currentPath) {
          silentRefresh(project.path, project.branch_prefix, project.merge_target);
        }
      },
    );
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.branch_prefix, project?.merge_target]);

  // Effect 4: Window focus refresh (branches + sessions)
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const unlistenPromise = listen(TauriEvent.WINDOW_FOCUS, () => {
      if (cancelled) return;
      const currentLastRefreshed = useBranchStore.getState().lastRefreshed;
      if (currentLastRefreshed === null || Date.now() - currentLastRefreshed > 10_000) {
        silentRefresh(project.path, project.branch_prefix, project.merge_target);
        const worktreePaths = useBranchStore.getState().branches.map((b) => b.worktree_path);
        if (worktreePaths.length > 0) {
          fetchSessions(worktreePaths);
        }
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.branch_prefix, project?.merge_target]);

  // Effect 5: Session polling (runs when branches are loaded, polls alongside auto-refresh)
  useEffect(() => {
    if (!project || branches.length === 0) return;
    const worktreePaths = branches.map((b) => b.worktree_path);
    // Initial fetch
    fetchSessions(worktreePaths);
    // Poll on same interval as branch refresh
    const intervalMs = (settings?.refresh_interval ?? 30) * 1000;
    const timer = setInterval(() => {
      fetchSessions(worktreePaths);
    }, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, settings?.refresh_interval]);

  // Action handlers
  const handleLaunch = async (branch: BranchInfo) => {
    if (!project) return;
    const flags: string[] = [];
    await launchSession(branch.worktree_path, branch.name, flags);
  };

  const handleWorktreeCreated = async (_worktreePath: string, _branchName: string) => {
    if (!project) return;
    // Refresh branches to show the new worktree
    await fetchBranches(project.path, project.branch_prefix, project.merge_target);
  };

  const handleMergeComplete = () => {
    setMergeBranch(null);
    if (project) {
      fetchBranches(project.path, project.branch_prefix, project.merge_target);
    }
  };

  if (!project) return null;

  // Error state
  if (error && !loading) {
    return (
      <div className="flex flex-col h-full px-8 pt-6">
        <DashboardHeader
          projectName={project.name}
          branchCount={0}
          lastRefreshed={lastRefreshed}
          refreshing={refreshing}
          sortMode={sortMode}
          onSortChange={setSortMode}
          onRefresh={() => manualRefresh(project.path, project.branch_prefix, project.merge_target)}
          onShowConfig={showProjectConfig}
          onNewWorktree={() => setShowNewWorktree(true)}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400">
              Failed to load branches. Check that the project path is accessible.
            </p>
            <Button
              variant="ghost"
              className="mt-4 text-gray-300"
              onClick={() => fetchBranches(project.path, project.branch_prefix, project.merge_target)}
            >
              Try again
            </Button>
          </div>
        </div>
        <NewWorktreeDialog
          open={showNewWorktree}
          onOpenChange={setShowNewWorktree}
          projectPath={project.path}
          branchPrefix={project.branch_prefix}
          onCreated={handleWorktreeCreated}
        />
        <MergeDialog
          open={!!mergeBranch}
          onOpenChange={(open) => { if (!open) setMergeBranch(null); }}
          branch={mergeBranch}
          project={project}
          onComplete={handleMergeComplete}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-8 pt-6">
      <DashboardHeader
        projectName={project.name}
        branchCount={branches.length}
        lastRefreshed={lastRefreshed}
        refreshing={refreshing}
        sortMode={sortMode}
        onSortChange={setSortMode}
        onRefresh={() => manualRefresh(project.path, project.branch_prefix, project.merge_target)}
        onShowConfig={showProjectConfig}
        onNewWorktree={() => setShowNewWorktree(true)}
      />
      <div className="flex-1 mt-6 overflow-hidden">
        {loading ? (
          <BranchTable
            branches={[]}
            sortMode={sortMode}
            loading={true}
            refreshing={false}
            activeSessions={{}}
            onLaunch={() => {}}
            onMerge={() => {}}
            mergeTarget={project.merge_target}
            mergeLoading={false}
            onOpenVscode={() => {}}
            onOpenExplorer={() => {}}
          />
        ) : branches.length === 0 ? (
          <BranchEmptyState prefix={project.branch_prefix} />
        ) : (
          <BranchTable
            branches={branches}
            sortMode={sortMode}
            loading={false}
            refreshing={refreshing}
            activeSessions={activeSessions}
            onLaunch={handleLaunch}
            onMerge={setMergeBranch}
            mergeTarget={project.merge_target}
            mergeLoading={mergeLoading}
            onOpenVscode={(path) => openInVscode(path)}
            onOpenExplorer={(path) => openInExplorer(path)}
          />
        )}
      </div>
      <div className="mt-4 mb-4">
        <MergeHistory />
      </div>
      <NewWorktreeDialog
        open={showNewWorktree}
        onOpenChange={setShowNewWorktree}
        projectPath={project.path}
        branchPrefix={project.branch_prefix}
        onCreated={handleWorktreeCreated}
      />
      <MergeDialog
        open={!!mergeBranch}
        onOpenChange={(open) => { if (!open) setMergeBranch(null); }}
        branch={mergeBranch}
        project={project}
        onComplete={handleMergeComplete}
      />
    </div>
  );
}
