import { useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/layout/Sidebar';
import { EmptyState } from '@/pages/EmptyState';
import { Settings } from '@/pages/Settings';
import { useConfigStore } from '@/stores/config-store';

function App() {
  const activeView = useConfigStore((s) => s.activeView);
  const addProject = useConfigStore((s) => s.addProject);

  useEffect(() => {
    useConfigStore.getState().loadConfig();
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
      <div className="flex h-screen bg-gray-950">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {activeView === 'empty' && (
            <EmptyState onAddProject={handleAddProject} />
          )}
          {activeView === 'project' && (
            <div className="p-8 text-gray-50">
              {/* ProjectConfig — implemented in Task 2 */}
              <p>Loading project config...</p>
            </div>
          )}
          {activeView === 'settings' && <Settings />}
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
