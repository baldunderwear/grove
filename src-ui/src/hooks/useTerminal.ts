import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface UseTerminalOptions {
  /** Called when user types into the terminal */
  onData: (data: string) => void;
  /** Called when terminal container resizes */
  onResize: (cols: number, rows: number) => void;
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalOptions,
) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // WebGL addon with DOM fallback on context loss (NFR-08)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available — DOM renderer is the automatic fallback
    }

    terminal.open(container);
    termRef.current = terminal;
    fitRef.current = fitAddon;

    // Initial fit after DOM has painted (prevents zero-dimension issue)
    requestAnimationFrame(() => {
      fitAddon.fit();
      optionsRef.current.onResize(terminal.cols, terminal.rows);
    });

    // Forward user keystrokes
    const dataDisposable = terminal.onData((data) => {
      optionsRef.current.onData(data);
    });

    // Resize observer for container dimension changes
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit();
          optionsRef.current.onResize(
            termRef.current.cols,
            termRef.current.rows,
          );
        }
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [containerRef]);

  const write = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  const refit = useCallback(() => {
    requestAnimationFrame(() => {
      if (fitRef.current && termRef.current) {
        fitRef.current.fit();
      }
    });
  }, []);

  return { terminal: termRef, write, refit };
}
