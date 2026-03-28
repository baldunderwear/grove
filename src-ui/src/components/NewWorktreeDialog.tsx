import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NewWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  branchPrefix: string;
  onCreated: (worktreePath: string, branchName: string) => void;
}

export function NewWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  branchPrefix,
  onCreated,
}: NewWorktreeDialogProps) {
  const [name, setName] = useState('');
  const [launchAfter, setLaunchAfter] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.length > 0 && /^[a-zA-Z0-9_-]+$/.test(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || creating) return;

    setCreating(true);
    setError(null);

    try {
      const worktreePath = await invoke<string>('create_worktree', {
        projectPath,
        branchName: name,
        branchPrefix,
      });
      setName('');
      onOpenChange(false);
      onCreated(worktreePath, name);

      // If launch after is checked, launch a session
      if (launchAfter) {
        const fullName = `${branchPrefix}${name}`;
        await invoke<number>('launch_session', {
          worktreePath,
          worktreeName: fullName,
          launchFlags: [],
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Worktree</DialogTitle>
            <DialogDescription>
              Create a new worktree branch and working directory.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wt-name">Branch name</Label>
              <div className="flex items-center gap-0">
                <span className="inline-flex items-center h-9 px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                  {branchPrefix}
                </span>
                <Input
                  id="wt-name"
                  className="rounded-l-none"
                  placeholder="feature-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  autoFocus
                />
              </div>
              {name.length > 0 && !isValid && (
                <p className="text-xs text-destructive">
                  Only letters, numbers, hyphens, and underscores allowed.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={launchAfter}
                onChange={(e) => setLaunchAfter(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-transparent text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-sm text-[var(--grove-fog)]">Launch Claude Code after creation</span>
            </label>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
