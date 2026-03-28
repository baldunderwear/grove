import { GitBranch } from 'lucide-react';

interface BranchEmptyStateProps {
  prefix: string;
}

export function BranchEmptyState({ prefix }: BranchEmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4 text-center">
        <GitBranch className="w-12 h-12 text-[var(--grove-stone)]" />
        <h3 className="text-xl font-semibold text-[var(--grove-fog)]">
          No worktree branches
        </h3>
        <p className="text-sm text-[var(--grove-fog)] max-w-sm">
          No branches matching prefix &ldquo;{prefix}&rdquo; found. Create a
          worktree to get started.
        </p>
      </div>
    </div>
  );
}
