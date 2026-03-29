import { Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TerminalToolbarProps {
  branchName: string;
  onClose: () => void;
}

export function TerminalToolbar({ branchName, onClose }: TerminalToolbarProps) {
  return (
    <div className="flex h-8 items-center justify-between bg-zinc-900 px-3 border-b border-zinc-800">
      <div className="flex items-center gap-2 text-zinc-300 text-sm">
        <Terminal className="h-3.5 w-3.5" />
        <span className="font-mono truncate max-w-[200px]">{branchName}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
