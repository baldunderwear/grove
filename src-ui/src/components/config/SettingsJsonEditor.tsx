import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { groveEditorTheme } from './EditorTheme';
import { useFileEditor } from '@/hooks/useFileEditor';

interface SettingsJsonEditorProps {
  projectPath: string;
}

interface Hook {
  matcher: string;
  command: string;
}

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface SettingsData {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  hooks?: {
    preToolUse?: Hook[];
    postToolUse?: Hook[];
  };
  mcpServers?: Record<string, McpServer>;
  [key: string]: unknown;
}

type EditorMode = 'form' | 'json';

const DEFAULT_SETTINGS = JSON.stringify(
  { permissions: { allow: [], deny: [] } },
  null,
  2
);

/**
 * Structured form editor for .claude/settings.json with JSON preview.
 * Two modes: Form (structured sections) and JSON (raw CodeMirror editor).
 * Validates JSON syntax before save.
 */
export function SettingsJsonEditor({ projectPath }: SettingsJsonEditorProps) {
  const settingsPath = `${projectPath}/.claude/settings.json`;
  const { content, setContent, loading, error, dirty, save, reload } = useFileEditor(settingsPath);
  const [mode, setMode] = useState<EditorMode>('form');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(true);
  const [saved, setSaved] = useState(false);

  // Check if file exists
  useEffect(() => {
    async function checkExists() {
      try {
        await invoke<string>('read_text_file', { path: settingsPath });
        setFileExists(true);
      } catch {
        setFileExists(false);
      }
    }
    checkExists();
  }, [settingsPath]);

  // Parse JSON content into structured data
  const parsed = useMemo((): SettingsData | null => {
    if (!content.trim()) return null;
    try {
      const data = JSON.parse(content);
      setJsonError(null);
      return data as SettingsData;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setJsonError(msg);
      return null;
    }
  }, [content]);

  // Serialize structured data back to JSON
  const updateFromData = useCallback(
    (data: SettingsData) => {
      const json = JSON.stringify(data, null, 2);
      setContent(json);
      setJsonError(null);
    },
    [setContent]
  );

  // Validate before save
  const handleSave = async () => {
    if (content.trim()) {
      try {
        JSON.parse(content);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setJsonError(msg);
        return;
      }
    }
    const ok = await save();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  // Create default settings.json
  const handleCreate = async () => {
    try {
      await invoke('write_text_file', { path: settingsPath, content: DEFAULT_SETTINGS });
      setFileExists(true);
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setJsonError(`Failed to create: ${msg}`);
    }
  };

  // Switch mode with validation
  const switchMode = (newMode: EditorMode) => {
    if (newMode === 'form' && mode === 'json') {
      // Re-parse when switching back to form
      try {
        JSON.parse(content);
        setJsonError(null);
        setMode(newMode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setJsonError(`Cannot switch to Form mode: ${msg}`);
      }
    } else {
      setMode(newMode);
    }
  };

  // File doesn't exist yet
  if (!fileExists && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--grove-stone)]">
        <p className="text-lg">No settings.json found</p>
        <p className="text-sm">Create a settings.json to configure permissions, hooks, and MCP servers.</p>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded font-medium hover:bg-[var(--grove-sprout)]"
        >
          Create settings.json
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--grove-stone)]">
        Loading...
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 px-4">
        {error}
      </div>
    );
  }

  const canSave = dirty && !jsonError;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--grove-canopy)]">
        {/* Mode tabs */}
        <div className="flex gap-1">
          {(['form', 'json'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-3 py-1 text-sm rounded ${
                mode === m
                  ? 'bg-[var(--grove-canopy)] text-[var(--grove-fog)]'
                  : 'text-[var(--grove-stone)] hover:text-[var(--grove-fog)]'
              }`}
            >
              {m === 'form' ? 'Form' : 'JSON'}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 items-center">
          {saved && (
            <span className="text-xs text-[var(--grove-leaf)]">Saved</span>
          )}
          <button
            onClick={reload}
            className="px-2 py-1 text-xs text-[var(--grove-stone)] hover:text-[var(--grove-fog)] border border-[var(--grove-canopy)] rounded"
          >
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-1 text-xs bg-[var(--grove-leaf)] text-[var(--grove-void)] rounded disabled:opacity-40 hover:bg-[var(--grove-sprout)]"
          >
            {dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {/* JSON error banner */}
      {jsonError && (
        <div className="px-3 py-2 bg-red-900/30 border-b border-red-800/50 text-sm text-red-300">
          JSON Error: {jsonError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'json' ? (
          <CodeMirror
            value={content}
            onChange={val => {
              setContent(val);
              // Clear error on edit
              try { JSON.parse(val); setJsonError(null); } catch { /* validated on save */ }
            }}
            extensions={[json()]}
            theme={groveEditorTheme}
            height="100%"
            style={{ height: '100%' }}
          />
        ) : (
          <div className="overflow-y-auto h-full p-4 space-y-4">
            {parsed ? (
              <>
                <PermissionsSection
                  data={parsed}
                  onChange={updateFromData}
                />
                <HooksSection
                  data={parsed}
                  onChange={updateFromData}
                />
                <McpServersSection
                  data={parsed}
                  onChange={updateFromData}
                />
              </>
            ) : (
              <div className="text-[var(--grove-stone)] text-sm">
                Cannot display form: invalid JSON. Switch to JSON mode to fix.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Section Components ---

interface SectionProps {
  data: SettingsData;
  onChange: (data: SettingsData) => void;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--grove-canopy)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--grove-deep)] hover:bg-[var(--grove-forest)] text-sm font-medium text-[var(--grove-fog)]"
      >
        <span>{title}</span>
        <span className="text-[var(--grove-stone)]">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-4 py-3 bg-[var(--grove-void)]/50">{children}</div>}
    </div>
  );
}

function PermissionsSection({ data, onChange }: SectionProps) {
  const permissions = data.permissions ?? { allow: [], deny: [] };
  const allow = permissions.allow ?? [];
  const deny = permissions.deny ?? [];

  const updateList = (listKey: 'allow' | 'deny', index: number, value: string) => {
    const list = [...(listKey === 'allow' ? allow : deny)];
    list[index] = value;
    onChange({
      ...data,
      permissions: { ...permissions, [listKey]: list },
    });
  };

  const addItem = (listKey: 'allow' | 'deny') => {
    const list = [...(listKey === 'allow' ? allow : deny), ''];
    onChange({
      ...data,
      permissions: { ...permissions, [listKey]: list },
    });
  };

  const removeItem = (listKey: 'allow' | 'deny', index: number) => {
    const list = (listKey === 'allow' ? allow : deny).filter((_, i) => i !== index);
    onChange({
      ...data,
      permissions: { ...permissions, [listKey]: list },
    });
  };

  return (
    <CollapsibleSection title="Permissions">
      <div className="space-y-4">
        <PermissionList
          label="Allow"
          items={allow}
          onChange={(i, v) => updateList('allow', i, v)}
          onAdd={() => addItem('allow')}
          onRemove={i => removeItem('allow', i)}
        />
        <PermissionList
          label="Deny"
          items={deny}
          onChange={(i, v) => updateList('deny', i, v)}
          onAdd={() => addItem('deny')}
          onRemove={i => removeItem('deny', i)}
        />
      </div>
    </CollapsibleSection>
  );
}

function PermissionList({
  label,
  items,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--grove-stone)] uppercase tracking-wide">
          {label}
        </span>
        <button
          onClick={onAdd}
          className="text-xs text-[var(--grove-leaf)] hover:text-[var(--grove-sprout)]"
        >
          + Add
        </button>
      </div>
      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="text-xs text-[var(--grove-stone)] italic">No items</p>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex gap-1">
              <input
                type="text"
                value={item}
                onChange={e => onChange(i, e.target.value)}
                placeholder='e.g., Bash(git:*)'
                className="flex-1 px-2 py-1 text-xs bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
              />
              <button
                onClick={() => onRemove(i)}
                className="px-1.5 text-[var(--grove-stone)] hover:text-red-400"
                title="Remove"
              >
                x
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HooksSection({ data, onChange }: SectionProps) {
  const hooks = data.hooks ?? { preToolUse: [], postToolUse: [] };
  const preToolUse = hooks.preToolUse ?? [];
  const postToolUse = hooks.postToolUse ?? [];

  const updateHook = (listKey: 'preToolUse' | 'postToolUse', index: number, field: keyof Hook, value: string) => {
    const list = [...(listKey === 'preToolUse' ? preToolUse : postToolUse)];
    list[index] = { ...list[index], [field]: value };
    onChange({
      ...data,
      hooks: { ...hooks, [listKey]: list },
    });
  };

  const addHook = (listKey: 'preToolUse' | 'postToolUse') => {
    const list = [...(listKey === 'preToolUse' ? preToolUse : postToolUse), { matcher: '', command: '' }];
    onChange({
      ...data,
      hooks: { ...hooks, [listKey]: list },
    });
  };

  const removeHook = (listKey: 'preToolUse' | 'postToolUse', index: number) => {
    const list = (listKey === 'preToolUse' ? preToolUse : postToolUse).filter((_, i) => i !== index);
    onChange({
      ...data,
      hooks: { ...hooks, [listKey]: list },
    });
  };

  return (
    <CollapsibleSection title="Hooks">
      <div className="space-y-4">
        <HookList
          label="Pre-tool Use"
          items={preToolUse}
          onChange={(i, f, v) => updateHook('preToolUse', i, f, v)}
          onAdd={() => addHook('preToolUse')}
          onRemove={i => removeHook('preToolUse', i)}
        />
        <HookList
          label="Post-tool Use"
          items={postToolUse}
          onChange={(i, f, v) => updateHook('postToolUse', i, f, v)}
          onAdd={() => addHook('postToolUse')}
          onRemove={i => removeHook('postToolUse', i)}
        />
      </div>
    </CollapsibleSection>
  );
}

function HookList({
  label,
  items,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: Hook[];
  onChange: (index: number, field: keyof Hook, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--grove-stone)] uppercase tracking-wide">
          {label}
        </span>
        <button
          onClick={onAdd}
          className="text-xs text-[var(--grove-leaf)] hover:text-[var(--grove-sprout)]"
        >
          + Add
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-[var(--grove-stone)] italic">No hooks</p>
        ) : (
          items.map((hook, i) => (
            <div key={i} className="flex gap-1 items-start">
              <input
                type="text"
                value={hook.matcher}
                onChange={e => onChange(i, 'matcher', e.target.value)}
                placeholder="matcher"
                className="w-[40%] px-2 py-1 text-xs bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
              />
              <input
                type="text"
                value={hook.command}
                onChange={e => onChange(i, 'command', e.target.value)}
                placeholder="command"
                className="flex-1 px-2 py-1 text-xs bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
              />
              <button
                onClick={() => onRemove(i)}
                className="px-1.5 py-1 text-[var(--grove-stone)] hover:text-red-400"
                title="Remove"
              >
                x
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function McpServersSection({ data, onChange }: SectionProps) {
  const mcpServers = data.mcpServers ?? {};
  const entries = Object.entries(mcpServers);

  const updateServer = (oldName: string, newName: string, server: McpServer) => {
    const newServers = { ...mcpServers };
    if (oldName !== newName) {
      delete newServers[oldName];
    }
    newServers[newName] = server;
    onChange({ ...data, mcpServers: newServers });
  };

  const addServer = () => {
    const name = `server-${entries.length + 1}`;
    onChange({
      ...data,
      mcpServers: { ...mcpServers, [name]: { command: '', args: [], env: {} } },
    });
  };

  const removeServer = (name: string) => {
    const newServers = { ...mcpServers };
    delete newServers[name];
    onChange({ ...data, mcpServers: newServers });
  };

  return (
    <CollapsibleSection title="MCP Servers">
      <div className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-[var(--grove-stone)] italic">No MCP servers configured</p>
        ) : (
          entries.map(([name, server]) => (
            <McpServerCard
              key={name}
              name={name}
              server={server}
              onUpdate={(newName, newServer) => updateServer(name, newName, newServer)}
              onRemove={() => removeServer(name)}
            />
          ))
        )}
        <button
          onClick={addServer}
          className="text-xs text-[var(--grove-leaf)] hover:text-[var(--grove-sprout)]"
        >
          + Add Server
        </button>
      </div>
    </CollapsibleSection>
  );
}

function McpServerCard({
  name,
  server,
  onUpdate,
  onRemove,
}: {
  name: string;
  server: McpServer;
  onUpdate: (name: string, server: McpServer) => void;
  onRemove: () => void;
}) {
  const argsStr = (server.args ?? []).join(', ');
  const envEntries = Object.entries(server.env ?? {});

  const updateArgs = (val: string) => {
    const args = val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    onUpdate(name, { ...server, args });
  };

  const updateEnvKey = (oldKey: string, newKey: string, value: string) => {
    const env = { ...(server.env ?? {}) };
    delete env[oldKey];
    env[newKey] = value;
    onUpdate(name, { ...server, env });
  };

  const updateEnvValue = (key: string, value: string) => {
    const env = { ...(server.env ?? {}), [key]: value };
    onUpdate(name, { ...server, env });
  };

  const addEnv = () => {
    const env = { ...(server.env ?? {}), '': '' };
    onUpdate(name, { ...server, env });
  };

  const removeEnv = (key: string) => {
    const env = { ...(server.env ?? {}) };
    delete env[key];
    onUpdate(name, { ...server, env });
  };

  return (
    <div className="border border-[var(--grove-canopy)] rounded p-3 space-y-2 bg-[var(--grove-deep)]/50">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={name}
          onChange={e => onUpdate(e.target.value, server)}
          className="px-2 py-1 text-xs font-medium bg-transparent border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] focus:outline-none focus:border-[var(--grove-leaf)]"
        />
        <button
          onClick={onRemove}
          className="text-xs text-[var(--grove-stone)] hover:text-red-400"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <label className="text-[var(--grove-stone)] py-1">Command:</label>
        <input
          type="text"
          value={server.command}
          onChange={e => onUpdate(name, { ...server, command: e.target.value })}
          placeholder="npx, node, python..."
          className="px-2 py-1 bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
        />

        <label className="text-[var(--grove-stone)] py-1">Args:</label>
        <input
          type="text"
          value={argsStr}
          onChange={e => updateArgs(e.target.value)}
          placeholder="arg1, arg2, ..."
          className="px-2 py-1 bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
        />
      </div>

      {/* Env vars */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--grove-stone)]">Environment:</span>
          <button
            onClick={addEnv}
            className="text-xs text-[var(--grove-leaf)] hover:text-[var(--grove-sprout)]"
          >
            + Add
          </button>
        </div>
        {envEntries.length > 0 && (
          <div className="space-y-1">
            {envEntries.map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <input
                  type="text"
                  value={key}
                  onChange={e => updateEnvKey(key, e.target.value, value)}
                  placeholder="KEY"
                  className="w-[35%] px-2 py-0.5 text-xs bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
                />
                <input
                  type="text"
                  value={value}
                  onChange={e => updateEnvValue(key, e.target.value)}
                  placeholder="value"
                  className="flex-1 px-2 py-0.5 text-xs bg-[var(--grove-deep)] border border-[var(--grove-canopy)] rounded text-[var(--grove-fog)] font-mono focus:outline-none focus:border-[var(--grove-leaf)]"
                />
                <button
                  onClick={() => removeEnv(key)}
                  className="px-1 text-[var(--grove-stone)] hover:text-red-400"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
