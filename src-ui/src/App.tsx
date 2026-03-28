import { useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/layout/Sidebar';
import { AllProjects } from '@/pages/AllProjects';
import { Dashboard } from '@/pages/Dashboard';
import { EmptyState } from '@/pages/EmptyState';
import { ProjectConfig } from '@/pages/ProjectConfig';
import { Settings } from '@/pages/Settings';
import { useConfigStore } from '@/stores/config-store';
import { UpdateChecker } from '@/components/UpdateChecker';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function App() {
  const activeView = useConfigStore((s) => s.activeView);
  const addProject = useConfigStore((s) => s.addProject);

  useKeyboardShortcuts();

  useEffect(() => {
    useConfigStore.getState().loadConfig();
  }, []);

  // Listen for tray events: launch-worktree and navigate
  useEffect(() => {
    const unlistenLaunch = listen<string>('launch-worktree', async (event) => {
      try {
        await invoke('launch_session', {
          worktreePath: event.payload,
          branchName: '',
          launchFlags: [],
        });
      } catch (e) {
        console.error('Failed to launch worktree from tray:', e);
      }
    });
    const unlistenNavigate = listen<string>('navigate', (event) => {
      if (event.payload === 'settings') {
        useConfigStore.getState().showSettings();
      }
    });
    return () => {
      unlistenLaunch.then((fn) => fn());
      unlistenNavigate.then((fn) => fn());
    };
  }, []);

  const handleAddProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    });
    if (selected) {
      try {
        await addProject(selected as string);
      } catch {
        // error is already in store.error
      }
    }
  };

  return (
    <TooltipProvider>
      <UpdateChecker />
      <div className="flex h-screen" style={{ background: 'var(--grove-void)' }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {activeView === 'empty' && (
            <EmptyState onAddProject={handleAddProject} />
          )}
          {activeView === 'all-projects' && <AllProjects />}
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'project' && <ProjectConfig />}
          {activeView === 'settings' && <Settings />}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
