import { useEffect } from 'react';
import { GitMerge, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMergeStore } from '@/stores/merge-store';
import type { BranchInfo } from '@/types/branch';
import type { ProjectConfig } from '@/types/config';

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: BranchInfo | null;
  project: ProjectConfig;
  onComplete: () => void;
}

export function MergeDialog({
  open,
  onOpenChange,
  branch,
  project,
  onComplete,
}: MergeDialogProps) {
  const preview = useMergeStore((s) => s.preview);
  const result = useMergeStore((s) => s.result);
  const loading = useMergeStore((s) => s.loading);
  const error = useMergeStore((s) => s.error);
  const step = useMergeStore((s) => s.step);
  const fetchPreview = useMergeStore((s) => s.fetchPreview);
  const executeMerge = useMergeStore((s) => s.executeMerge);
  const clearOperation = useMergeStore((s) => s.clearOperation);

  // Fetch preview when dialog opens with a branch
  useEffect(() => {
    if (open && branch) {
      fetchPreview(
        project.path,
        branch.name,
        project.merge_target,
        project.build_files,
        project.changelog,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branch?.name]);

  const handleOpenChange = (v: boolean) => {
    if (!v && step === 'executing') return;
    if (!v) clearOperation();
    onOpenChange(v);
  };

  const handleContinue = () => {
    useMergeStore.setState({ step: 'confirm' });
  };

  const handleBack = () => {
    useMergeStore.setState({ step: 'preview' });
  };

  const handleMerge = () => {
    if (!branch) return;
    executeMerge(
      project.path,
      branch.name,
      project.merge_target,
      project.build_files,
      project.changelog,
    );
  };

  const handleDone = () => {
    onComplete();
    onOpenChange(false);
  };

  // Determine what to render based on step + loading state
  const isLoading = (step === 'idle' && loading) || (step === 'preview' && loading);
  const isPreview = step === 'preview' && preview !== null && !loading;
  const isConfirm = step === 'confirm';
  const isExecuting = step === 'executing';
  const isSummary = step === 'summary' && result !== null;
  const isError = step === 'error';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={step !== 'executing'}
        onPointerDownOutside={(e) => {
          if (step === 'executing') e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (step === 'executing') e.preventDefault();
        }}
      >
        {/* Loading state */}
        {isLoading && (
          <>
            <DialogHeader>
              <DialogTitle>Merge Preview</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-400">Loading preview...</span>
            </div>
          </>
        )}

        {/* Preview step */}
        {isPreview && preview && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitMerge className="h-5 w-5 text-emerald-400" />
                Merge {preview.source_branch}
              </DialogTitle>
              <DialogDescription>into {preview.target_branch}</DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-4">
              {/* Commits */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-1">
                  {preview.commits_to_merge.length} commit{preview.commits_to_merge.length !== 1 ? 's' : ''} to merge
                </h4>
                <ScrollArea className={preview.commits_to_merge.length > 5 ? 'max-h-40' : ''}>
                  <ul className="space-y-1">
                    {preview.commits_to_merge.map((commit) => (
                      <li key={commit.oid} className="flex items-start gap-2 text-xs">
                        <code className="text-gray-500 shrink-0">{commit.oid.slice(0, 7)}</code>
                        <span className="text-gray-300 truncate">{commit.message}</span>
                        <span className="text-gray-500 shrink-0 ml-auto">{commit.author}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>

              {/* Changelog Fragments */}
              {preview.changelog_fragments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-1">Changelog Fragments</h4>
                  <ul className="space-y-0.5">
                    {preview.changelog_fragments.map((frag) => (
                      <li key={frag.path} className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{frag.name}</span>
                        {frag.is_legacy && (
                          <Badge className="bg-gray-700 text-gray-400 border-0 text-[10px] px-1 py-0">
                            legacy
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Build Number */}
              {preview.current_build !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Build</span>
                  <Badge className="bg-gray-700 text-gray-300 border-0">{preview.current_build}</Badge>
                  <span className="text-gray-500">&rarr;</span>
                  <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-800">{preview.next_build}</Badge>
                </div>
              )}

              {/* Conflicts Warning */}
              {preview.has_conflicts && (
                <div className="flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-300">
                    This merge has conflicts in non-build files. Auto-resolution is not possible.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              {preview.has_conflicts ? (
                <Button variant="destructive" onClick={() => handleOpenChange(false)}>
                  Abort
                </Button>
              ) : (
                <Button onClick={handleContinue}>Continue</Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* Confirm step */}
        {isConfirm && preview && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Merge</DialogTitle>
            </DialogHeader>

            <div className="mt-2 space-y-3">
              <p className="text-sm text-gray-300">
                Merge <span className="font-medium text-gray-50">{preview.source_branch}</span> into{' '}
                <span className="font-medium text-gray-50">{preview.target_branch}</span>
              </p>

              {preview.current_build !== null && (
                <p className="text-sm text-gray-400">
                  Build number will bump from {preview.current_build} to {preview.next_build}
                </p>
              )}

              {preview.changelog_fragments.length > 0 && (
                <p className="text-sm text-gray-400">
                  {preview.changelog_fragments.length} changelog fragment{preview.changelog_fragments.length !== 1 ? 's' : ''} will be renamed
                </p>
              )}

              <p className="text-sm text-gray-400">
                {preview.commits_to_merge.length} commit{preview.commits_to_merge.length !== 1 ? 's' : ''} will be merged
              </p>

              <p className="text-xs text-gray-500 italic">
                This is a local merge only -- changes will not be pushed to remote.
              </p>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleMerge}
              >
                Merge Branch
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Executing step */}
        {isExecuting && preview && (
          <>
            <DialogHeader>
              <DialogTitle>Merging...</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              <span className="ml-2 text-sm text-gray-400">
                Merging {preview.source_branch} into {preview.target_branch}...
              </span>
            </div>
          </>
        )}

        {/* Summary step */}
        {isSummary && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Merge Complete
              </DialogTitle>
            </DialogHeader>

            <div className="mt-2 space-y-3">
              <p className="text-sm text-gray-300">
                Successfully merged {result.commits_merged} commit{result.commits_merged !== 1 ? 's' : ''}
              </p>

              {result.new_build !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Build number:</span>
                  <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-800">
                    {result.new_build}
                  </Badge>
                </div>
              )}

              {result.changelog_renames.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-1">Changelog Renames</h4>
                  <ul className="space-y-0.5">
                    {result.changelog_renames.map(([from, to]) => (
                      <li key={from} className="text-xs text-gray-400">
                        {from} &rarr; {to}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-800 bg-amber-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-sm font-medium text-amber-300">Warnings</span>
                  </div>
                  <ul className="space-y-0.5">
                    {result.warnings.map((warning, i) => (
                      <li key={i} className="text-xs text-amber-300/80">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={handleDone}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* Error step */}
        {isError && (
          <>
            <DialogHeader>
              <DialogTitle>Merge Failed</DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
