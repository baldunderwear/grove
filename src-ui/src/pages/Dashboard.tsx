import { useEffect, useState } from 'react';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { BranchEmptyState } from '@/components/BranchEmptyState';
import { BranchTable } from '@/components/BranchTable';
import { DashboardHeader } from '@/components/DashboardHeader';
import { MergeDialog } from '@/components/MergeDialog';
import { BatchLaunchDialog } from '@/components/launch/BatchLaunchDialog';
import { LaunchDialog } from '@/components/launch/LaunchDialog';
import { MergeHistory } from '@/components/MergeHistory';
import { NewWorktreeDialog } from '@/components/NewWorktreeDialog';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { useBranchStore } from '@/stores/branch-store';
import { useConfigStore } from '@/stores/config-store';
import { useMergeStore } from '@/stores/merge-store';
import { openInVscode, openInExplorer } from '@/lib/shell';
import { useTerminalStore } from '@/stores/terminal-store';
import type { SessionState } from '@/stores/terminal-store';
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

  const hasAnyTabs = useTerminalStore((s) => s.hasAnyTabs);
  const addTab = useTerminalStore((s) => s.addTab);
  const switchTab = useTerminalStore((s) => s.switchTab);
  const getTabForWorktree = useTerminalStore((s) => s.getTabForWorktree);
  const setTabState = useTerminalStore((s) => s.setTabState);
  const getSessionCounts = useTerminalStore((s) => s.getSessionCounts);

  const [showNewWorktree, setShowNewWorktree] = useState(false);
  const [mergeBranch, setMergeBranch] = useState<BranchInfo | null>(null);
  const [launchBranch, setLaunchBranch] = useState<BranchInfo | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [showBatchLaunch, setShowBatchLaunch] = useState(false);
  const tabs = useTerminalStore((s) => s.tabs);
  const mergeLoading = useMergeStore((s) => s.loading);

  const project = config?.projects.find((p) => p.id === selectedProjectId);

  // Derive activeSessions from terminal-store tabs for BranchTable compatibility
  const activeSessions: Record<string, number> = {};
  for (const tab of tabs.values()) {
    activeSessions[tab.worktreePath] = 1;
  }
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
    setSelectedBranches(new Set());
    fetchBranches(project.path, project.branch_prefix, project.merge_target);
    return () => {
      clear();
      setSelectedBranches(new Set());
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

  // Effect 4: Window focus refresh (branches only — sessions tracked via terminal-store)
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const unlistenPromise = listen(TauriEvent.WINDOW_FOCUS, () => {
      if (cancelled) return;
      const currentLastRefreshed = useBranchStore.getState().lastRefreshed;
      if (currentLastRefreshed === null || Date.now() - currentLastRefreshed > 10_000) {
        silentRefresh(project.path, project.branch_prefix, project.merge_target);
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.branch_prefix, project?.merge_target]);

  // Effect 5: Session state change listener
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<{ terminal_id: string; state: string; timestamp: number }>(
      'session-state-changed',
      (event) => {
        if (cancelled) return;
        const { terminal_id, state } = event.payload;
        setTabState(terminal_id, state as SessionState);

        // Fire desktop notification on transition to "waiting"
        if (state === 'waiting') {
          const tab = useTerminalStore.getState().tabs.get(terminal_id);
          const branchName = tab?.branchName ?? 'Unknown';
          sendNotification({
            title: 'Session Waiting for Input',
            body: `${branchName} is waiting for your input`,
          });
        }
      },
    );
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTabState]);

  // Action handlers
  const handleLaunch = (branch: BranchInfo) => {
    if (!project) return;
    // Check if a tab already exists for this worktree
    const existing = getTabForWorktree(branch.worktree_path);
    if (existing) {
      switchTab(existing.id);
    } else {
      setLaunchBranch(branch);
    }
  };

  const handleLaunchConfirm = (prompt: string, contextFiles: string[]) => {
    if (!launchBranch || !project) return;
    addTab(launchBranch.worktree_path, launchBranch.name, selectedProjectId ?? undefined, {
      prompt: prompt || undefined,
      contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
    });
    setLaunchBranch(null);
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

  const handleBatchLaunch = (prompt: string) => {
    const branchesToLaunch = branches.filter((b) => selectedBranches.has(b.worktree_path));
    for (const branch of branchesToLaunch) {
      // Skip if tab already exists for this worktree
      const existing = getTabForWorktree(branch.worktree_path);
      if (existing) continue;

      // Substitute variables per worktree
      const resolvedPrompt = prompt
        .replace(/\{branch\}/g, branch.name)
        .replace(/\{project\}/g, project?.name ?? '')
        .replace(/\{path\}/g, branch.worktree_path);

      addTab(branch.worktree_path, branch.name, selectedProjectId ?? undefined, {
        prompt: resolvedPrompt || undefined,
      });
    }
    setSelectedBranches(new Set());
    setShowBatchLaunch(false);
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
          sessionCounts={getSessionCounts()}
          selectedCount={selectedBranches.size}
          batchMode={batchMode}
          onToggleBatchMode={() => { setBatchMode(!batchMode); setSelectedBranches(new Set()); }}
          onBatchLaunch={() => setShowBatchLaunch(true)}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--grove-fog)]">
              Failed to load branches. Check that the project path is accessible.
            </p>
            <Button
              variant="ghost"
              className="mt-4 text-[var(--grove-fog)]"
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
        <LaunchDialog
          open={!!launchBranch}
          onOpenChange={(open) => { if (!open) setLaunchBranch(null); }}
          worktreePath={launchBranch?.worktree_path ?? ''}
          branchName={launchBranch?.name ?? ''}
          projectId={selectedProjectId ?? undefined}
          projectPath={project.path}
          onLaunch={handleLaunchConfirm}
        />
      </div>
    );
  }

  const dashboardContent = (
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
        sessionCounts={getSessionCounts()}
        selectedCount={selectedBranches.size}
        batchMode={batchMode}
        onToggleBatchMode={() => { setBatchMode(!batchMode); setSelectedBranches(new Set()); }}
        onBatchLaunch={() => setShowBatchLaunch(true)}
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
            selectedBranches={new Set()}
            onSelectionChange={() => {}}
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
            selectedBranches={selectedBranches}
            onSelectionChange={setSelectedBranches}
            showSelection={batchMode}
          />
        )}
      </div>
      <div className="mt-4 mb-4">
        <MergeHistory />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {hasAnyTabs() ? (
        <ResizablePanelGroup orientation="vertical" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={20}>
            {dashboardContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={15} collapsible>
            <TerminalPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        dashboardContent
      )}
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
      <LaunchDialog
        open={!!launchBranch}
        onOpenChange={(open) => { if (!open) setLaunchBranch(null); }}
        worktreePath={launchBranch?.worktree_path ?? ''}
        branchName={launchBranch?.name ?? ''}
        projectId={selectedProjectId ?? undefined}
        projectPath={project.path}
        onLaunch={handleLaunchConfirm}
      />
      <BatchLaunchDialog
        open={showBatchLaunch}
        onOpenChange={setShowBatchLaunch}
        branches={branches.filter((b) => selectedBranches.has(b.worktree_path))}
        projectId={selectedProjectId ?? undefined}
        projectPath={project.path}
        onLaunch={handleBatchLaunch}
      />
    </div>
  );
}
