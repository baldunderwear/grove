import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WizardStepper } from './WizardStepper';
import { DiffSummaryStep, type DiffSummaryData } from './DiffSummaryStep';
import { CommitReviewStep } from './CommitReviewStep';
import { MergeStep } from './MergeStep';
import { CleanupStep } from './CleanupStep';
import { useMergeStore } from '@/stores/merge-store';
import { useTerminalStore, type TerminalTab } from '@/stores/terminal-store';
import type { ProjectConfig } from '@/types/config';

interface PostSessionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: TerminalTab;
  project: ProjectConfig;
  branchName: string;
  mergeTarget: string;
}

export function PostSessionWizard({
  open,
  onOpenChange,
  tab,
  project,
  branchName,
  mergeTarget,
}: PostSessionWizardProps) {
  const [step, setStep] = useState(0);
  const [diffData, setDiffData] = useState<DiffSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mergeComplete, setMergeComplete] = useState(false);
  const [deleteWorktree, setDeleteWorktree] = useState(true);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const mergeStep = useMergeStore((s) => s.step);
  const isMerging = mergeStep === 'executing';

  // Fetch diff data on open, reset all state
  useEffect(() => {
    if (open) {
      setStep(0);
      setDiffData(null);
      setLoading(true);
      setMergeComplete(false);
      setDeleteWorktree(true);
      setDeleteBranch(true);
      setCleaning(false);
      setCleanupError(null);
      useMergeStore.getState().clearOperation();

      invoke<DiffSummaryData>('get_branch_diff_summary', {
        projectPath: project.path,
        sourceBranch: branchName,
        mergeTarget,
      })
        .then((data) => {
          setDiffData(data);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [open, project.path, branchName, mergeTarget]);

  const handleOpenChange = (nextOpen: boolean) => {
    // Prevent close during merge execution
    if (isMerging && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanupError(null);
    try {
      await invoke('delete_worktree', {
        projectPath: project.path,
        worktreePath: tab.worktreePath,
        branchName,
        removeWorktree: deleteWorktree,
        removeBranch: deleteBranch,
      });
      onOpenChange(false);
      // Delay tab close to avoid race condition with dialog animation
      setTimeout(() => {
        useTerminalStore.getState().closeTab(tab.id);
      }, 200);
    } catch (e) {
      setCleanupError(String(e));
      setCleaning(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Determine footer button configuration
  const getFooterAction = () => {
    switch (step) {
      case 0:
        return { label: 'Next', onClick: () => setStep(1), disabled: loading };
      case 1:
        return { label: 'Next', onClick: () => setStep(2), disabled: false };
      case 2:
        if (mergeComplete) {
          return { label: 'Next', onClick: () => setStep(3), disabled: false };
        }
        // Merge button is handled inside MergeStep component itself
        return null;
      case 3: {
        if (!deleteWorktree && !deleteBranch) {
          return { label: 'Close', onClick: handleClose, disabled: false };
        }
        return {
          label: cleaning ? 'Cleaning up...' : 'Clean Up & Close',
          onClick: handleCleanup,
          disabled: cleaning,
        };
      }
      default:
        return null;
    }
  };

  // Show back button: steps 1-3, hidden after merge complete, hidden during merge
  const showBack = step > 0 && !mergeComplete && !isMerging;

  const footerAction = getFooterAction();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[520px] bg-[var(--grove-deep)] border border-[var(--grove-canopy)]"
        onPointerDownOutside={(e) => {
          if (isMerging) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isMerging) e.preventDefault();
        }}
        showCloseButton={!isMerging}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-[1.3]">
            Post-Session Review
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--grove-stone)]">
            {branchName} into {mergeTarget}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          <WizardStepper currentStep={step} />
        </div>

        <ScrollArea className="max-h-[360px] min-h-[200px]">
          <div className="py-4">
            {step === 0 && <DiffSummaryStep data={diffData} />}
            {step === 1 && (
              <CommitReviewStep commits={diffData?.commits ?? []} />
            )}
            {step === 2 && (
              <MergeStep
                project={project}
                branchName={branchName}
                mergeTarget={mergeTarget}
                onSuccess={() => setMergeComplete(true)}
              />
            )}
            {step === 3 && (
              <CleanupStep
                worktreePath={tab.worktreePath}
                branchName={branchName}
                deleteWorktree={deleteWorktree}
                deleteBranch={deleteBranch}
                onDeleteWorktreeChange={setDeleteWorktree}
                onDeleteBranchChange={setDeleteBranch}
              />
            )}
          </div>
        </ScrollArea>

        {cleanupError && (
          <p className="text-sm text-destructive px-1">
            Cleanup failed: {cleanupError}. You can retry or close.
          </p>
        )}

        <Separator />

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {showBack && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
          </div>
          <div>
            {footerAction && (
              <Button
                onClick={footerAction.onClick}
                disabled={footerAction.disabled}
                className={
                  step === 3 && (deleteWorktree || deleteBranch)
                    ? 'bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)]'
                    : ''
                }
              >
                {cleaning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {footerAction.label}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
