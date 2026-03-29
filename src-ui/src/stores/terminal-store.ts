import { create } from 'zustand';

export interface TerminalTab {
  id: string;
  worktreePath: string;
  branchName: string;
  isConnected: boolean;
  createdAt: number;
}

interface TerminalStoreState {
  tabs: Map<string, TerminalTab>;
  activeTabId: string | null;

  // Derived
  hasAnyTabs: () => boolean;

  // Actions
  addTab: (worktreePath: string, branchName: string) => string;
  activateTab: (tabId: string, terminalId: string) => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setTabConnected: (tabId: string, connected: boolean) => void;
  getTabForWorktree: (worktreePath: string) => TerminalTab | undefined;
}

export const useTerminalStore = create<TerminalStoreState>()((set, get) => ({
  tabs: new Map<string, TerminalTab>(),
  activeTabId: null,

  hasAnyTabs: () => get().tabs.size > 0,

  addTab: (worktreePath: string, branchName: string) => {
    const pendingId = `pending-${crypto.randomUUID()}`;
    const tab: TerminalTab = {
      id: pendingId,
      worktreePath,
      branchName,
      isConnected: false,
      createdAt: Date.now(),
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
    const activated: TerminalTab = { ...tab, id: terminalId, isConnected: true };
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
    next.set(tabId, { ...tab, isConnected: connected });
    set({ tabs: next });
  },

  getTabForWorktree: (worktreePath: string) => {
    for (const tab of get().tabs.values()) {
      if (tab.worktreePath === worktreePath) return tab;
    }
    return undefined;
  },
}));
