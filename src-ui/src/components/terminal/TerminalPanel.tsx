import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useTerminal } from '@/hooks/useTerminal';
import { useTerminalStore } from '@/stores/terminal-store';
import { TerminalTabBar } from './TerminalTabBar';
import { SessionHistoryPanel } from './SessionHistoryPanel';

type TerminalEvent =
  | { type: 'Data'; data: string }
  | { type: 'Exit'; code: number | null }
  | { type: 'Error'; message: string };

interface TerminalInstanceProps {
  tabId: string;
  worktreePath: string;
  branchName: string;
  projectId?: string;
  isVisible: boolean;
}

function TerminalInstance({ tabId, worktreePath, branchName, projectId, isVisible }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const autoSendDoneRef = useRef(false);
  const { activateTab, setTabConnected, clearInitialPrompt } = useTerminalStore();

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

  const { write, refit } = useTerminal(containerRef, { onData, onResize });

  // Refit when tab becomes visible (Pitfall 4: dimensions stale after CSS hide)
  useEffect(() => {
    if (isVisible) {
      refit();
    }
  }, [isVisible, refit]);

  // Spawn PTY and wire Channel on mount
  useEffect(() => {
    let cancelled = false;

    const onEvent = new Channel<TerminalEvent>();
    onEvent.onmessage = (event: TerminalEvent) => {
      switch (event.type) {
        case 'Data':
          write(event.data);
          // Auto-send initial prompt after first data (Claude Code banner)
          if (!autoSendDoneRef.current) {
            autoSendDoneRef.current = true;
            const tab = useTerminalStore.getState().tabs.get(tabId);
            const pendingPrompt = tab?.initialPrompt;
            if (pendingPrompt) {
              clearInitialPrompt(tabId);
              setTimeout(async () => {
                const id = terminalIdRef.current;
                if (!id) return;
                // Prepend context file contents if any
                let fullPrompt = pendingPrompt;
                const contextFiles = tab?.contextFiles ?? [];
                if (contextFiles.length > 0) {
                  const fileParts: string[] = [];
                  for (const filePath of contextFiles) {
                    try {
                      const content = await invoke<string>('read_text_file', { path: filePath });
                      fileParts.push(`<file path="${filePath}">\n${content}\n</file>`);
                    } catch { /* skip unreadable files */ }
                  }
                  if (fileParts.length > 0) {
                    fullPrompt = fileParts.join('\n\n') + '\n\n' + pendingPrompt;
                  }
                }
                invoke('terminal_write', { terminalId: id, data: fullPrompt + '\n' }).catch(() => {});
              }, 2000);
            }
          }
          break;
        case 'Exit':
          write(`\r\n\x1b[90m[Process exited with code ${event.code ?? 'unknown'}]\x1b[0m\r\n`);
          if (terminalIdRef.current) {
            setTabConnected(terminalIdRef.current, false);
          }
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
      projectId: projectId ?? null,
      onEvent,
    })
      .then((id) => {
        if (cancelled) {
          invoke('terminal_kill', { terminalId: id }).catch(() => {});
          return;
        }
        terminalIdRef.current = id;
        activateTab(tabId, id);
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
    };
    // tabId and worktreePath are stable for the lifetime of this instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreePath, branchName, write, activateTab, setTabConnected]);

  return (
    <div
      className="flex-1 min-h-0 overflow-hidden h-full absolute inset-0"
      style={{ display: isVisible ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export function TerminalPanel() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const switchTab = useTerminalStore((s) => s.switchTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const [showHistory, setShowHistory] = useState(false);

  const handleClose = useCallback(
    (tabId: string) => {
      // Find the tab to get its real terminal ID for killing
      const tab = useTerminalStore.getState().tabs.get(tabId);
      if (tab && !tab.id.startsWith('pending-')) {
        invoke('terminal_kill', { terminalId: tab.id }).catch(() => {});
      }
      closeTab(tabId);
    },
    [closeTab],
  );

  const tabArray = [...tabs.values()];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <TerminalTabBar
        tabs={tabArray}
        activeTabId={activeTabId}
        onSwitch={switchTab}
        onClose={handleClose}
        onShowHistory={() => setShowHistory(true)}
      />
      <div className="flex-1 min-h-0 relative">
        {tabArray.map((tab) => (
          <TerminalInstance
            key={tab.id}
            tabId={tab.id}
            worktreePath={tab.worktreePath}
            branchName={tab.branchName}
            projectId={tab.projectId}
            isVisible={tab.id === activeTabId}
          />
        ))}
        {showHistory && activeTabId && !activeTabId.startsWith('pending-') && (
          <SessionHistoryPanel
            terminalId={activeTabId}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}
