import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Settings, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConfigStore } from '@/stores/config-store';
import type { HealthStatus } from '@/types/config';

export function Sidebar() {
  const config = useConfigStore((s) => s.config);
  const selectedProjectId = useConfigStore((s) => s.selectedProjectId);
  const activeView = useConfigStore((s) => s.activeView);
  const error = useConfigStore((s) => s.error);
  const addProject = useConfigStore((s) => s.addProject);
  const selectProject = useConfigStore((s) => s.selectProject);
  const showAllProjects = useConfigStore((s) => s.showAllProjects);
  const showSettings = useConfigStore((s) => s.showSettings);
  const checkHealth = useConfigStore((s) => s.checkHealth);

  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({});

  const projects = config?.projects ?? [];

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const results: Record<string, HealthStatus> = {};
      for (const p of projects) {
        try {
          results[p.id] = await checkHealth(p.path, p.merge_target);
        } catch {
          results[p.id] = 'PathNotFound';
        }
      }
      if (!cancelled) {
        setHealthMap(results);
      }
    }
    if (projects.length > 0) {
      check();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length, checkHealth]);

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
    <div className="w-[280px] min-w-[280px] h-full flex flex-col" style={{ background: 'var(--grove-deep)' }}>
      {/* Top section */}
      <div className="p-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--grove-white)' }}>Grove</h1>
        <Button
          onClick={handleAddProject}
          className="w-full mt-3 text-[var(--grove-void)] font-medium"
          style={{ background: 'var(--grove-leaf)' }}
        >
          Add Project
        </Button>
        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* All Projects button */}
      {projects.length > 1 && (
        <div className="px-2">
          <button
            type="button"
            onClick={showAllProjects}
            className={`w-full h-10 px-3 py-2 flex items-center gap-2 cursor-pointer text-left rounded-md transition-colors ${
              activeView === 'all-projects'
                ? 'text-[var(--grove-bright)]'
                : 'text-[var(--grove-stone)] hover:text-[var(--grove-fog)]'
            }`}
            style={activeView === 'all-projects' ? { background: 'var(--grove-canopy)' } : {}}
          >
            <Trees className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">All Projects</span>
          </button>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-hidden mt-1">
        <ScrollArea className="h-full">
          {projects.map((project) => {
            const health = healthMap[project.id];
            const isSelected = project.id === selectedProjectId && activeView !== 'all-projects';
            const dotColor =
              health === 'Healthy'
                ? 'bg-[var(--grove-leaf)]'
                : 'bg-red-400';

            return (
              <button
                key={project.id}
                type="button"
                onClick={() => selectProject(project.id)}
                className={`w-full h-10 px-3 py-2 flex items-center gap-1.5 cursor-pointer text-left transition-colors ${
                  isSelected
                    ? 'text-[var(--grove-white)]'
                    : 'text-[var(--grove-pebble)] hover:text-[var(--grove-white)]'
                }`}
                style={isSelected ? { background: 'var(--grove-canopy)' } : {}}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`}
                />
                <span className="text-sm truncate">
                  {project.name}
                </span>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Bottom section */}
      <div className="p-4" style={{ borderTop: '1px solid var(--grove-canopy)' }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={showSettings}
              className={
                activeView === 'settings'
                  ? 'text-[var(--grove-white)]'
                  : 'text-[var(--grove-stone)] hover:text-[var(--grove-fog)]'
              }
            >
              <Settings className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
