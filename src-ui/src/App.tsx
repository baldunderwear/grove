import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/layout/Sidebar';
import { AllProjects } from '@/pages/AllProjects';
import { SessionManager } from '@/components/session/SessionManager';
import { EmptyState } from '@/pages/EmptyState';
import { ProjectConfig } from '@/pages/ProjectConfig';
import { Settings } from '@/pages/Settings';
import { ConfigEditors } from '@/pages/ConfigEditors';
import { AddProjectWizard } from '@/components/AddProjectWizard';
import { useConfigStore } from '@/stores/config-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { UpdateChecker } from '@/components/UpdateChecker';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function App() {
  const activeView = useConfigStore((s) => s.activeView);
  const [emptyWizardOpen, setEmptyWizardOpen] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    useConfigStore.getState().loadConfig();
  }, []);

  // Listen for tray events
  useEffect(() => {
    const unlistenLaunch = listen<string>('launch-worktree', (event) => {
      const path = event.payload;
      const branchName = path.split(/[\\/]/).pop() || 'session';
      useTerminalStore.getState().addTab(path, branchName);
      // Navigate to the project dashboard so user sees the embedded terminal
      const config = useConfigStore.getState().config;
      const project = config?.projects.find(p => path.startsWith(p.path));
      if (project) {
        useConfigStore.getState().selectProject(project.id);
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

  return (
    <TooltipProvider>
      <UpdateChecker />
      <AddProjectWizard open={emptyWizardOpen} onClose={() => setEmptyWizardOpen(false)} />
      <div className="flex h-screen" style={{ background: 'var(--grove-void)' }}>
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {activeView === 'empty' && (
            <EmptyState onAddProject={() => setEmptyWizardOpen(true)} />
          )}
          {activeView === 'all-projects' && <AllProjects />}
          {activeView === 'dashboard' && <SessionManager />}
          {activeView === 'project' && <ProjectConfig />}
          {activeView === 'settings' && <Settings />}
          {activeView === 'config' && <ConfigEditors />}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
