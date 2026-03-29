import { useState } from 'react';
import { ClaudeMdEditor } from '@/components/config/ClaudeMdEditor';
import { SkillsBrowser } from '@/components/config/SkillsBrowser';
import { SettingsJsonEditor } from '@/components/config/SettingsJsonEditor';
import { ProfileEditor } from '@/components/config/ProfileEditor';
import { useConfigStore } from '@/stores/config-store';

type ConfigTab = 'claude-md' | 'skills' | 'settings' | 'profiles';

const TABS: { id: ConfigTab; label: string }[] = [
  { id: 'claude-md', label: 'CLAUDE.md' },
  { id: 'skills', label: 'Skills' },
  { id: 'settings', label: 'Settings' },
  { id: 'profiles', label: 'Profiles' },
];

export function ConfigEditors() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('claude-md');
  const config = useConfigStore((s) => s.config);
  const selectedProjectId = useConfigStore((s) => s.selectedProjectId);

  const projects = config?.projects ?? [];
  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : projects[0];
  const projectPath = selectedProject?.path ?? null;

  const needsProject = activeTab !== 'profiles';
  const noProject = needsProject && !projectPath;

  return (
    <div className="flex flex-col h-full p-6">
      {/* Tab bar */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer"
            style={
              activeTab === tab.id
                ? { background: 'var(--grove-leaf)', color: 'var(--grove-void)' }
                : { color: 'var(--grove-stone)' }
            }
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.color = 'var(--grove-fog)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.color = 'var(--grove-stone)';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {noProject ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--grove-stone)' }}>
              Add a project first to edit its configuration
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'claude-md' && projectPath && (
              <ClaudeMdEditor projectPath={projectPath} />
            )}
            {activeTab === 'skills' && projectPath && (
              <SkillsBrowser projectPath={projectPath} />
            )}
            {activeTab === 'settings' && projectPath && (
              <SettingsJsonEditor projectPath={projectPath} />
            )}
            {activeTab === 'profiles' && <ProfileEditor />}
          </>
        )}
      </div>
    </div>
  );
}
