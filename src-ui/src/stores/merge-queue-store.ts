// Merge queue store -- manages multi-branch queue lifecycle (Phase 17)

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { fireMergeQueueToast, completeMergeQueueToast, failMergeQueueToast } from '@/lib/alerts';
import type { QueueBranch, QueueProgress, QueueResult, QueueStep } from '@/types/merge';
import type { BuildFileConfig, ChangelogConfig } from '@/types/config';

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

interface MergeQueueState {
  branches: QueueBranch[];
  step: QueueStep;
  currentIndex: number;
  error: string | null;

  // Actions
  setBranches: (branches: QueueBranch[]) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  removeBranch: (name: string) => void;
  startQueue: (
    projectPath: string,
    mergeTarget: string,
    buildPatterns: BuildFileConfig[],
    changelogConfig: ChangelogConfig | null,
  ) => Promise<void>;
  updateProgress: (progress: QueueProgress) => void;
  reset: () => void;
}

export const useMergeQueueStore = create<MergeQueueState>()((set, get) => ({
  branches: [],
  step: 'idle',
  currentIndex: 0,
  error: null,

  setBranches: (branches) => {
    set({ branches, step: 'ready', currentIndex: 0, error: null });
  },

  reorder: (fromIndex, toIndex) => {
    set({ branches: arrayMove(get().branches, fromIndex, toIndex) });
  },

  removeBranch: (name) => {
    const remaining = get().branches.filter((b) => b.name !== name);
    if (remaining.length < 2) {
      set({ branches: [], step: 'idle', currentIndex: 0, error: null });
    } else {
      set({ branches: remaining });
    }
  },

  startQueue: async (projectPath, mergeTarget, buildPatterns, changelogConfig) => {
    set({ step: 'executing', error: null });

    let unlisten: (() => void) | null = null;

    try {
      // Set up event listener BEFORE invoking the command (so no events are missed)
      unlisten = await listen<QueueProgress>('merge-queue-progress', (event) => {
        get().updateProgress(event.payload);
        if (event.payload.status === 'active') {
          fireMergeQueueToast(
            event.payload.index + 1,
            event.payload.total,
            event.payload.branch,
          );
        }
      });

      const branchNames = get().branches.map((b) => b.name);

      const result = await invoke<QueueResult>('merge_queue_execute', {
        projectPath,
        projectName: '',
        branches: branchNames,
        mergeTarget,
        buildPatterns,
        changelogConfig,
      });

      if (result.success) {
        completeMergeQueueToast(result.total);
        set({ step: 'success' });
      } else {
        failMergeQueueToast(result.failed_branch!, result.completed + 1, result.total);
        set({ step: 'failure', error: result.error });
      }
    } catch (e) {
      const errorMsg = String(e);
      failMergeQueueToast('unknown', 0, get().branches.length);
      set({ step: 'failure', error: errorMsg });
    } finally {
      if (unlisten) unlisten();
    }
  },

  updateProgress: (progress) => {
    set((state) => {
      const branches = state.branches.map((b, i) =>
        i === progress.index ? { ...b, status: progress.status } : b,
      );
      return { branches, currentIndex: progress.index };
    });
  },

  reset: () => {
    set({ branches: [], step: 'idle', currentIndex: 0, error: null });
  },
}));
