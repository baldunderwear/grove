import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onAddProject: () => void;
}

export function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <FolderOpen className="mx-auto mb-4 text-[var(--grove-stone)]" size={48} />
        <h2 className="text-xl font-semibold text-[var(--grove-fog)] mb-2">
          No projects yet
        </h2>
        <p className="text-sm text-[var(--grove-fog)] mb-6">
          Add a git repository to start managing worktrees.
        </p>
        <Button
          onClick={onAddProject}
          className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-moss)] text-white"
        >
          Add Project
        </Button>
      </div>
    </div>
  );
}
