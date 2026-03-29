import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { groveEditorTheme } from './EditorTheme';
import { useFileEditor } from '@/hooks/useFileEditor';

interface DirEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

interface SkillsBrowserProps {
  projectPath: string;
}

const SKILL_TEMPLATE = (name: string) => `# Skill: ${name}

## Description

[What this skill does]

## Rules

- [Rule 1]
`;

/**
 * Skills browser with CRUD operations and CodeMirror markdown editing.
 * Lists .md files from .claude/skills/ (or .agents/skills/ fallback),
 * supports creating from template, editing, and deleting with confirmation.
 */
export function SkillsBrowser({ projectPath }: SkillsBrowserProps) {
  const [skillsDir, setSkillsDir] = useState<string | null>(null);
  const [skills, setSkills] = useState<DirEntry[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedPath = skillsDir && selectedSkill ? `${skillsDir}${selectedSkill}` : null;
  const { content, setContent, loading, error, dirty, save, reload } = useFileEditor(selectedPath);

  const loadSkillsList = useCallback(async (dir: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      const entries = await invoke<DirEntry[]>('list_directory', { path: dir });
      const mdFiles = entries.filter(e => !e.is_dir && e.name.endsWith('.md'));
      setSkills(mdFiles);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Directory not found is not an error -- just means no skills yet
      if (msg.includes('not found') || msg.includes('Not found')) {
        setSkills([]);
      } else {
        setListError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Discover skills directory on mount
  useEffect(() => {
    async function discoverDir() {
      const claudeSkills = `${projectPath}/.claude/skills/`;
      const agentsSkills = `${projectPath}/.agents/skills/`;

      // Try .claude/skills/ first
      try {
        await invoke<DirEntry[]>('list_directory', { path: claudeSkills });
        setSkillsDir(claudeSkills);
        return;
      } catch {
        // Fall through to .agents/skills/
      }

      // Try .agents/skills/ fallback
      try {
        await invoke<DirEntry[]>('list_directory', { path: agentsSkills });
        setSkillsDir(agentsSkills);
        return;
      } catch {
        // Neither exists -- default to .claude/skills/ for new skill creation
        setSkillsDir(claudeSkills);
      }
    }

    discoverDir();
  }, [projectPath]);

  // Load skills list when directory is discovered
  useEffect(() => {
    if (skillsDir) {
      loadSkillsList(skillsDir);
    }
  }, [skillsDir, loadSkillsList]);

  const handleCreateSkill = async () => {
    if (!skillsDir || !newSkillName.trim()) return;

    setCreating(true);
    const filename = newSkillName.trim().endsWith('.md')
      ? newSkillName.trim()
      : `${newSkillName.trim()}.md`;
    const baseName = filename.replace(/\.md$/, '');
    const path = `${skillsDir}${filename}`;

    try {
      await invoke('write_text_file', { path, content: SKILL_TEMPLATE(baseName) });
      setNewSkillName('');
      setShowNewInput(false);
      await loadSkillsList(skillsDir);
      setSelectedSkill(filename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setListError(`Failed to create skill: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSkill = async (skillName: string) => {
    if (!skillsDir) return;
    const path = `${skillsDir}${skillName}`;

    try {
      await invoke('delete_file', { path });
      setDeletingSkill(null);
      if (selectedSkill === skillName) {
        setSelectedSkill(null);
      }
      await loadSkillsList(skillsDir);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setListError(`Failed to delete skill: ${msg}`);
    }
  };

  const handleSave = async () => {
    await save();
  };

  // No skills and no directory
  if (!loadingList && skills.length === 0 && !listError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--grove-stone)]">
        <p className="text-lg">No skills found. Create your first skill to get started.</p>
        <div className="flex gap-2 items-center">
          {showNewInput ? (
            <>
              <input
                type="text"
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateSkill()}
                placeholder="skill-name"
                className="px-3 py-1.5 bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-sm text-[var(--grove-fog)] focus:outline-none focus:border-[var(--grove-leaf)]"
                autoFocus
                disabled={creating}
              />
              <button
                onClick={handleCreateSkill}
                disabled={!newSkillName.trim() || creating}
                className="px-3 py-1.5 bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded text-sm font-medium hover:bg-[var(--grove-sprout)] disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => { setShowNewInput(false); setNewSkillName(''); }}
                className="px-3 py-1.5 text-sm text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="px-4 py-2 bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded font-medium hover:bg-[var(--grove-sprout)]"
            >
              New Skill
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel - skill list */}
      <div
        className="flex flex-col w-[30%] min-w-[200px] border-r border-[var(--grove-canopy)]"
        style={{ flexShrink: 0 }}
      >
        {/* Header with New Skill button */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--grove-canopy)]">
          <span className="text-sm font-medium text-[var(--grove-fog)]">Skills</span>
          <button
            onClick={() => setShowNewInput(true)}
            className="px-2 py-1 text-xs bg-[var(--grove-canopy)] text-[var(--grove-leaf)] rounded hover:bg-[var(--grove-moss)]"
          >
            + New Skill
          </button>
        </div>

        {/* New skill input */}
        {showNewInput && (
          <div className="flex gap-1 px-2 py-2 border-b border-[var(--grove-canopy)]">
            <input
              type="text"
              value={newSkillName}
              onChange={e => setNewSkillName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateSkill();
                if (e.key === 'Escape') { setShowNewInput(false); setNewSkillName(''); }
              }}
              placeholder="skill-name"
              className="flex-1 px-2 py-1 bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-xs text-[var(--grove-fog)] focus:outline-none focus:border-[var(--grove-leaf)]"
              autoFocus
              disabled={creating}
            />
            <button
              onClick={handleCreateSkill}
              disabled={!newSkillName.trim() || creating}
              className="px-2 py-1 text-xs bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded disabled:opacity-50"
            >
              OK
            </button>
          </div>
        )}

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="px-3 py-4 text-sm text-[var(--grove-stone)]">Loading...</div>
          ) : listError ? (
            <div className="px-3 py-4 text-sm text-red-400">{listError}</div>
          ) : (
            skills.map(skill => (
              <div key={skill.name} className="relative group">
                {deletingSkill === skill.name ? (
                  // Delete confirmation
                  <div className="px-3 py-2 bg-red-900/30 border-b border-red-800/50">
                    <p className="text-xs text-red-300 mb-2">
                      Delete {skill.name}? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteSkill(skill.name)}
                        className="px-2 py-0.5 text-xs bg-red-700 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingSkill(null)}
                        className="px-2 py-0.5 text-xs text-[var(--grove-stone)] hover:text-[var(--grove-fog)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedSkill(skill.name)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--grove-canopy)]/30 flex items-center justify-between ${
                      selectedSkill === skill.name
                        ? 'bg-[var(--grove-canopy)] text-[var(--grove-fog)]'
                        : 'text-[var(--grove-stone)] hover:bg-[var(--grove-deep)] hover:text-[var(--grove-fog)]'
                    }`}
                  >
                    <span className="truncate">{skill.name}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setDeletingSkill(skill.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--grove-stone)] hover:text-red-400 transition-opacity"
                      title="Delete skill"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel - editor */}
      <div className="flex flex-col flex-1 min-w-0">
        {selectedSkill ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--grove-canopy)]">
              <span className="text-sm font-mono text-[var(--grove-fog)]">{selectedSkill}</span>
              <div className="flex gap-2">
                <button
                  onClick={reload}
                  className="px-2 py-1 text-xs text-[var(--grove-stone)] hover:text-[var(--grove-fog)] border border-[var(--grove-canopy)] rounded"
                  title="Reload from disk"
                >
                  Reload
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty}
                  className="px-3 py-1 text-xs bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded disabled:opacity-40 hover:bg-[var(--grove-sprout)]"
                >
                  {dirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </div>

            {/* Editor */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-[var(--grove-stone)]">
                Loading...
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-red-400 px-4">
                {error}
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <CodeMirror
                  value={content}
                  onChange={setContent}
                  extensions={[markdown()]}
                  theme={groveEditorTheme}
                  height="100%"
                  style={{ height: '100%' }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--grove-stone)]">
            Select a skill to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
