import { ScrollArea } from '@/components/ui/scroll-area';

export interface DiffSummaryData {
  files_changed: number;
  insertions: number;
  deletions: number;
  files: Array<{ path: string; insertions: number; deletions: number }>;
  commits: Array<{ oid: string; message: string; author: string; timestamp: number }>;
}

interface DiffSummaryStepProps {
  data: DiffSummaryData | null;
}

const MAX_FILES = 50;

export function DiffSummaryStep({ data }: DiffSummaryStepProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-sm text-[var(--grove-stone)]">
        Loading diff summary...
      </div>
    );
  }

  const visibleFiles = data.files.slice(0, MAX_FILES);
  const remainingCount = data.files.length - MAX_FILES;

  return (
    <div className="space-y-4">
      <h4 className="text-[13px] font-semibold leading-[1.3] text-[var(--grove-fog)]">
        Changes
      </h4>
      <p className="text-sm text-[var(--grove-fog)]">
        {data.files_changed} files changed,{' '}
        <span className="text-emerald-400">{data.insertions} insertions</span>,{' '}
        <span className="text-red-400">{data.deletions} deletions</span>
      </p>
      <ScrollArea className="max-h-[280px]">
        <div>
          {visibleFiles.map((file, i) => (
            <div
              key={file.path}
              className={`flex items-center justify-between py-2 px-2 ${
                i % 2 === 0 ? 'bg-[var(--grove-forest)]/50' : ''
              }`}
            >
              <span className="text-sm text-[var(--grove-fog)] truncate mr-4">
                {file.path}
              </span>
              <span className="font-mono text-xs text-[var(--grove-stone)] whitespace-nowrap">
                {file.insertions > 0 && (
                  <span className="text-emerald-400">+{file.insertions}</span>
                )}
                {file.insertions > 0 && file.deletions > 0 && ' '}
                {file.deletions > 0 && (
                  <span className="text-red-400">-{file.deletions}</span>
                )}
              </span>
            </div>
          ))}
          {remainingCount > 0 && (
            <p className="py-2 px-2 text-xs text-[var(--grove-stone)]">
              {remainingCount} more files
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
