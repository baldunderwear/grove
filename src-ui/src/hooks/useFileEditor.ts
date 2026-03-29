import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UseFileEditorResult {
  content: string;
  setContent: (value: string) => void;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
}

/**
 * Hook for loading/saving files via Tauri commands with dirty tracking.
 * Uses read_text_file/write_text_file Tauri commands.
 */
export function useFileEditor(filePath: string | null): UseFileEditorResult {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filePathRef = useRef(filePath);

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const text = await invoke<string>('read_text_file', { path });
      const elapsed = performance.now() - start;
      if (elapsed > 100) {
        console.warn(`[useFileEditor] Slow load: ${path} took ${elapsed.toFixed(0)}ms`);
      }
      setContent(text);
      setOriginalContent(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setContent('');
      setOriginalContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    filePathRef.current = filePath;
    if (filePath) {
      loadFile(filePath);
    } else {
      setContent('');
      setOriginalContent('');
      setError(null);
      setLoading(false);
    }
  }, [filePath, loadFile]);

  const dirty = content !== originalContent;

  const save = useCallback(async (): Promise<boolean> => {
    if (!filePathRef.current) return false;
    try {
      await invoke('write_text_file', { path: filePathRef.current, content });
      setOriginalContent(content);
      setError(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return false;
    }
  }, [content]);

  const reload = useCallback(async () => {
    if (filePathRef.current) {
      await loadFile(filePathRef.current);
    }
  }, [loadFile]);

  return { content, setContent, loading, error, dirty, save, reload };
}
