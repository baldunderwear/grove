import { create } from 'zustand';

export type SessionState = "working" | "waiting" | "idle" | "error" | null;

export interface TerminalTab {
  id: string;
  worktreePath: string;
  branchName: string;
  projectId?: string;
  isConnected: boolean;
  createdAt: number;
  sessionState: SessionState;
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

  // Derived
  hasAnyTabs: () => boolean;
  getSessionCounts: () => SessionCounts;

  // Actions
  addTab: (worktreePath: string, branchName: string, projectId?: string) => string;
  activateTab: (tabId: string, terminalId: string) => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setTabConnected: (tabId: string, connected: boolean) => void;
  setTabState: (tabId: string, state: SessionState) => void;
  getTabForWorktree: (worktreePath: string) => TerminalTab | undefined;
}

export const useTerminalStore = create<TerminalStoreState>()((set, get) => ({
  tabs: new Map<string, TerminalTab>(),
  activeTabId: null,

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

  addTab: (worktreePath: string, branchName: string, projectId?: string) => {
    const pendingId = `pending-${crypto.randomUUID()}`;
    const tab: TerminalTab = {
      id: pendingId,
      worktreePath,
      branchName,
      projectId,
      isConnected: false,
      createdAt: Date.now(),
      sessionState: null,
    };
    const next = new Map(get().tabs);
    next.set(pendingId, tab);
    set({ tabs: next, activeTabId: pendingId });
    return pendingId;
  },

  activateTab: (tabId: string, terminalId: string) => {
    const current = get().tabs;
    const tab = current.get(tabId);
    if (!tab) return;

    const next = new Map(current);
    next.delete(tabId);
    const activated: TerminalTab = { ...tab, id: terminalId, isConnected: true, sessionState: tab.sessionState };
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

    const next = new Map(current);
    next.set(tabId, { ...tab, sessionState: state });
    set({ tabs: next });
  },

  getTabForWorktree: (worktreePath: string) => {
    for (const tab of get().tabs.values()) {
      if (tab.worktreePath === worktreePath) return tab;
    }
    return undefined;
  },
}));
