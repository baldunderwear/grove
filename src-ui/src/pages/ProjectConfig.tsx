import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfigStore } from '@/stores/config-store';
import type { BuildFileConfig, ChangelogConfig, HealthStatus } from '@/types/config';

const HEALTH_LABELS: Record<HealthStatus, string> = {
  Healthy: 'Healthy',
  PathNotFound: 'Path not found',
  NotGitRepo: 'Not a git repository',
  MissingMergeTarget: 'Merge target branch not found',
};

function useAutoSave(
  value: string,
  original: string,
  onSave: (val: string) => Promise<void>,
) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleBlur = async () => {
    if (local !== original) {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 200);
    }
  };

  return { local, setLocal, handleBlur, saved };
}

export function ProjectConfig() {
  const config = useConfigStore((s) => s.config);
  const selectedProjectId = useConfigStore((s) => s.selectedProjectId);
  const updateProject = useConfigStore((s) => s.updateProject);
  const removeProject = useConfigStore((s) => s.removeProject);
  const checkHealth = useConfigStore((s) => s.checkHealth);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [buildFiles, setBuildFiles] = useState<BuildFileConfig[]>([]);
  const [changelog, setChangelog] = useState<ChangelogConfig | null>(null);
  const newPatternRef = useRef<HTMLInputElement>(null);

  const project = config?.projects.find((p) => p.id === selectedProjectId);

  // Sync build files and changelog from project
  useEffect(() => {
    if (project) {
      setBuildFiles(project.build_files);
      setChangelog(project.changelog);
    }
  }, [project]);

  // Health check
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    checkHealth(project.path, project.merge_target).then((h) => {
      if (!cancelled) setHealth(h);
    }).catch(() => {
      if (!cancelled) setHealth('PathNotFound');
    });
    return () => { cancelled = true; };
  }, [project?.path, project?.merge_target, checkHealth]);

  const mergeTarget = useAutoSave(
    project?.merge_target ?? '',
    project?.merge_target ?? '',
    async (val) => {
      if (project) await updateProject(project.id, { merge_target: val });
    },
  );

  const branchPrefix = useAutoSave(
    project?.branch_prefix ?? '',
    project?.branch_prefix ?? '',
    async (val) => {
      if (project) await updateProject(project.id, { branch_prefix: val });
    },
  );

  if (!project) return null;

  const healthDotColor = health === 'Healthy' ? 'bg-[var(--grove-leaf)]' : 'bg-red-500';
  const savedBorderClass = 'border-emerald-500/30';

  // Build files handlers
  const handleAddPattern = () => {
    const updated = [...buildFiles, { pattern: '' }];
    setBuildFiles(updated);
    // Focus the new input after render
    setTimeout(() => newPatternRef.current?.focus(), 0);
  };

  const handleRemovePattern = async (index: number) => {
    const updated = buildFiles.filter((_, i) => i !== index);
    setBuildFiles(updated);
    await updateProject(project.id, { build_files: updated });
  };

  const handlePatternBlur = async (index: number, value: string) => {
    const updated = buildFiles.map((bf, i) =>
      i === index ? { pattern: value } : bf,
    );
    setBuildFiles(updated);
    await updateProject(project.id, { build_files: updated });
  };

  // Changelog handlers
  const handleEnableChangelog = async () => {
    const defaultChangelog: ChangelogConfig = {
      directory: 'docs/changelog',
      fragment_pattern: 'worktree-{name}.md',
    };
    setChangelog(defaultChangelog);
    await updateProject(project.id, { changelog: defaultChangelog });
  };

  const handleDisableChangelog = async () => {
    setChangelog(null);
    await updateProject(project.id, { changelog: null });
  };

  const handleChangelogFieldBlur = async (
    field: keyof ChangelogConfig,
    value: string,
  ) => {
    if (!changelog) return;
    const updated = { ...changelog, [field]: value };
    setChangelog(updated);
    await updateProject(project.id, { changelog: updated });
  };

  // Remove handler
  const handleRemoveConfirm = async () => {
    await removeProject(project.id);
    setRemoveOpen(false);
  };

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-[var(--grove-white)]">{project.name}</h2>
        <p className="text-xs text-[var(--grove-fog)] truncate">{project.path}</p>
        {health && (
          <div className="inline-flex items-center gap-1.5 mt-2">
            <span className={`w-2 h-2 rounded-full ${healthDotColor}`} />
            <span className="text-xs text-[var(--grove-fog)]">
              {HEALTH_LABELS[health]}
            </span>
          </div>
        )}
      </div>

      {/* Merge Settings */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--grove-white)] mb-3">
          Merge Settings
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Merge target branch
            </Label>
            <Input
              value={mergeTarget.local}
              onChange={(e) => mergeTarget.setLocal(e.target.value)}
              onBlur={mergeTarget.handleBlur}
              placeholder="main"
              className={mergeTarget.saved ? savedBorderClass : ''}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Branch prefix
            </Label>
            <Input
              value={branchPrefix.local}
              onChange={(e) => branchPrefix.setLocal(e.target.value)}
              onBlur={branchPrefix.handleBlur}
              placeholder="wt/"
              className={branchPrefix.saved ? savedBorderClass : ''}
            />
          </div>
        </div>
      </Card>

      {/* Build Files */}
      <Card className="p-4 mt-6">
        <h3 className="text-sm font-semibold text-[var(--grove-white)] mb-1">
          Build Files
        </h3>
        <p className="text-xs text-[var(--grove-fog)] mb-3">
          Glob patterns for files containing build numbers. Leave empty for
          plain merge.
        </p>
        <div className="space-y-2">
          {buildFiles.map((bf, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                ref={index === buildFiles.length - 1 ? newPatternRef : undefined}
                defaultValue={bf.pattern}
                onBlur={(e) => handlePatternBlur(index, e.target.value)}
                placeholder="e.g. src/**/version.ts"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove pattern"
                onClick={() => handleRemovePattern(index)}
                className="text-[var(--grove-fog)] hover:text-red-500 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddPattern}
          className="mt-2 text-sm text-emerald-500 hover:text-[var(--grove-sprout)] inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add pattern
        </button>
      </Card>

      {/* Changelog */}
      <Card className="p-4 mt-6">
        <h3 className="text-sm font-semibold text-[var(--grove-white)] mb-1">Changelog</h3>
        <p className="text-xs text-[var(--grove-fog)] mb-3">
          Leave empty to skip changelog handling during merge.
        </p>
        {changelog === null ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableChangelog}
            className="text-emerald-500 border-emerald-500/50 hover:bg-[var(--grove-leaf)]/10"
          >
            Enable Changelog
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
                Directory
              </Label>
              <Input
                defaultValue={changelog.directory}
                onBlur={(e) =>
                  handleChangelogFieldBlur('directory', e.target.value)
                }
                placeholder="docs/changelog"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
                Fragment pattern
              </Label>
              <Input
                defaultValue={changelog.fragment_pattern}
                onBlur={(e) =>
                  handleChangelogFieldBlur('fragment_pattern', e.target.value)
                }
                placeholder="worktree-{name}.md"
              />
            </div>
            <button
              type="button"
              onClick={handleDisableChangelog}
              className="text-sm text-red-500 hover:text-red-400"
            >
              Disable Changelog
            </button>
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <div className="mt-8">
        <Separator className="mb-6" />
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setRemoveOpen(true)}
            className="border-red-500 text-red-500 hover:bg-red-500/10"
          >
            Remove Project
          </Button>
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Remove {project.name} from Grove? This does not delete the
              repository.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Keep Project
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveConfirm}
            >
              Remove Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
