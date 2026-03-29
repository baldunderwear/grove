import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useConfigStore } from '@/stores/config-store';
import type { BranchInfo } from '@/types/branch';
import type { PromptTemplate } from '@/types/config';

interface BatchLaunchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchInfo[];
  projectId?: string;
  projectPath: string;
  onLaunch: (prompt: string) => void;
}

export function BatchLaunchDialog({
  open,
  onOpenChange,
  branches,
  projectPath,
  onLaunch,
}: BatchLaunchDialogProps) {
  const templates = useConfigStore((s) => s.config?.templates ?? []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');

  const handleTemplateSelect = (template: PromptTemplate) => {
    setSelectedTemplateId(template.id);
    // For batch, keep raw template body -- variables get substituted per-worktree at launch time
    setPromptText(template.body);
  };

  const handleLaunch = () => {
    onLaunch(promptText);
    setSelectedTemplateId(null);
    setPromptText('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedTemplateId(null);
      setPromptText('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[var(--grove-bark)] border-[var(--grove-canopy)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--grove-white)] flex items-center gap-2">
            <Zap className="h-5 w-5 text-[var(--grove-leaf)]" />
            Batch Launch
          </DialogTitle>
          <DialogDescription className="text-[var(--grove-fog)]">
            Launch Claude Code on {branches.length} worktree{branches.length !== 1 ? 's' : ''} simultaneously.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Selected branches */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Worktrees
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {branches.map((b) => (
                <Badge
                  key={b.worktree_path}
                  className="bg-[var(--grove-canopy)] text-[var(--grove-white)] border-0 text-xs px-2 py-1"
                >
                  {b.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Template quick-select pills */}
          {templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
                Prompt Template
              </Label>
              <div className="flex flex-wrap gap-1">
                <button
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    !selectedTemplateId
                      ? 'bg-[var(--grove-leaf)]/20 text-[var(--grove-leaf)]'
                      : 'bg-[var(--grove-deep)] text-[var(--grove-fog)] hover:text-[var(--grove-white)]'
                  }`}
                  onClick={() => {
                    setSelectedTemplateId(null);
                    setPromptText('');
                  }}
                >
                  No template
                </button>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      selectedTemplateId === t.id
                        ? 'bg-[var(--grove-leaf)]/20 text-[var(--grove-leaf)]'
                        : 'bg-[var(--grove-deep)] text-[var(--grove-fog)] hover:text-[var(--grove-white)]'
                    }`}
                    onClick={() => handleTemplateSelect(t)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt textarea */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Prompt (optional)
            </Label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter a prompt to send to all sessions..."
              rows={4}
              className="w-full rounded border border-[var(--grove-canopy)] bg-[var(--grove-bark)] px-3 py-2 text-sm text-[var(--grove-white)] placeholder:text-[var(--grove-stone)] focus:outline-none focus:ring-1 focus:ring-[var(--grove-leaf)] resize-y font-mono"
            />
            <p className="text-xs text-[var(--grove-stone)]">
              Tip: <code className="text-[var(--grove-fog)]">{'{branch}'}</code> will be replaced with each worktree's branch name.{' '}
              <code className="text-[var(--grove-fog)]">{'{project}'}</code> and{' '}
              <code className="text-[var(--grove-fog)]">{'{path}'}</code> are also available.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="text-[var(--grove-fog)]"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLaunch}
            className="bg-[var(--grove-leaf)] text-[var(--grove-bark)] hover:bg-[var(--grove-leaf)]/90"
          >
            <Zap className="h-4 w-4 mr-1" />
            Launch All ({branches.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
