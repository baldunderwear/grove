import { useState, useCallback } from 'react';
import { Plus, Trash2, X, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfigStore } from '@/stores/config-store';
import type { Profile } from '@/types/config';

export function ProfileEditor() {
  const config = useConfigStore((s) => s.config);
  const addProfile = useConfigStore((s) => s.addProfile);
  const updateProfile = useConfigStore((s) => s.updateProfile);
  const removeProfile = useConfigStore((s) => s.removeProfile);

  const profiles = config?.profiles ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await addProfile(trimmed);
    setNewName('');
    setIsCreating(false);
  }, [newName, addProfile]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) return;
    await removeProfile(deleteConfirmId);
    if (selectedId === deleteConfirmId) setSelectedId(null);
    setDeleteConfirmId(null);
  }, [deleteConfirmId, removeProfile, selectedId]);

  const deleteTarget = profiles.find((p) => p.id === deleteConfirmId);

  return (
    <div className="flex h-full">
      {/* Profile list — left panel */}
      <div
        className="w-[30%] min-w-[200px] flex flex-col border-r"
        style={{ borderColor: 'var(--grove-canopy)', background: 'var(--grove-void)' }}
      >
        <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--grove-canopy)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--grove-fog)' }}>
            Profiles
          </h3>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsCreating(true)}
            style={{ color: 'var(--grove-leaf)' }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isCreating && (
          <div className="p-2">
            <Input
              autoFocus
              placeholder="Profile name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
              }}
              className="h-7 text-xs"
              style={{ background: 'var(--grove-deep)', color: 'var(--grove-fog)', borderColor: 'var(--grove-canopy)' }}
            />
          </div>
        )}

        <ScrollArea className="flex-1">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedId(profile.id)}
              className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors cursor-pointer"
              style={{
                background: profile.id === selectedId ? 'var(--grove-canopy)' : 'transparent',
                color: profile.id === selectedId ? 'var(--grove-bright)' : 'var(--grove-stone)',
              }}
            >
              <span className="truncate">{profile.name}</span>
              {profile.is_default && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}
                >
                  default
                </span>
              )}
            </button>
          ))}
          {profiles.length === 0 && !isCreating && (
            <p className="p-3 text-xs" style={{ color: 'var(--grove-stone)' }}>
              No profiles yet. Click + to create one.
            </p>
          )}
        </ScrollArea>
      </div>

      {/* Profile form — right panel */}
      <div className="flex-1 overflow-auto p-6" style={{ background: 'var(--grove-deep)' }}>
        {selected ? (
          <ProfileForm
            profile={selected}
            onUpdate={updateProfile}
            onRequestDelete={() => setDeleteConfirmId(selected.id)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--grove-stone)' }}>
              Select a profile or create a new one
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent style={{ background: 'var(--grove-deep)', borderColor: 'var(--grove-canopy)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--grove-fog)' }}>Delete Profile</DialogTitle>
            <DialogDescription style={{ color: 'var(--grove-stone)' }}>
              Delete profile &ldquo;{deleteTarget?.name}&rdquo;? Projects using this profile will revert to default.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---- Profile Form ---- */

interface ProfileFormProps {
  profile: Profile;
  onUpdate: (id: string, updates: Partial<Omit<Profile, 'id'>>) => Promise<void>;
  onRequestDelete: () => void;
}

function ProfileForm({ profile, onUpdate, onRequestDelete }: ProfileFormProps) {
  const [localName, setLocalName] = useState(profile.name);
  const [localConfigDir, setLocalConfigDir] = useState(profile.claude_config_dir ?? '');
  const [localSshKey, setLocalSshKey] = useState(profile.ssh_key ?? '');
  const [envRows, setEnvRows] = useState<Array<[string, string]>>(() =>
    Object.entries(profile.env_vars).length > 0
      ? Object.entries(profile.env_vars)
      : []
  );
  const [localFlags, setLocalFlags] = useState<string[]>(profile.launch_flags);
  const [flagInput, setFlagInput] = useState('');

  // Reset local state when profile changes
  const [prevId, setPrevId] = useState(profile.id);
  if (profile.id !== prevId) {
    setPrevId(profile.id);
    setLocalName(profile.name);
    setLocalConfigDir(profile.claude_config_dir ?? '');
    setLocalSshKey(profile.ssh_key ?? '');
    setEnvRows(
      Object.entries(profile.env_vars).length > 0
        ? Object.entries(profile.env_vars)
        : []
    );
    setLocalFlags(profile.launch_flags);
    setFlagInput('');
  }

  const saveEnvVars = (rows: Array<[string, string]>) => {
    const env_vars: Record<string, string> = {};
    for (const [k, v] of rows) {
      const key = k.trim();
      if (key) env_vars[key] = v;
    }
    onUpdate(profile.id, { env_vars });
  };

  const browseDirectory = async () => {
    const dir = await open({ directory: true, title: 'Select Claude Config Directory' });
    if (dir) {
      setLocalConfigDir(dir);
      onUpdate(profile.id, { claude_config_dir: dir || null });
    }
  };

  const browseSshKey = async () => {
    const file = await open({
      title: 'Select SSH Key',
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    if (file) {
      setLocalSshKey(file);
      onUpdate(profile.id, { ssh_key: file || null });
    }
  };

  const fieldStyle = {
    background: 'var(--grove-void)',
    color: 'var(--grove-fog)',
    borderColor: 'var(--grove-canopy)',
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--grove-white)' }}>
        Edit Profile
      </h2>

      {/* Name */}
      <Field label="Name">
        <Input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            if (localName.trim() && localName !== profile.name) {
              onUpdate(profile.id, { name: localName.trim() });
            }
          }}
          style={fieldStyle}
        />
      </Field>

      {/* Claude Config Directory */}
      <Field label="Claude Config Directory">
        <div className="flex gap-2">
          <Input
            value={localConfigDir}
            onChange={(e) => setLocalConfigDir(e.target.value)}
            onBlur={() => onUpdate(profile.id, { claude_config_dir: localConfigDir || null })}
            placeholder="Default"
            className="flex-1"
            style={fieldStyle}
          />
          <Button variant="outline" size="sm" onClick={browseDirectory} style={{ borderColor: 'var(--grove-canopy)', color: 'var(--grove-stone)' }}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      {/* SSH Key Path */}
      <Field label="SSH Key Path">
        <div className="flex gap-2">
          <Input
            value={localSshKey}
            onChange={(e) => setLocalSshKey(e.target.value)}
            onBlur={() => onUpdate(profile.id, { ssh_key: localSshKey || null })}
            placeholder="None"
            className="flex-1"
            style={fieldStyle}
          />
          <Button variant="outline" size="sm" onClick={browseSshKey} style={{ borderColor: 'var(--grove-canopy)', color: 'var(--grove-stone)' }}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      {/* Environment Variables */}
      <Field label="Environment Variables">
        <div className="space-y-2">
          {envRows.map(([key, value], i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={key}
                onChange={(e) => {
                  const next = [...envRows] as Array<[string, string]>;
                  next[i] = [e.target.value, value];
                  setEnvRows(next);
                }}
                onBlur={() => saveEnvVars(envRows)}
                placeholder="KEY"
                className="w-[40%]"
                style={fieldStyle}
              />
              <Input
                value={value}
                onChange={(e) => {
                  const next = [...envRows] as Array<[string, string]>;
                  next[i] = [key, e.target.value];
                  setEnvRows(next);
                }}
                onBlur={() => saveEnvVars(envRows)}
                placeholder="value"
                className="flex-1"
                style={fieldStyle}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  const next = envRows.filter((_, idx) => idx !== i);
                  setEnvRows(next);
                  saveEnvVars(next);
                }}
                className="text-red-400 hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setEnvRows([...envRows, ['', '']])}
            style={{ color: 'var(--grove-leaf)' }}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Variable
          </Button>
        </div>
      </Field>

      {/* Launch Flags */}
      <Field label="Launch Flags">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {localFlags.map((flag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                style={{ background: 'var(--grove-canopy)', color: 'var(--grove-fog)' }}
              >
                {flag}
                <button
                  type="button"
                  onClick={() => {
                    const next = localFlags.filter((_, idx) => idx !== i);
                    setLocalFlags(next);
                    onUpdate(profile.id, { launch_flags: next });
                  }}
                  className="hover:text-red-400 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={flagInput}
            onChange={(e) => setFlagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && flagInput.trim()) {
                const next = [...localFlags, flagInput.trim()];
                setLocalFlags(next);
                setFlagInput('');
                onUpdate(profile.id, { launch_flags: next });
              }
            }}
            placeholder="Type flag and press Enter"
            style={fieldStyle}
          />
        </div>
      </Field>

      {/* Default Profile */}
      <Field label="Default Profile">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={profile.is_default}
            onChange={(e) => {
              if (e.target.checked) {
                onUpdate(profile.id, { is_default: true });
              }
            }}
            className="accent-[var(--grove-leaf)]"
          />
          <span className="text-sm" style={{ color: 'var(--grove-fog)' }}>
            Use as default profile for new projects
          </span>
        </label>
      </Field>

      {/* Delete */}
      <div className="pt-4" style={{ borderTop: '1px solid var(--grove-canopy)' }}>
        <Button
          variant="destructive"
          size="sm"
          onClick={onRequestDelete}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Delete Profile
        </Button>
      </div>
    </div>
  );
}

/* ---- Field wrapper ---- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--grove-stone)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
