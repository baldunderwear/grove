import { useEffect } from 'react';
import { useConfigStore } from '@/stores/config-store';
import { useBranchStore } from '@/stores/branch-store';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+R or F5: refresh branches
      if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        const state = useConfigStore.getState();
        const project = state.config?.projects?.find(
          (p) => p.id === state.selectedProjectId
        );
        if (project) {
          useBranchStore.getState().manualRefresh(
            project.path,
            project.branch_prefix ?? '',
            project.merge_target ?? 'main'
          );
        }
      }
      // Ctrl+N: new worktree
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('grove:new-worktree'));
      }
      // Ctrl+,: settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        useConfigStore.getState().showSettings();
      }
      // Escape: close dialog
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('grove:close-dialog'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
