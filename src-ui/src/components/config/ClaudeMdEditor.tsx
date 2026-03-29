import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { foldGutter, foldService } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { groveEditorTheme } from './EditorTheme';
import { useFileEditor } from '@/hooks/useFileEditor';
import { MergedPreview } from './MergedPreview';

interface ClaudeMdEditorProps {
  projectPath: string;
}

/** Parse ## headings from markdown content for section navigation */
function parseHeadings(text: string): { label: string; line: number }[] {
  const headings: { label: string; line: number }[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ label: match[2].trim(), line: i + 1 });
    }
  }
  return headings;
}

/**
 * Fold service for markdown: fold content between ## headings.
 * Each heading folds from end of heading line to start of next heading (or EOF).
 */
const markdownFoldService = foldService.of((state, lineStart, _lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;
  // Only fold on heading lines
  if (!/^#{1,6}\s/.test(text)) return null;

  const headingLevel = text.match(/^(#{1,6})/)?.[1].length ?? 0;
  let foldEnd = state.doc.length;

  // Find next heading of same or higher level
  for (let pos = line.to + 1; pos < state.doc.length; ) {
    const nextLine = state.doc.lineAt(pos);
    const nextMatch = nextLine.text.match(/^(#{1,6})\s/);
    if (nextMatch && nextMatch[1].length <= headingLevel) {
      // Fold up to the line before this heading
      foldEnd = nextLine.from > 0 ? nextLine.from - 1 : nextLine.from;
      break;
    }
    pos = nextLine.to + 1;
  }

  // Only fold if there's content after the heading
  if (foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }
  return null;
});

/**
 * CLAUDE.md visual editor with collapsible sections and merged preview.
 *
 * Left pane: CodeMirror editor with markdown syntax highlighting,
 *   fold gutter for collapsible sections, and section outline navigation.
 * Right pane: Merged preview showing global + project CLAUDE.md content.
 */
export function ClaudeMdEditor({ projectPath }: ClaudeMdEditorProps) {
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const [globalContent, setGlobalContent] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Resolve the actual CLAUDE.md path (try .claude/CLAUDE.md first, then root)
  useEffect(() => {
    let cancelled = false;
    async function resolvePath() {
      const candidates = [
        `${projectPath}/.claude/CLAUDE.md`,
        `${projectPath}/CLAUDE.md`,
      ];
      for (const candidate of candidates) {
        try {
          await invoke<string>('read_text_file', { path: candidate });
          if (!cancelled) setProjectFilePath(candidate);
          return;
        } catch {
          // Try next candidate
        }
      }
      // Neither exists -- default to .claude/CLAUDE.md for new file creation
      if (!cancelled) setProjectFilePath(candidates[0]);
    }
    resolvePath();
    return () => { cancelled = true; };
  }, [projectPath]);

  // Load global CLAUDE.md content
  useEffect(() => {
    let cancelled = false;
    async function loadGlobal() {
      try {
        const home = await homeDir();
        const globalPath = `${home}.claude/CLAUDE.md`;
        const content = await invoke<string>('read_text_file', { path: globalPath });
        if (!cancelled) setGlobalContent(content);
      } catch {
        if (!cancelled) setGlobalContent(null);
      }
    }
    loadGlobal();
    return () => { cancelled = true; };
  }, []);

  const { content, setContent, loading, error, dirty, save, reload } =
    useFileEditor(projectFilePath);

  // Parse headings for section outline
  const headings = useMemo(() => parseHeadings(content), [content]);

  // CodeMirror extensions: markdown + fold gutter + fold service
  const extensions = useMemo(
    () => [
      markdown(),
      foldGutter({
        openText: '\u25BE',  // down-pointing triangle
        closedText: '\u25B8', // right-pointing triangle
      }),
      markdownFoldService,
      EditorView.lineWrapping,
    ],
    []
  );

  // Scroll editor to a specific line (for section outline clicks)
  const scrollToLine = useCallback((lineNumber: number) => {
    const view = editorRef.current?.view;
    if (!view) return;
    try {
      const line = view.state.doc.line(lineNumber);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 20 }),
      });
      view.focus();
    } catch {
      // Line may not exist if content changed
    }
  }, []);

  // Save handler with toast
  const handleSave = useCallback(async () => {
    const success = await save();
    if (success) {
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    }
  }, [save]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--grove-stone)]">
        Loading CLAUDE.md...
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: section outline + save/reload */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--grove-deep)] border-b border-[var(--grove-canopy)] shrink-0">
        {/* Section outline pills */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {headings.length > 0 ? (
            headings.map((h, i) => (
              <button
                key={`${h.line}-${i}`}
                onClick={() => scrollToLine(h.line)}
                className="px-2 py-0.5 text-xs rounded bg-[var(--grove-canopy)] text-[var(--grove-fog)] hover:bg-[var(--grove-moss)] hover:text-[var(--grove-white)] transition-colors whitespace-nowrap shrink-0"
                title={`Go to line ${h.line}`}
              >
                {h.label}
              </button>
            ))
          ) : (
            <span className="text-xs text-[var(--grove-stone)] italic">
              No sections found
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Saved toast */}
          {savedToast && (
            <span className="text-xs text-[var(--grove-sprout)] animate-pulse">
              Saved
            </span>
          )}

          {/* Dirty indicator */}
          {dirty && (
            <span className="w-2 h-2 rounded-full bg-[var(--grove-amber)]" title="Unsaved changes" />
          )}

          {/* Reload button */}
          <button
            onClick={reload}
            className="px-2 py-1 text-xs rounded bg-[var(--grove-canopy)] text-[var(--grove-fog)] hover:bg-[var(--grove-moss)] transition-colors"
            title="Reload from disk"
          >
            Reload
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!dirty}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              dirty
                ? 'bg-[var(--grove-leaf)] text-[var(--grove-void)] hover:bg-[var(--grove-sprout)]'
                : 'bg-[var(--grove-canopy)] text-[var(--grove-stone)] cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1 text-xs text-red-400 bg-red-900/20 border-b border-red-900/40">
          {error}
        </div>
      )}

      {/* Split pane: editor (left) + preview (right) */}
      <div className="flex flex-1 min-h-0">
        {/* Left: CodeMirror editor */}
        <div className="flex-1 min-w-0 overflow-hidden border-r border-[var(--grove-canopy)]">
          <CodeMirror
            ref={editorRef}
            value={content}
            onChange={setContent}
            extensions={extensions}
            theme={groveEditorTheme}
            height="100%"
            className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
          />
        </div>

        {/* Right: Merged preview */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <MergedPreview
            globalContent={globalContent}
            projectContent={content}
          />
        </div>
      </div>
    </div>
  );
}
