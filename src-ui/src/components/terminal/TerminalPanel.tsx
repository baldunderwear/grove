import { useEffect, useRef, useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useTerminal } from '@/hooks/useTerminal';
import { useTerminalStore } from '@/stores/terminal-store';
import { TerminalToolbar } from './TerminalToolbar';

type TerminalEvent =
  | { type: 'Data'; data: string }
  | { type: 'Exit'; code: number | null }
  | { type: 'Error'; message: string };

interface TerminalPanelProps {
  worktreePath: string;
  branchName: string;
}

export function TerminalPanel({ worktreePath, branchName }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const { openTerminal, closeTerminal, setConnected } = useTerminalStore();

  const onData = useCallback((data: string) => {
    const id = terminalIdRef.current;
    if (id) {
      invoke('terminal_write', { terminalId: id, data }).catch(() => {
        // Terminal may have already exited
      });
    }
  }, []);

  const onResize = useCallback((cols: number, rows: number) => {
    const id = terminalIdRef.current;
    if (id) {
      invoke('terminal_resize', { terminalId: id, cols, rows }).catch(() => {
        // Terminal may have already exited
      });
    }
  }, []);

  const { write } = useTerminal(containerRef, { onData, onResize });

  // Spawn PTY and wire Channel on mount
  useEffect(() => {
    let cancelled = false;

    const onEvent = new Channel<TerminalEvent>();
    onEvent.onmessage = (event: TerminalEvent) => {
      switch (event.type) {
        case 'Data':
          write(event.data);
          break;
        case 'Exit':
          write(`\r\n\x1b[90m[Process exited with code ${event.code ?? 'unknown'}]\x1b[0m\r\n`);
          setConnected(false);
          break;
        case 'Error':
          write(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m\r\n`);
          break;
      }
    };

    invoke<string>('terminal_spawn', {
      workingDir: worktreePath,
      cols: 80,
      rows: 24,
      onEvent,
    })
      .then((id) => {
        if (cancelled) {
          invoke('terminal_kill', { terminalId: id }).catch(() => {});
          return;
        }
        terminalIdRef.current = id;
        openTerminal(id, worktreePath, branchName);
      })
      .catch((err) => {
        if (!cancelled) {
          write(`\r\n\x1b[31m[Failed to spawn terminal: ${err}]\x1b[0m\r\n`);
        }
      });

    return () => {
      cancelled = true;
      const id = terminalIdRef.current;
      if (id) {
        invoke('terminal_kill', { terminalId: id }).catch(() => {});
        terminalIdRef.current = null;
      }
      closeTerminal();
    };
  }, [worktreePath, branchName, write, openTerminal, closeTerminal, setConnected]);

  const handleClose = useCallback(() => {
    const id = terminalIdRef.current;
    if (id) {
      invoke('terminal_kill', { terminalId: id }).catch(() => {});
      terminalIdRef.current = null;
    }
    closeTerminal();
  }, [closeTerminal]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <TerminalToolbar branchName={branchName} onClose={handleClose} />
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
