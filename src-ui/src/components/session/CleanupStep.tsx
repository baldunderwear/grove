import { Checkbox } from '@/components/ui/checkbox';

interface CleanupStepProps {
  worktreePath: string;
  branchName: string;
  deleteWorktree: boolean;
  deleteBranch: boolean;
  onDeleteWorktreeChange: (v: boolean) => void;
  onDeleteBranchChange: (v: boolean) => void;
}

export function CleanupStep({
  worktreePath,
  branchName,
  deleteWorktree,
  deleteBranch,
  onDeleteWorktreeChange,
  onDeleteBranchChange,
}: CleanupStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[13px] font-semibold leading-[1.3] text-[var(--grove-fog)]">
          Worktree Cleanup
        </h4>
        <p className="text-sm text-[var(--grove-stone)]">
          The merge is complete. Choose what to clean up:
        </p>
      </div>
      <div className="space-y-2">
        <label className="flex items-start gap-2">
          <Checkbox
            checked={deleteWorktree}
            onCheckedChange={(v) => onDeleteWorktreeChange(!!v)}
          />
          <div>
            <span className="text-sm text-[var(--grove-fog)]">Delete worktree directory</span>
            <p className="font-mono text-xs text-[var(--grove-stone)]">{worktreePath}</p>
          </div>
        </label>
        <label className="flex items-start gap-2">
          <Checkbox
            checked={deleteBranch}
            onCheckedChange={(v) => onDeleteBranchChange(!!v)}
          />
          <div>
            <span className="text-sm text-[var(--grove-fog)]">Delete local branch</span>
            <p className="font-mono text-xs text-[var(--grove-stone)]">{branchName}</p>
          </div>
        </label>
      </div>
      <p className="text-xs italic text-[var(--grove-stone)]">
        Remote branch will not be affected.
      </p>
    </div>
  );
}
