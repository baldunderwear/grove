import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

let pollCounter = 0;

interface SessionStoreState {
  activeSessions: Record<string, number>; // worktree_path -> PID
  polling: boolean;

  // Actions
  fetchSessions: (worktreePaths: string[]) => Promise<void>;
  launchSession: (worktreePath: string, worktreeName: string, launchFlags: string[]) => Promise<number>;
  openInVscode: (worktreePath: string) => Promise<void>;
  openInExplorer: (worktreePath: string) => Promise<void>;
  clear: () => void;
}

export const useSessionStore = create<SessionStoreState>()((set) => ({
  activeSessions: {},
  polling: false,

  fetchSessions: async (worktreePaths: string[]) => {
    const pollId = ++pollCounter;
    set({ polling: true });
    try {
      const result = await invoke<Record<string, number>>('get_active_sessions', {
        worktreePaths,
      });
      if (pollId !== pollCounter) return; // superseded
      set({ activeSessions: result, polling: false });
    } catch {
      if (pollId !== pollCounter) return; // superseded
      set({ polling: false });
    }
  },

  launchSession: async (worktreePath: string, worktreeName: string, launchFlags: string[]) => {
    const pid = await invoke<number>('launch_session', {
      worktreePath,
      worktreeName,
      launchFlags,
    });
    // Immediately refresh sessions to update badges
    const paths = Object.keys(useSessionStore.getState().activeSessions);
    if (!paths.includes(worktreePath)) {
      paths.push(worktreePath);
    }
    // Fire-and-forget refresh
    useSessionStore.getState().fetchSessions(paths);
    return pid;
  },

  openInVscode: async (worktreePath: string) => {
    await invoke<void>('open_in_vscode', { worktreePath });
  },

  openInExplorer: async (worktreePath: string) => {
    await invoke<void>('open_in_explorer', { worktreePath });
  },

  clear: () => {
    set({ activeSessions: {}, polling: false });
  },
}));
