import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onAddProject: () => void;
}

export function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <FolderOpen className="mx-auto mb-4 text-gray-400" size={48} />
        <h2 className="text-xl font-semibold text-gray-300 mb-2">
          No projects yet
        </h2>
        <p className="text-sm text-gray-300 mb-6">
          Add a git repository to start managing worktrees.
        </p>
        <Button
          onClick={onAddProject}
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          Add Project
        </Button>
      </div>
    </div>
  );
}
