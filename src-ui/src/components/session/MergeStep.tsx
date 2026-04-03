import { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMergeStore } from '@/stores/merge-store';
import type { ProjectConfig } from '@/types/config';

interface MergeStepProps {
  project: ProjectConfig;
  branchName: string;
  mergeTarget: string;
  onSuccess: () => void;
}

export function MergeStep({ project, branchName, mergeTarget, onSuccess }: MergeStepProps) {
  const { preview, step, error, loading, fetchPreview, executeMerge, clearOperation } =
    useMergeStore();

  useEffect(() => {
    clearOperation();
    fetchPreview(
      project.path,
      branchName,
      mergeTarget,
      project.build_files,
      project.changelog
    );
  }, []);

  const handleMerge = async () => {
    await executeMerge(
      project.path,
      project.name,
      branchName,
      mergeTarget,
      project.build_files,
      project.changelog
    );
    // Check if merge succeeded by reading latest store state
    const currentStep = useMergeStore.getState().step;
    if (currentStep === 'summary') {
      onSuccess();
    }
  };

  const handleRetry = () => {
    clearOperation();
    fetchPreview(
      project.path,
      branchName,
      mergeTarget,
      project.build_files,
      project.changelog
    );
  };

  // Executing state
  if (step === 'executing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--grove-sprout)]" />
        <p className="text-sm text-[var(--grove-fog)]">Merging...</p>
      </div>
    );
  }

  // Success state
  if (step === 'summary') {
    const result = useMergeStore.getState().result;
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        <p className="text-[13px] font-semibold text-emerald-300">Merge complete</p>
        {result && (
          <p className="text-sm text-[var(--grove-stone)]">
            {result.commits_merged} commits merged
            {result.new_build != null && ` \u00b7 build ${result.new_build}`}
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (step === 'error' && error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <p className="text-sm text-destructive">Merge failed: {error}</p>
        <p className="text-xs text-[var(--grove-stone)]">You can retry or close the wizard.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  // Loading state
  if (loading || !preview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--grove-sprout)]" />
        <p className="text-sm text-[var(--grove-stone)]">Loading merge preview...</p>
      </div>
    );
  }

  // Preview state (pre-merge)
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--grove-fog)]">
        Merge <span className="font-mono text-xs">{branchName}</span> into{' '}
        <span className="font-mono text-xs">{mergeTarget}</span>
      </p>

      {preview.current_build != null && preview.next_build != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-0.5 rounded bg-[var(--grove-canopy)] text-[var(--grove-fog)] font-mono text-xs">
            #{preview.current_build}
          </span>
          <ArrowRight className="h-3 w-3 text-[var(--grove-stone)]" />
          <span className="px-2 py-0.5 rounded bg-[var(--grove-leaf)] text-white font-mono text-xs">
            #{preview.next_build}
          </span>
        </div>
      )}

      <p className="text-sm text-[var(--grove-fog)]">
        {preview.commits_to_merge.length} commits will be merged
      </p>

      {preview.has_conflicts && (
        <div className="border border-amber-500/50 bg-amber-500/10 rounded px-3 py-2">
          <p className="text-sm text-amber-400">
            Conflicts detected. Resolve conflicts before merging.
          </p>
        </div>
      )}

      <p className="text-xs italic text-[var(--grove-stone)]">
        This is a local merge only -- changes will not be pushed to remote.
      </p>

      <Button
        onClick={handleMerge}
        disabled={preview.has_conflicts}
        className="bg-emerald-600 hover:bg-emerald-500 text-white"
      >
        Merge Branch
      </Button>
    </div>
  );
}
