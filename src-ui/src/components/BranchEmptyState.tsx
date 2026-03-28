import { GitBranch } from 'lucide-react';

interface BranchEmptyStateProps {
  prefix: string;
}

export function BranchEmptyState({ prefix }: BranchEmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4 text-center">
        <GitBranch className="w-12 h-12 text-gray-500" />
        <h3 className="text-xl font-semibold text-gray-300">
          No worktree branches
        </h3>
        <p className="text-sm text-gray-400 max-w-sm">
          No branches matching prefix &ldquo;{prefix}&rdquo; found. Create a
          worktree to get started.
        </p>
      </div>
    </div>
  );
}
