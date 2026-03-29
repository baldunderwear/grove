import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, File, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DirEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

interface ContextFilePickerProps {
  worktreePath: string;
  selectedFiles: string[];
  onSelectionChange: (files: string[]) => void;
}

const HIDDEN_DIRS = new Set(['.git', 'node_modules', 'target', '.next', '__pycache__', '.venv', 'dist', 'build']);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContextFilePicker({ worktreePath, selectedFiles, onSelectionChange }: ContextFilePickerProps) {
  const [currentPath, setCurrentPath] = useState(worktreePath);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<DirEntry[]>('list_directory', { path: currentPath })
      .then((result) => {
        if (cancelled) return;
        // Filter hidden files and common non-useful dirs
        const filtered = result.filter((e) => {
          if (e.name.startsWith('.')) return false;
          if (e.is_dir && HIDDEN_DIRS.has(e.name)) return false;
          return true;
        });
        setEntries(filtered);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentPath]);

  // Build breadcrumb segments relative to worktreePath
  const relativePath = currentPath.replace(/\\/g, '/').replace(worktreePath.replace(/\\/g, '/'), '');
  const segments = relativePath.split('/').filter(Boolean);

  const navigateTo = (index: number) => {
    // Navigate to breadcrumb segment
    const base = worktreePath.replace(/\\/g, '/');
    const target = index < 0 ? base : base + '/' + segments.slice(0, index + 1).join('/');
    setCurrentPath(target);
  };

  const enterDir = (name: string) => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    setCurrentPath(currentPath + sep + name);
  };

  const toggleFile = (entry: DirEntry) => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const fullPath = currentPath + sep + entry.name;
    if (selectedFiles.includes(fullPath)) {
      onSelectionChange(selectedFiles.filter((f) => f !== fullPath));
    } else {
      onSelectionChange([...selectedFiles, fullPath]);
    }
  };

  const isSelected = (entry: DirEntry) => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    return selectedFiles.includes(currentPath + sep + entry.name);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-0.5 text-xs text-[var(--grove-fog)] overflow-x-auto pb-1">
        <button
          className="hover:text-[var(--grove-white)] transition-colors shrink-0"
          onClick={() => navigateTo(-1)}
        >
          root
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <ChevronRight className="size-3 shrink-0 text-[var(--grove-stone)]" />
            <button
              className="hover:text-[var(--grove-white)] transition-colors shrink-0"
              onClick={() => navigateTo(i)}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <ScrollArea className="max-h-[200px] border border-[var(--grove-canopy)] rounded">
        {loading ? (
          <div className="p-3 text-xs text-[var(--grove-stone)] text-center">Loading...</div>
        ) : error ? (
          <div className="p-3 text-xs text-red-400 text-center">{error}</div>
        ) : entries.length === 0 ? (
          <div className="p-3 text-xs text-[var(--grove-stone)] text-center">Empty directory</div>
        ) : (
          <div className="flex flex-col">
            {entries.map((entry) => (
              <div
                key={entry.name}
                className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-[var(--grove-deep)] ${
                  !entry.is_dir && isSelected(entry) ? 'bg-[var(--grove-leaf)]/10' : ''
                }`}
                onClick={() => entry.is_dir ? enterDir(entry.name) : toggleFile(entry)}
              >
                {entry.is_dir ? (
                  <Folder className="size-3.5 text-[var(--grove-sprout)] shrink-0" />
                ) : (
                  <div className="flex items-center shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected(entry)}
                      onChange={() => toggleFile(entry)}
                      onClick={(e) => e.stopPropagation()}
                      className="size-3.5 rounded border-[var(--grove-canopy)] accent-[var(--grove-leaf)]"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {!entry.is_dir && <File className="size-3 text-[var(--grove-fog)] shrink-0" />}
                  <span className="truncate text-[var(--grove-white)]">{entry.name}</span>
                </div>
                <span className="text-xs text-[var(--grove-stone)] shrink-0">
                  {entry.is_dir ? '' : formatSize(entry.size)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
