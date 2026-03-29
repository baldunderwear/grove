import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, Rocket, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfigStore } from '@/stores/config-store';
import { TemplateManager } from './TemplateManager';
import { ContextFilePicker } from './ContextFilePicker';
import type { PromptTemplate } from '@/types/config';

interface LaunchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktreePath: string;
  branchName: string;
  projectId?: string;
  projectPath: string;
  onLaunch: (prompt: string, contextFiles: string[]) => void;
}

function substituteVariables(body: string, vars: Record<string, string>): string {
  let result = body;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

export function LaunchDialog({
  open,
  onOpenChange,
  worktreePath,
  branchName,
  projectPath,
  onLaunch,
}: LaunchDialogProps) {
  const templates = useConfigStore((s) => s.config?.templates ?? []);

  const [prompt, setPrompt] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showContextFiles, setShowContextFiles] = useState(false);

  // Derive project name from path
  const projectName = useMemo(() => {
    const normalized = projectPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'project';
  }, [projectPath]);

  const templateVars: Record<string, string> = useMemo(
    () => ({
      branch: branchName,
      project: projectName,
      path: worktreePath,
    }),
    [branchName, projectName, worktreePath],
  );

  const handleTemplateSelect = (template: PromptTemplate) => {
    setSelectedTemplateId(template.id);
    setPrompt(substituteVariables(template.body, templateVars));
    setShowTemplateManager(false);
  };

  const handleLaunch = () => {
    onLaunch(prompt, contextFiles);
    // Reset state for next open
    setPrompt('');
    setSelectedTemplateId(null);
    setContextFiles([]);
    setShowContextFiles(false);
    setShowTemplateManager(false);
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[var(--grove-bark)] border-[var(--grove-canopy)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--grove-white)] flex items-center gap-2">
            <Rocket className="size-5 text-[var(--grove-leaf)]" />
            Launch Claude Code
          </DialogTitle>
          <DialogDescription className="text-[var(--grove-fog)]">
            {branchName} &middot; {worktreePath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Template section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--grove-fog)]">
                Prompt Template
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-[var(--grove-fog)] hover:text-[var(--grove-white)]"
                onClick={() => setShowTemplateManager(!showTemplateManager)}
              >
                <Settings2 className="size-3.5 mr-1" />
                Manage
              </Button>
            </div>

            {/* Template quick-select */}
            {!showTemplateManager && templates.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    !selectedTemplateId
                      ? 'bg-[var(--grove-leaf)]/20 text-[var(--grove-leaf)]'
                      : 'bg-[var(--grove-deep)] text-[var(--grove-fog)] hover:text-[var(--grove-white)]'
                  }`}
                  onClick={() => {
                    setSelectedTemplateId(null);
                    setPrompt('');
                  }}
                >
                  Custom
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
            )}

            {/* Template manager panel */}
            {showTemplateManager && (
              <div className="border border-[var(--grove-canopy)] rounded p-3 bg-[var(--grove-deep)]">
                <TemplateManager onSelect={handleTemplateSelect} />
              </div>
            )}
          </div>

          {/* Prompt textarea */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--grove-fog)]">Prompt</label>
              {selectedTemplate && (
                <Badge className="bg-[var(--grove-leaf)]/15 text-[var(--grove-leaf)] border-0 text-xs px-1.5 py-0">
                  <FileText className="size-3 mr-1" />
                  {selectedTemplate.name}
                </Badge>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt for Claude Code..."
              rows={5}
              className="w-full rounded border border-[var(--grove-canopy)] bg-[var(--grove-bark)] px-3 py-2 text-sm text-[var(--grove-white)] placeholder:text-[var(--grove-stone)] focus:outline-none focus:ring-1 focus:ring-[var(--grove-leaf)] resize-y font-mono"
            />
          </div>

          {/* Context files section (collapsible) */}
          <div className="flex flex-col gap-2">
            <button
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--grove-fog)] hover:text-[var(--grove-white)] transition-colors w-fit"
              onClick={() => setShowContextFiles(!showContextFiles)}
            >
              {showContextFiles ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              Add context files
              {contextFiles.length > 0 && (
                <Badge className="bg-[var(--grove-leaf)]/15 text-[var(--grove-leaf)] border-0 text-xs px-1.5 py-0 ml-1">
                  {contextFiles.length}
                </Badge>
              )}
            </button>
            {showContextFiles && (
              <ContextFilePicker
                worktreePath={worktreePath}
                selectedFiles={contextFiles}
                onSelectionChange={setContextFiles}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="text-[var(--grove-fog)]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="bg-[var(--grove-leaf)] text-[var(--grove-bark)] hover:bg-[var(--grove-leaf)]/90"
            onClick={handleLaunch}
          >
            <Rocket className="size-4 mr-1.5" />
            {prompt.trim() ? 'Launch with Prompt' : 'Launch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
