import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { BranchInfo, SortMode } from '@/types/branch';

let fetchCounter = 0;

interface BranchState {
  branches: BranchInfo[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  sortMode: SortMode;
  lastRefreshed: number | null;

  // Actions
  fetchBranches: (path: string, prefix: string, target: string) => Promise<void>;
  silentRefresh: (path: string, prefix: string, target: string) => Promise<void>;
  manualRefresh: (path: string, prefix: string, target: string) => Promise<void>;
  setSortMode: (mode: SortMode) => void;
  clear: () => void;
}

export const useBranchStore = create<BranchState>()((set) => ({
  branches: [],
  loading: false,
  refreshing: false,
  error: null,
  sortMode: 'activity',
  lastRefreshed: null,

  fetchBranches: async (path: string, prefix: string, target: string) => {
    const fetchId = ++fetchCounter;
    set({ loading: true, error: null });
    try {
      const branches = await invoke<BranchInfo[]>('list_branches', {
        projectPath: path,
        branchPrefix: prefix,
        mergeTarget: target,
      });
      if (fetchId !== fetchCounter) return; // superseded
      set({ branches, loading: false, lastRefreshed: Date.now() });
    } catch (e) {
      if (fetchId !== fetchCounter) return; // superseded
      set({ error: String(e), loading: false });
    }
  },

  silentRefresh: async (path: string, prefix: string, target: string) => {
    const fetchId = ++fetchCounter;
    try {
      const branches = await invoke<BranchInfo[]>('list_branches', {
        projectPath: path,
        branchPrefix: prefix,
        mergeTarget: target,
      });
      if (fetchId !== fetchCounter) return; // superseded
      set({ branches, lastRefreshed: Date.now() });
    } catch {
      // Silent refresh -- ignore errors, keep existing data
    }
  },

  manualRefresh: async (path: string, prefix: string, target: string) => {
    const fetchId = ++fetchCounter;
    set({ refreshing: true, error: null });
    try {
      const branches = await invoke<BranchInfo[]>('list_branches', {
        projectPath: path,
        branchPrefix: prefix,
        mergeTarget: target,
      });
      if (fetchId !== fetchCounter) return; // superseded
      set({ branches, refreshing: false, lastRefreshed: Date.now() });
    } catch (e) {
      if (fetchId !== fetchCounter) return; // superseded
      set({ error: String(e), refreshing: false });
    }
  },

  setSortMode: (mode: SortMode) => {
    set({ sortMode: mode });
  },

  clear: () => {
    set({
      branches: [],
      error: null,
      loading: false,
      refreshing: false,
      lastRefreshed: null,
    });
  },
}));
