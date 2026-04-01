import { invoke } from '@tauri-apps/api/core';

export async function openInVscode(worktreePath: string): Promise<void> {
  await invoke<void>('open_in_vscode', { worktreePath });
}

export async function openInExplorer(worktreePath: string): Promise<void> {
  await invoke<void>('open_in_explorer', { worktreePath });
}
