import { create } from 'zustand';

interface TerminalStoreState {
  /** Current terminal ID (from Rust PTY spawn) */
  activeTerminalId: string | null;
  /** Which worktree path the terminal is open for */
  activeWorktreePath: string | null;
  /** Display name for the toolbar */
  activeBranchName: string | null;
  /** Whether the PTY process is alive */
  isConnected: boolean;

  // Actions
  openTerminal: (terminalId: string, worktreePath: string, branchName: string) => void;
  closeTerminal: () => void;
  setConnected: (connected: boolean) => void;
}

export const useTerminalStore = create<TerminalStoreState>()((set) => ({
  activeTerminalId: null,
  activeWorktreePath: null,
  activeBranchName: null,
  isConnected: false,

  openTerminal: (terminalId: string, worktreePath: string, branchName: string) => {
    set({
      activeTerminalId: terminalId,
      activeWorktreePath: worktreePath,
      activeBranchName: branchName,
      isConnected: true,
    });
  },

  closeTerminal: () => {
    set({
      activeTerminalId: null,
      activeWorktreePath: null,
      activeBranchName: null,
      isConnected: false,
    });
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },
}));
