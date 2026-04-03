import { useState } from 'react';
import {
  GripVertical,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { isSortable } from '@dnd-kit/react/sortable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMergeQueueStore } from '@/stores/merge-queue-store';
import type { QueueBranch, QueueItemStatus } from '@/types/merge';
import type { BuildFileConfig, ChangelogConfig } from '@/types/config';

interface MergeQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  mergeTarget: string;
  buildPatterns: BuildFileConfig[];
  changelogConfig: ChangelogConfig | null;
}

function StatusIcon({ status }: { status: QueueItemStatus }) {
  switch (status) {
    case 'pending':
      return <Circle className="h-3.5 w-3.5 text-[var(--grove-stone)]" />;
    case 'active':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--grove-leaf)]" />;
    case 'complete':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'rolled_back':
      return <RotateCcw className="h-3.5 w-3.5 text-amber-400" />;
  }
}

function SortableQueueItem({
  id,
  index,
  disabled,
  children,
}: {
  id: string;
  index: number;
  disabled: boolean;
  children: (args: {
    containerRef: (el: Element | null) => void;
    handleRef: (el: Element | null) => void;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled });
  return <>{children({ containerRef: ref, handleRef, isDragging })}</>;
}

export function MergeQueueDialog({
  open,
  onOpenChange,
  projectPath,
  mergeTarget,
  buildPatterns,
  changelogConfig,
}: MergeQueueDialogProps) {
  const branches = useMergeQueueStore((s) => s.branches);
  const step = useMergeQueueStore((s) => s.step);
  const currentIndex = useMergeQueueStore((s) => s.currentIndex);
  const error = useMergeQueueStore((s) => s.error);
  const reorder = useMergeQueueStore((s) => s.reorder);
  const removeBranch = useMergeQueueStore((s) => s.removeBranch);
  const startQueue = useMergeQueueStore((s) => s.startQueue);
  const reset = useMergeQueueStore((s) => s.reset);

  const isExecuting = step === 'executing';
  const isReady = step === 'ready';
  const isSuccess = step === 'success';
  const isFailure = step === 'failure';

  const completedCount = branches.filter((b) => b.status === 'complete').length;
  const hasFailed = branches.some((b) => b.status === 'failed' || b.status === 'rolled_back');
  const currentBranch = branches[currentIndex];

  const handleOpenChange = (v: boolean) => {
    if (!v && isExecuting) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const handleStartQueue = () => {
    startQueue(projectPath, mergeTarget, buildPatterns, changelogConfig);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[480px] bg-[var(--grove-deep)] border border-[var(--grove-canopy)]"
        showCloseButton={!isExecuting}
        onPointerDownOutside={(e) => {
          if (isExecuting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isExecuting) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isExecuting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Merge Queue</DialogTitle>
          <DialogDescription style={{ color: 'var(--grove-stone)' }}>
            {branches.length} branch{branches.length !== 1 ? 'es' : ''} selected
          </DialogDescription>
        </DialogHeader>

        {/* Queue List */}
        <ScrollArea className="max-h-[360px]">
          <DragDropProvider
            onDragEnd={(event) => {
              if (event.canceled) return;
              const { source } = event.operation;
              if (!source || !isSortable(source)) return;
              const fromIndex = source.sortable.initialIndex;
              const toIndex = source.sortable.index;
              if (fromIndex !== toIndex) {
                reorder(fromIndex, toIndex);
              }
            }}
          >
            <div className="flex flex-col gap-2">
              {branches.map((branch, index) => (
                <SortableQueueItem
                  key={branch.name}
                  id={branch.name}
                  index={index}
                  disabled={!isReady}
                >
                  {({ containerRef, handleRef, isDragging }) => (
                    <div
                      ref={containerRef as React.Ref<HTMLDivElement>}
                      className={`flex items-center bg-[var(--grove-forest)] border border-[var(--grove-canopy)] rounded-md p-2 gap-2 transition-all ${
                        isDragging ? 'ring-1 ring-[var(--grove-moss)] scale-[1.02] shadow-lg' : ''
                      }`}
                    >
                      {/* Drag handle or status icon */}
                      {isReady ? (
                        <div
                          ref={handleRef as React.Ref<HTMLDivElement>}
                          className="cursor-grab shrink-0"
                        >
                          <GripVertical className="h-4 w-4 text-[var(--grove-stone)]" />
                        </div>
                      ) : (
                        <div className="shrink-0">
                          <StatusIcon status={branch.status} />
                        </div>
                      )}

                      {/* Branch info */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[13px] font-semibold truncate"
                          style={{ color: 'var(--grove-fog)' }}
                        >
                          {branch.name}
                        </div>
                        <div
                          className="text-[12px] font-normal"
                          style={{ color: 'var(--grove-stone)' }}
                        >
                          +{branch.ahead} commit{branch.ahead !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Remove button (pre-execution only) */}
                      {isReady && (
                        <button
                          className="shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--grove-canopy)]"
                          style={{ opacity: 1 }}
                          onClick={() => removeBranch(branch.name)}
                        >
                          <X className="h-3.5 w-3.5 text-[var(--grove-stone)]" />
                        </button>
                      )}
                    </div>
                  )}
                </SortableQueueItem>
              ))}
            </div>
          </DragDropProvider>
        </ScrollArea>

        {/* Progress Section (execution only) */}
        {isExecuting && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-[var(--grove-canopy)]">
              <div
                className={`h-1 rounded-full transition-all ${hasFailed ? 'bg-red-500' : 'bg-[var(--grove-leaf)]'}`}
                style={{ width: `${(completedCount / branches.length) * 100}%` }}
              />
            </div>
            {currentBranch && (
              <p
                className="text-[13px] font-semibold text-center mt-2"
                style={{ color: 'var(--grove-fog)' }}
              >
                Merging {currentIndex + 1}/{branches.length}: {currentBranch.name}
              </p>
            )}
          </div>
        )}

        {/* Error display */}
        {isFailure && error && (
          <div className="mt-2 rounded-md border border-red-800 bg-red-950/30 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <DialogFooter>
          {isReady && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Discard Queue
              </Button>
              <Button
                className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)]"
                onClick={handleStartQueue}
              >
                Start Queue
              </Button>
            </>
          )}
          {isExecuting && (
            <Button disabled>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              Merging...
            </Button>
          )}
          {isSuccess && (
            <Button
              className="bg-[var(--grove-leaf)] hover:bg-[var(--grove-sprout)] text-[var(--grove-void)]"
              onClick={handleClose}
            >
              Done
            </Button>
          )}
          {isFailure && (
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
