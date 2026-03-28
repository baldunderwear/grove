// Merge is local only -- never pushes to remote (FR-04.8)

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { MergePreview, MergeResult, MergeHistoryEntry } from '@/types/merge';
import type { BuildFileConfig, ChangelogConfig } from '@/types/config';

export type MergeStep = 'idle' | 'preview' | 'confirm' | 'executing' | 'summary' | 'error';

let fetchCounter = 0;

interface MergeState {
  preview: MergePreview | null;
  result: MergeResult | null;
  loading: boolean;
  error: string | null;
  step: MergeStep;
  history: MergeHistoryEntry[];

  // Actions
  fetchPreview: (
    projectPath: string,
    sourceBranch: string,
    mergeTarget: string,
    buildPatterns: BuildFileConfig[],
    changelogConfig: ChangelogConfig | null,
  ) => Promise<void>;
  executeMerge: (
    projectPath: string,
    projectName: string,
    sourceBranch: string,
    mergeTarget: string,
    buildPatterns: BuildFileConfig[],
    changelogConfig: ChangelogConfig | null,
  ) => Promise<void>;
  clearOperation: () => void;
  clearHistory: () => void;
}

export const useMergeStore = create<MergeState>()((set, get) => ({
  preview: null,
  result: null,
  loading: false,
  error: null,
  step: 'idle',
  history: [],

  fetchPreview: async (
    projectPath: string,
    sourceBranch: string,
    mergeTarget: string,
    buildPatterns: BuildFileConfig[],
    changelogConfig: ChangelogConfig | null,
  ) => {
    const fetchId = ++fetchCounter;
    set({ loading: true, error: null });
    try {
      const preview = await invoke<MergePreview>('merge_preview', {
        projectPath,
        sourceBranch,
        mergeTarget,
        buildPatterns,
        changelogConfig,
      });
      if (fetchId !== fetchCounter) return; // superseded
      set({ preview, loading: false, step: 'preview' });
    } catch (e) {
      if (fetchId !== fetchCounter) return; // superseded
      set({ error: String(e), loading: false, step: 'error' });
    }
  },

  executeMerge: async (
    projectPath: string,
    projectName: string,
    sourceBranch: string,
    mergeTarget: string,
    buildPatterns: BuildFileConfig[],
    changelogConfig: ChangelogConfig | null,
  ) => {
    set({ step: 'executing', error: null });
    try {
      const result = await invoke<MergeResult>('merge_branch', {
        projectPath,
        projectName,
        sourceBranch,
        mergeTarget,
        buildPatterns,
        changelogConfig,
      });
      const entry: MergeHistoryEntry = {
        source_branch: sourceBranch,
        target_branch: mergeTarget,
        result,
        timestamp: Date.now(),
      };
      const history = [entry, ...get().history].slice(0, 50);
      set({ result, step: 'summary', history });
    } catch (e) {
      set({ error: String(e), step: 'error' });
    }
  },

  clearOperation: () => {
    set({ preview: null, result: null, error: null, step: 'idle' });
  },

  clearHistory: () => {
    set({ history: [] });
  },
}));
