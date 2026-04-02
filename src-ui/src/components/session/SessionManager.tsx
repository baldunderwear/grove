import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { ArrowLeft, X, Clock, GitBranch, Code, FolderOpen, Plus, RefreshCw, Settings, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTerminal } from '@/hooks/useTerminal';
import { useTerminalStore } from '@/stores/terminal-store';
import { useBranchStore } from '@/stores/branch-store';
import { useConfigStore } from '@/stores/config-store';
import { useSessionStore } from '@/stores/session-store';
import { SessionCard } from './SessionCard';
import { fireWaitingAlert } from '@/lib/alerts';
import type { SessionState, TerminalTab } from '@/stores/terminal-store';
import type { BranchInfo } from '@/types/branch';

type TerminalEvent =
  | { type: 'Data'; data: string }
  | { type: 'Exit'; code: number | null }
  | { type: 'Error'; message: string };

// ─────────────────────────────────────────────
// TerminalInstance — one per session, always mounted
// ─────────────────────────────────────────────
function TerminalInstance({ tab, isVisible }: { tab: TerminalTab; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const autoSendDoneRef = useRef(false);
  const { activateTab, setTabConnected, setTabExited, setTabDisconnected, clearInitialPrompt, appendOutput } = useTerminalStore();

  const onData = useCallback((data: string) => {
    const id = terminalIdRef.current;
    if (id) {
      invoke('terminal_write', { terminalId: id, data }).catch(() => {});
    }
  }, []);

  const onResize = useCallback((cols: number, rows: number) => {
    const id = terminalIdRef.current;
    if (id) {
      invoke('terminal_resize', { terminalId: id, cols, rows }).catch(() => {});
    }
  }, []);

  const { write, refit } = useTerminal(containerRef, { onData, onResize });

  // Refit when becoming visible
  useEffect(() => {
    if (isVisible) {
      refit();
    }
  }, [isVisible, refit]);

  // Spawn PTY on mount
  useEffect(() => {
    let cancelled = false;

    const onEvent = new Channel<TerminalEvent>();
    onEvent.onmessage = (event: TerminalEvent) => {
      if (cancelled) return;
      switch (event.type) {
        case 'Data':
          write(event.data);
          // Feed last-lines store for card previews
          // Use terminalIdRef (real ID after activation) or fall back to original tab.id
          appendOutput(terminalIdRef.current ?? tab.id, event.data);
          if (!autoSendDoneRef.current) {
            autoSendDoneRef.current = true;
            const currentTab = useTerminalStore.getState().tabs.get(tab.id);
            const pendingPrompt = currentTab?.initialPrompt;
            if (pendingPrompt) {
              clearInitialPrompt(tab.id);
              setTimeout(async () => {
                const id = terminalIdRef.current;
                if (!id) return;
                let fullPrompt = pendingPrompt;
                const contextFiles = currentTab?.contextFiles ?? [];
                if (contextFiles.length > 0) {
                  const fileParts: string[] = [];
                  for (const filePath of contextFiles) {
                    try {
                      const content = await invoke<string>('read_text_file', { path: filePath });
                      fileParts.push(`<file path="${filePath}">\n${content}\n</file>`);
                    } catch { /* skip */ }
                  }
                  if (fileParts.length > 0) {
                    fullPrompt = fileParts.join('\n\n') + '\n\n' + pendingPrompt;
                  }
                }
                invoke('terminal_write', { terminalId: id, data: fullPrompt + '\n' }).catch(() => {});
              }, 2000);
            }
          }
          break;
        case 'Exit':
          write(`\r\n\x1b[90m[Process exited: ${event.code ?? '?'}]\x1b[0m\r\n`);
          if (terminalIdRef.current) {
            setTabExited(terminalIdRef.current, event.code ?? null);
          }
          break;
        case 'Error':
          write(`\r\n\x1b[31m[${event.message}]\x1b[0m\r\n`);
          if (terminalIdRef.current) {
            setTabDisconnected(terminalIdRef.current);
          }
          break;
      }
    };

    invoke<string>('terminal_spawn', {
      workingDir: tab.worktreePath,
      cols: 80,
      rows: 24,
      projectId: tab.projectId ?? null,
      onEvent,
    })
      .then((id) => {
        if (cancelled) {
          invoke('terminal_kill', { terminalId: id }).catch(() => {});
          return;
        }
        terminalIdRef.current = id;
        activateTab(tab.id, id);
      })
      .catch((err) => {
        if (!cancelled) {
          write(`\r\n\x1b[31m[Spawn failed: ${err}]\x1b[0m\r\n`);
        }
      });

    return () => {
      cancelled = true;
      const id = terminalIdRef.current;
      if (id) {
        invoke('terminal_kill', { terminalId: id }).catch(() => {});
        terminalIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.worktreePath]);

  return (
    <div
      className="absolute inset-0"
      style={{ display: isVisible ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

// ─────────────────────────────────────────────
// FocusBar — top bar in focus mode
// ─────────────────────────────────────────────
function FocusTopBar({ tab, onBack, onClose }: { tab: TerminalTab; onBack: () => void; onClose: () => void }) {
  const openInVscode = useSessionStore((s) => s.openInVscode);
  const openInExplorer = useSessionStore((s) => s.openInExplorer);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const state = tab.sessionState;
  const stateColors: Record<string, string> = {
    working: 'text-emerald-400',
    waiting: 'text-amber-400',
    idle: 'text-zinc-500',
    error: 'text-red-400',
  };

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--grove-canopy)]"
         style={{ background: 'var(--grove-deep)' }}>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-[var(--grove-stone)] hover:text-[var(--grove-white)]"
          title="Back to grid (Esc)"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${
            state === 'working' ? 'bg-emerald-400 animate-pulse'
              : state === 'waiting' ? 'bg-amber-400'
              : state === 'error' ? 'bg-red-500'
              : 'bg-zinc-500'
          }`} />
          <span className="text-sm font-semibold text-[var(--grove-white)]">{tab.branchName}</span>
          {state && (
            <span className={`text-xs ${stateColors[state] ?? 'text-zinc-500'}`}>
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--grove-stone)] flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(tab.createdAt)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openInVscode(tab.worktreePath)}
          className="text-xs text-[var(--grove-stone)] hover:text-[var(--grove-fog)] gap-1"
        >
          <Code className="h-3.5 w-3.5" />
          VS Code
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openInExplorer(tab.worktreePath)}
          className="text-xs text-[var(--grove-stone)] hover:text-[var(--grove-fog)] gap-1"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Explorer
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-[var(--grove-stone)] hover:text-red-400"
          title="Close session"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FocusBottomBar — git context
// ─────────────────────────────────────────────
function FocusBottomBar({ tab }: { tab: TerminalTab }) {
  const branches = useBranchStore((s) => s.branches);
  const branchInfo = branches.find((b) => b.worktree_path === tab.worktreePath);
  if (!branchInfo) return null;

  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-1.5 text-xs border-t border-[var(--grove-canopy)]"
         style={{ background: 'var(--grove-deep)' }}>
      <span className="flex items-center gap-1 text-[var(--grove-stone)]">
        <GitBranch className="h-3 w-3" />
        {branchInfo.name}
      </span>
      {branchInfo.ahead > 0 && <span className="text-emerald-400">{branchInfo.ahead} ahead</span>}
      {branchInfo.behind > 0 && <span className="text-amber-400">{branchInfo.behind} behind</span>}
      <span className={branchInfo.is_dirty ? 'text-amber-300' : 'text-[var(--grove-stone)]'}>
        {branchInfo.is_dirty ? 'modified' : 'clean'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// SessionManager — the main component
// ─────────────────────────────────────────────
export function SessionManager() {
  const config = useConfigStore((s) => s.config);
  const selectedProjectId = useConfigStore((s) => s.selectedProjectId);
  const showProjectConfig = useConfigStore((s) => s.showProjectConfig);

  const branches = useBranchStore((s) => s.branches);
  const loading = useBranchStore((s) => s.loading);
  const refreshing = useBranchStore((s) => s.refreshing);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const silentRefresh = useBranchStore((s) => s.silentRefresh);
  const manualRefresh = useBranchStore((s) => s.manualRefresh);

  const tabs = useTerminalStore((s) => s.tabs);
  const focusedSessionId = useTerminalStore((s) => s.focusedSessionId);
  const addTab = useTerminalStore((s) => s.addTab);
  const focusSession = useTerminalStore((s) => s.focusSession);
  const unfocusSession = useTerminalStore((s) => s.unfocusSession);
  const setTabState = useTerminalStore((s) => s.setTabState);
  const getSessionCounts = useTerminalStore((s) => s.getSessionCounts);
  const getTabForWorktree = useTerminalStore((s) => s.getTabForWorktree);

  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');

  const project = config?.projects.find((p) => p.id === selectedProjectId);
  const settings = config?.settings;

  // ── Effects ──

  // Fetch branches on project load
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      fetchBranches(project.path, project.branch_prefix, project.merge_target);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.path, project?.branch_prefix, project?.merge_target]);

  // Auto-refresh
  useEffect(() => {
    if (!project) return;
    const intervalMs = (settings?.refresh_interval ?? 60) * 1000;
    const timer = setInterval(() => {
      silentRefresh(project.path, project.branch_prefix, project.merge_target);
    }, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, project?.branch_prefix, project?.merge_target, settings?.refresh_interval]);

  // Git file watcher
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const unlistenPromise = listen<{ project_path: string; change_type: string }>(
      'git-changed',
      (event) => {
        if (cancelled) return;
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

  // Session state changes — alerts
  useEffect(() => {
    let cancelled = false;
    const unlistenPromise = listen<{ terminal_id: string; state: string; timestamp: number }>(
      'session-state-changed',
      (event) => {
        if (cancelled) return;
        const { terminal_id, state } = event.payload;
        const prevTab = useTerminalStore.getState().tabs.get(terminal_id);
        const prevState = prevTab?.sessionState;
        setTabState(terminal_id, state as SessionState);

        if (state === 'waiting' && prevState !== 'waiting') {
          fireWaitingAlert();
          const tab = useTerminalStore.getState().tabs.get(terminal_id);
          try {
            sendNotification({
              title: 'Waiting for input',
              body: `${tab?.branchName ?? 'Session'} needs your attention`,
            });
          } catch { /* notification not available */ }
        }
      },
    );
    return () => {
      cancelled = true;
      unlistenPromise.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape key to unfocus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusedSessionId) {
        unfocusSession();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedSessionId, unfocusSession]);

  // ── Handlers ──

  const handleQuickLaunch = useCallback((branch: BranchInfo) => {
    const existing = getTabForWorktree(branch.worktree_path);
    if (existing) {
      focusSession(existing.id);
    } else {
      addTab(branch.worktree_path, branch.name, selectedProjectId ?? undefined);
      // Auto-focus the new session
      setTimeout(() => {
        const store = useTerminalStore.getState();
        // Find the tab (may have been activated with a new ID)
        for (const t of store.tabs.values()) {
          if (t.worktreePath === branch.worktree_path) {
            focusSession(t.id);
            break;
          }
        }
      }, 500);
    }
    setShowBranchPicker(false);
    setBranchFilter('');
  }, [addTab, focusSession, getTabForWorktree, selectedProjectId]);

  const handleClose = useCallback((tabId: string) => {
    const tab = useTerminalStore.getState().tabs.get(tabId);
    if (tab && !tab.id.startsWith('pending-')) {
      invoke('terminal_kill', { terminalId: tab.id }).catch(() => {});
    }
    useTerminalStore.getState().closeTab(tabId);
    if (focusedSessionId === tabId) {
      unfocusSession();
    }
  }, [focusedSessionId, unfocusSession]);

  if (!project) return null;

  const tabArray = [...tabs.values()];
  const counts = getSessionCounts();
  const totalActive = counts.working + counts.waiting + counts.idle + counts.error;
  const focusedTab = focusedSessionId ? tabs.get(focusedSessionId) : null;

  const availableBranches = branches.filter((b) => {
    if (getTabForWorktree(b.worktree_path)) return false;
    if (branchFilter) return b.name.toLowerCase().includes(branchFilter.toLowerCase());
    return true;
  });

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Grid View ── */}
      <div
        className="flex flex-col h-full"
        style={{ display: focusedTab ? 'none' : 'flex' }}
      >
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--grove-white)] tracking-tight">
                {project.name}
              </h2>
              <div className="flex items-center gap-3 mt-1.5">
                {totalActive > 0 ? (
                  <div className="flex items-center gap-2.5 text-xs">
                    {counts.working > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {counts.working} working
                      </span>
                    )}
                    {counts.waiting > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {counts.waiting} waiting
                      </span>
                    )}
                    {counts.idle > 0 && (
                      <span className="flex items-center gap-1 text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                        {counts.idle} idle
                      </span>
                    )}
                    {counts.error > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {counts.error} error
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[var(--grove-stone)]">
                    {loading ? 'Loading branches...' : `${branches.length} branches available`}
                  </span>
                )}
                {refreshing && <RefreshCw className="h-3 w-3 text-[var(--grove-stone)] animate-spin" />}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => project && manualRefresh(project.path, project.branch_prefix, project.merge_target)}
                className="text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
                title="Refresh branches"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={showProjectConfig}
                className="text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
                title="Project settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Button
                  onClick={() => setShowBranchPicker(!showBranchPicker)}
                  className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)] font-semibold gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Session
                </Button>
                {showBranchPicker && (
                  <BranchPicker
                    branches={availableBranches}
                    loading={loading}
                    filter={branchFilter}
                    onFilterChange={setBranchFilter}
                    onSelect={handleQuickLaunch}
                    onClose={() => { setShowBranchPicker(false); setBranchFilter(''); }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tabArray.length === 0 ? (
            <EmptyState branchCount={branches.length} loading={loading} onNewSession={() => setShowBranchPicker(true)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 auto-rows-[260px]">
              {tabArray.map((t) => (
                <SessionCard
                  key={t.id}
                  tab={t}
                  lastLines={t.lastLines}
                  onFocus={focusSession}
                  onClose={handleClose}
                />
              ))}
              <button
                className="rounded-xl border-2 border-dashed border-[var(--grove-canopy)] flex flex-col items-center justify-center gap-3
                           hover:border-[var(--grove-moss)] hover:bg-[var(--grove-deep)] transition-all group cursor-pointer"
                onClick={() => setShowBranchPicker(true)}
              >
                <div className="h-12 w-12 rounded-full bg-[var(--grove-canopy)] flex items-center justify-center group-hover:bg-[var(--grove-moss)] transition-colors">
                  <Plus className="h-6 w-6 text-[var(--grove-sprout)]" />
                </div>
                <span className="text-sm text-[var(--grove-stone)] group-hover:text-[var(--grove-fog)] transition-colors">
                  New Session
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Focus View ── */}
      {focusedTab && (
        <div className="flex flex-col h-full" style={{ background: 'var(--grove-void)' }}>
          <FocusTopBar tab={focusedTab} onBack={unfocusSession} onClose={() => handleClose(focusedTab.id)} />
          <div className="flex-1 min-h-0 relative">
            {tabArray.map((t) => (
              <TerminalInstance key={t.id} tab={t} isVisible={t.id === focusedSessionId} />
            ))}
          </div>
          <FocusBottomBar tab={focusedTab} />
        </div>
      )}

      {/* ── Terminal instances (hidden, for non-focused sessions in grid mode) ── */}
      {!focusedTab && (
        <div className="hidden">
          {tabArray.map((t) => (
            <TerminalInstance key={t.id} tab={t} isVisible={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Branch Picker Dropdown
// ─────────────────────────────────────────────
function BranchPicker({
  branches, loading, filter, onFilterChange, onSelect, onClose,
}: {
  branches: BranchInfo[];
  loading: boolean;
  filter: string;
  onFilterChange: (v: string) => void;
  onSelect: (b: BranchInfo) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-[var(--grove-canopy)] shadow-2xl shadow-black/50 overflow-hidden"
           style={{ background: 'var(--grove-deep)' }}>
        <div className="p-3 border-b border-[var(--grove-canopy)]">
          <input
            type="text"
            placeholder="Filter branches..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--grove-canopy)] bg-[var(--grove-void)] text-[var(--grove-fog)] placeholder:text-[var(--grove-stone)] focus:outline-none focus:border-[var(--grove-moss)]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && branches.length > 0) onSelect(branches[0]);
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-[var(--grove-stone)]">Loading...</div>
          ) : branches.length === 0 ? (
            <div className="p-4 text-center text-sm text-[var(--grove-stone)]">
              {filter ? 'No matching branches' : 'All branches have active sessions'}
            </div>
          ) : (
            branches.map((b) => (
              <button
                key={b.worktree_path}
                className="w-full px-4 py-2.5 text-left hover:bg-[var(--grove-canopy)] transition-colors flex items-center gap-3"
                onClick={() => onSelect(b)}
              >
                <GitBranch className="h-3.5 w-3.5 text-[var(--grove-fern)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--grove-fog)] truncate">{b.name}</div>
                  <div className="text-[10px] text-[var(--grove-stone)] flex items-center gap-2 mt-0.5">
                    {b.ahead > 0 && <span className="text-emerald-400">{b.ahead} ahead</span>}
                    {b.behind > 0 && <span className="text-amber-400">{b.behind} behind</span>}
                    {b.is_dirty && <span className="text-amber-300">modified</span>}
                    {!b.is_dirty && b.ahead === 0 && b.behind === 0 && <span>clean</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────
function EmptyState({ branchCount, loading, onNewSession }: { branchCount: number; loading: boolean; onNewSession: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="relative mb-8">
        <div className="absolute inset-0 -m-8 rounded-full border border-[var(--grove-canopy)] animate-ping opacity-20" />
        <div className="absolute inset-0 -m-4 rounded-full border border-[var(--grove-canopy)] opacity-30" />
        <div className="h-20 w-20 rounded-full bg-[var(--grove-forest)] flex items-center justify-center">
          <Zap className="h-10 w-10 text-[var(--grove-leaf)]" />
        </div>
      </div>
      <h3 className="text-xl font-semibold text-[var(--grove-white)] mb-2">No active sessions</h3>
      <p className="text-sm text-[var(--grove-stone)] mb-6 text-center max-w-sm">
        {loading ? 'Loading branches...' : `${branchCount} branches ready. Launch a session to start working.`}
      </p>
      <Button
        onClick={onNewSession}
        className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)] font-semibold gap-2 px-6"
        disabled={loading || branchCount === 0}
      >
        <Plus className="h-4 w-4" />
        Launch Session
      </Button>
    </div>
  );
}

// ── Helpers ──

function formatDuration(createdAt: number): string {
  const elapsed = Math.floor((Date.now() - createdAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}
