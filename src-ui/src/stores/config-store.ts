import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, BuildFileConfig, ChangelogConfig, HealthStatus, Settings } from '@/types/config';

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;
  activeView: 'dashboard' | 'project' | 'settings' | 'empty';

  // Actions
  loadConfig: () => Promise<void>;
  addProject: (path: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: {
    name?: string;
    merge_target?: string;
    branch_prefix?: string;
    build_files?: BuildFileConfig[];
    changelog?: ChangelogConfig | null;
  }) => Promise<void>;
  updateSettings: (updates: Partial<Pick<Settings, 'refresh_interval' | 'start_minimized' | 'start_with_windows'>>) => Promise<void>;
  checkHealth: (path: string, mergeTarget: string) => Promise<HealthStatus>;
  selectProject: (id: string) => void;
  showProjectConfig: () => void;
  showSettings: () => void;
}

export const useConfigStore = create<ConfigState>()((set) => ({
  config: null,
  loading: false,
  error: null,
  selectedProjectId: null,
  activeView: 'empty',

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await invoke<AppConfig>('get_config');
      const activeView = config.projects.length === 0 ? 'empty' : 'dashboard';
      const selectedProjectId = config.projects.length > 0 ? config.projects[0].id : null;
      set({ config, loading: false, activeView, selectedProjectId });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addProject: async (path: string) => {
    set({ error: null });
    try {
      const config = await invoke<AppConfig>('add_project', { path });
      const newProject = config.projects[config.projects.length - 1];
      set({ config, selectedProjectId: newProject.id, activeView: 'dashboard' });
    } catch (e) {
      set({ error: String(e) });
      throw e; // re-throw so UI can handle
    }
  },

  removeProject: async (id: string) => {
    try {
      const config = await invoke<AppConfig>('remove_project', { id });
      const activeView = config.projects.length === 0 ? 'empty' : 'dashboard';
      const selectedProjectId = config.projects.length > 0 ? config.projects[0].id : null;
      set({ config, selectedProjectId, activeView, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateProject: async (id: string, updates) => {
    try {
      const config = await invoke<AppConfig>('update_project', { id, ...updates });
      set({ config, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateSettings: async (updates) => {
    try {
      const config = await invoke<AppConfig>('update_settings', updates);
      set({ config, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  checkHealth: async (path: string, mergeTarget: string) => {
    return invoke<HealthStatus>('check_project_health', { path, mergeTarget });
  },

  selectProject: (id: string) => {
    set({ selectedProjectId: id, activeView: 'dashboard' });
  },

  showProjectConfig: () => {
    set({ activeView: 'project' });
  },

  showSettings: () => {
    set({ selectedProjectId: null, activeView: 'settings' });
  },
}));
