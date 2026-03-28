import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, GitBranch, Loader2, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConfigStore } from '@/stores/config-store';
import type { ScanResult } from '@/types/config';

type WizardStep = 'pick' | 'scanning' | 'configure' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddProjectWizard({ open: isOpen, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>('pick');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Config fields
  const [name, setName] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [branchPrefix, setBranchPrefix] = useState('');
  const [changelogDir, setChangelogDir] = useState('');

  const addProject = useConfigStore((s) => s.addProject);

  const reset = () => {
    setStep('pick');
    setScan(null);
    setError(null);
    setName('');
    setMergeTarget('');
    setBranchPrefix('');
    setChangelogDir('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePickFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    });
    if (!selected) return;

    setStep('scanning');
    setError(null);

    try {
      const result = await invoke<ScanResult>('scan_repo', { path: selected as string });
      setScan(result);
      setName(result.name);
      setMergeTarget(result.merge_target);
      setBranchPrefix(
        result.branch_prefixes.length > 0
          ? result.branch_prefixes[0].prefix
          : 'wt/'
      );
      setChangelogDir(result.changelog_dir ?? '');
      setStep('configure');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  };

  const handleAdd = async () => {
    if (!scan) return;
    try {
      await addProject(scan.path);
      // Now update the project with wizard config
      const config = useConfigStore.getState().config;
      if (config) {
        const project = config.projects.find((p) => p.path.replace(/\\/g, '/') === scan.path.replace(/\\/g, '/'));
        if (project) {
          await invoke('update_project', {
            id: project.id,
            name,
            mergeTarget,
            branchPrefix,
            changelog: changelogDir
              ? { directory: changelogDir, fragment_pattern: `worktree-{name}.md` }
              : null,
          });
          // Reload config to pick up changes
          await useConfigStore.getState().loadConfig();
          useConfigStore.getState().selectProject(project.id);
        }
      }
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[520px]" style={{ background: 'var(--grove-deep)', border: '1px solid var(--grove-canopy)' }}>
        {/* Step: Pick folder */}
        {step === 'pick' && (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--grove-white)' }}>Add Project</DialogTitle>
              <DialogDescription style={{ color: 'var(--grove-stone)' }}>
                Select a git repository folder. Grove will scan it and detect your branch patterns.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <FolderOpen className="h-12 w-12" style={{ color: 'var(--grove-fern)' }} />
              <Button
                onClick={handlePickFolder}
                className="font-medium"
                style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}
              >
                Choose Repository Folder
              </Button>
            </div>
          </>
        )}

        {/* Step: Scanning */}
        {step === 'scanning' && (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--grove-white)' }}>Scanning Repository</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--grove-leaf)' }} />
              <span style={{ color: 'var(--grove-fog)' }}>Detecting branches, worktrees, and patterns...</span>
            </div>
          </>
        )}

        {/* Step: Configure */}
        {step === 'configure' && scan && (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--grove-white)' }}>Configure Project</DialogTitle>
              <DialogDescription style={{ color: 'var(--grove-stone)' }}>
                Review detected settings and adjust as needed.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-5 py-2 pr-4">
                {/* Scan summary */}
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-0 text-xs" style={{ background: 'var(--grove-canopy)', color: 'var(--grove-bright)' }}>
                    <GitBranch className="h-3 w-3 mr-1" />
                    {scan.total_branches} branches
                  </Badge>
                  <Badge className="border-0 text-xs" style={{ background: 'var(--grove-canopy)', color: 'var(--grove-bright)' }}>
                    {scan.worktree_count} worktree{scan.worktree_count !== 1 ? 's' : ''}
                  </Badge>
                  {scan.remote_url && (
                    <Badge className="border-0 text-xs font-mono" style={{ background: 'var(--grove-canopy)', color: 'var(--grove-stone)' }}>
                      {scan.remote_url.split('/').pop()?.replace('.git', '') ?? 'remote'}
                    </Badge>
                  )}
                </div>

                {/* Project name */}
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--grove-pebble)' }}>Project Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ background: 'var(--grove-forest)', color: 'var(--grove-fog)', borderColor: 'var(--grove-canopy)' }}
                  />
                </div>

                {/* Merge target */}
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--grove-pebble)' }}>Merge Target Branch</Label>
                  <div className="flex gap-2">
                    {scan.suggested_merge_targets.map((t) => (
                      <Button
                        key={t}
                        variant={mergeTarget === t ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMergeTarget(t)}
                        className="text-xs"
                        style={
                          mergeTarget === t
                            ? { background: 'var(--grove-leaf)', color: 'var(--grove-void)' }
                            : { borderColor: 'var(--grove-canopy)', color: 'var(--grove-stone)' }
                        }
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    placeholder="e.g., develop, main"
                    className="mt-1"
                    style={{ background: 'var(--grove-forest)', color: 'var(--grove-fog)', borderColor: 'var(--grove-canopy)' }}
                  />
                </div>

                {/* Branch prefix */}
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--grove-pebble)' }}>Branch Prefix</Label>
                  {scan.branch_prefixes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {scan.branch_prefixes.map((p) => (
                        <Button
                          key={p.prefix}
                          variant={branchPrefix === p.prefix ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBranchPrefix(p.prefix)}
                          className="text-xs font-mono"
                          style={
                            branchPrefix === p.prefix
                              ? { background: 'var(--grove-leaf)', color: 'var(--grove-void)' }
                              : { borderColor: 'var(--grove-canopy)', color: 'var(--grove-stone)' }
                          }
                        >
                          {p.prefix} ({p.count} branches)
                        </Button>
                      ))}
                    </div>
                  )}
                  <Input
                    value={branchPrefix}
                    onChange={(e) => setBranchPrefix(e.target.value)}
                    placeholder="e.g., wt/, worktree-, feature/"
                    className="font-mono"
                    style={{ background: 'var(--grove-forest)', color: 'var(--grove-fog)', borderColor: 'var(--grove-canopy)' }}
                  />
                  <p className="text-xs" style={{ color: 'var(--grove-stone)' }}>
                    Only branches matching this prefix will show in the dashboard.
                  </p>
                </div>

                {/* Changelog */}
                {scan.has_changelogs && (
                  <div className="space-y-1.5">
                    <Label style={{ color: 'var(--grove-pebble)' }}>Changelog Directory</Label>
                    <Input
                      value={changelogDir}
                      onChange={(e) => setChangelogDir(e.target.value)}
                      className="font-mono"
                      style={{ background: 'var(--grove-forest)', color: 'var(--grove-fog)', borderColor: 'var(--grove-canopy)' }}
                    />
                    <p className="text-xs" style={{ color: 'var(--grove-stone)' }}>
                      Detected changelog directory. Used for merge fragment renaming.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={handleClose} style={{ color: 'var(--grove-stone)' }}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={!name || !mergeTarget || !branchPrefix}
                className="font-medium"
                style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}
              >
                Add Project
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--grove-white)' }}>Project Added</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--grove-leaf)' }}>
                <Check className="h-6 w-6" style={{ color: 'var(--grove-void)' }} />
              </div>
              <p style={{ color: 'var(--grove-fog)' }}>
                <span className="font-semibold" style={{ color: 'var(--grove-white)' }}>{name}</span> is ready.
              </p>
              <p className="text-sm" style={{ color: 'var(--grove-stone)' }}>
                {scan?.total_branches ?? 0} branches · prefix: <code className="font-mono">{branchPrefix}</code> · target: <code className="font-mono">{mergeTarget}</code>
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={handleClose}
                className="font-medium"
                style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}
              >
                Open Dashboard
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--grove-white)' }}>Something went wrong</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} style={{ color: 'var(--grove-stone)' }}>
                Cancel
              </Button>
              <Button onClick={() => setStep('pick')} style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}>
                Try Again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
