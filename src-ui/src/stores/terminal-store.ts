import { create } from 'zustand';
import { fireSessionAlert } from '@/lib/alerts';

export type SessionState = "working" | "waiting" | "idle" | "error" | null;

export interface TerminalTab {
  id: string;
  worktreePath: string;
  branchName: string;
  projectId?: string;
  isConnected: boolean;
  createdAt: number;
  sessionState: SessionState;
  initialPrompt?: string;
  contextFiles?: string[];
  lastLines: string[];
}

export interface LaunchOptions {
  prompt?: string;
  contextFiles?: string[];
}

interface SessionCounts {
  working: number;
  waiting: number;
  idle: number;
  error: number;
}

interface TerminalStoreState {
  tabs: Map<string, TerminalTab>;
  activeTabId: string | null;
  focusedSessionId: string | null;

  // Derived
  hasAnyTabs: () => boolean;
  getSessionCounts: () => SessionCounts;

  // Actions
  addTab: (worktreePath: string, branchName: string, projectId?: string, launchOptions?: LaunchOptions) => string;
  clearInitialPrompt: (tabId: string) => void;
  activateTab: (tabId: string, terminalId: string) => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setTabConnected: (tabId: string, connected: boolean) => void;
  setTabState: (tabId: string, state: SessionState) => void;
  getTabForWorktree: (worktreePath: string) => TerminalTab | undefined;
  focusSession: (tabId: string) => void;
  unfocusSession: () => void;
  appendOutput: (tabId: string, data: string) => void;
}

export const useTerminalStore = create<TerminalStoreState>()((set, get) => ({
  tabs: new Map<string, TerminalTab>(),
  activeTabId: null,
  focusedSessionId: null,

  hasAnyTabs: () => get().tabs.size > 0,

  getSessionCounts: () => {
    const counts: SessionCounts = { working: 0, waiting: 0, idle: 0, error: 0 };
    for (const tab of get().tabs.values()) {
      if (tab.sessionState && tab.sessionState in counts) {
        counts[tab.sessionState as keyof SessionCounts]++;
      }
    }
    return counts;
  },

  addTab: (worktreePath: string, branchName: string, projectId?: string, launchOptions?: LaunchOptions) => {
    const pendingId = `pending-${crypto.randomUUID()}`;
    const tab: TerminalTab = {
      id: pendingId,
      worktreePath,
      branchName,
      projectId,
      isConnected: false,
      createdAt: Date.now(),
      sessionState: null,
      initialPrompt: launchOptions?.prompt,
      contextFiles: launchOptions?.contextFiles,
      lastLines: [],
    };
    const next = new Map(get().tabs);
    next.set(pendingId, tab);
    set({ tabs: next, activeTabId: pendingId });
    return pendingId;
  },

  clearInitialPrompt: (tabId: string) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;
    const next = new Map(current);
    next.set(tabId, { ...tab, initialPrompt: undefined });
    set({ tabs: next });
  },

  activateTab: (tabId: string, terminalId: string) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    const next = new Map(current);
    next.delete(tabId);
    const activated: TerminalTab = { ...tab, id: terminalId, isConnected: true, sessionState: tab.sessionState, lastLines: tab.lastLines };
    next.set(terminalId, activated);

    set({
      tabs: next,
      activeTabId: get().activeTabId === tabId ? terminalId : get().activeTabId,
    });
  },

  switchTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  closeTab: (tabId: string) => {
    const current = get().tabs;
    const next = new Map(current);
    next.delete(tabId);

    let newActiveId: string | null = null;
    if (get().activeTabId === tabId) {
      // Switch to most recently created remaining tab
      if (next.size > 0) {
        let mostRecent: TerminalTab | null = null;
        for (const t of next.values()) {
          if (!mostRecent || t.createdAt > mostRecent.createdAt) {
            mostRecent = t;
          }
        }
        newActiveId = mostRecent?.id ?? null;
      }
    } else {
      newActiveId = get().activeTabId;
    }

    set({ tabs: next, activeTabId: newActiveId });
  },

  setTabConnected: (tabId: string, connected: boolean) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    const next = new Map(current);
    next.set(tabId, {
      ...tab,
      isConnected: connected,
      sessionState: connected ? tab.sessionState : null,
    });
    set({ tabs: next });
  },

  setTabState: (tabId: string, state: SessionState) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    const oldState = tab.sessionState;
    const next = new Map(current);
    next.set(tabId, { ...tab, sessionState: state });
    set({ tabs: next });

    // Fire toast alert on state transitions to waiting/idle/error
    if (state !== oldState && (state === 'waiting' || state === 'idle' || state === 'error')) {
      fireSessionAlert(tabId, tab.branchName, state);
    }
  },

  getTabForWorktree: (worktreePath: string) => {
    for (const tab of get().tabs.values()) {
      if (tab.worktreePath === worktreePath) return tab;
    }
    return undefined;
  },

  focusSession: (tabId: string) => {
    set({ focusedSessionId: tabId, activeTabId: tabId });
  },

  unfocusSession: () => {
    set({ focusedSessionId: null });
  },

  appendOutput: (tabId: string, data: string) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    // Strip ANSI escape codes for the text preview
    const stripped = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
    // Split into lines, append to existing, keep last 12
    const newLines = stripped.split(/\r?\n/);
    const combined = [...tab.lastLines];
    if (combined.length > 0 && newLines.length > 0) {
      // Append first new segment to last existing line (continuation)
      combined[combined.length - 1] += newLines[0];
      combined.push(...newLines.slice(1));
    } else {
      combined.push(...newLines);
    }
    const trimmed = combined.slice(-12);

    const next = new Map(current);
    next.set(tabId, { ...tab, lastLines: trimmed });
    set({ tabs: next });
  },
}));
