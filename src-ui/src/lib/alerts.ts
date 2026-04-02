import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { useTerminalStore } from '@/stores/terminal-store';

let audioContext: AudioContext | null = null;

/**
 * Play a two-tone chime when a session needs attention.
 * Uses Web Audio API — no external sound files needed.
 */
export function playAttentionChime() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;
    const now = ctx.currentTime;

    // Two-tone ascending chime (gentle but noticeable)
    const frequencies = [523.25, 659.25]; // C5, E5
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencies[i];
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.5);
    }
  } catch {
    // Audio not available — silent fallback
  }
}

/**
 * Request window attention (flash taskbar) if app is not focused.
 */
export async function requestWindowAttention() {
  try {
    const win = getCurrentWindow();
    const focused = await win.isFocused();
    if (!focused) {
      await win.requestUserAttention(2); // Informational
    }
  } catch {
    // Not available outside Tauri context
  }
}

/**
 * Fire all alerts for a session needing attention.
 * @deprecated Use fireSessionAlert instead — kept for backward compatibility.
 */
export function fireWaitingAlert() {
  playAttentionChime();
  requestWindowAttention();
}

// --- Toast notification system ---

interface ActiveToast {
  id: string | number;
  isError: boolean;
  timestamp: number;
}

const activeToasts: ActiveToast[] = [];

function trackToast(id: string | number, isError: boolean) {
  activeToasts.push({ id, isError, timestamp: Date.now() });
}

function untrackToast(id: string | number) {
  const idx = activeToasts.findIndex((t) => t.id === id);
  if (idx !== -1) activeToasts.splice(idx, 1);
}

function dismissOldestIfAtCapacity() {
  if (activeToasts.length >= 3) {
    // Find oldest non-error toast to dismiss
    const nonError = activeToasts.filter((t) => !t.isError);
    if (nonError.length > 0) {
      const oldest = nonError[0];
      toast.dismiss(oldest.id);
      untrackToast(oldest.id);
    } else {
      // All are errors — dismiss oldest error
      const oldest = activeToasts[0];
      toast.dismiss(oldest.id);
      untrackToast(oldest.id);
    }
  }
}

const toastConfig: Record<string, { title: (branch: string) => string; description: string; isError: boolean }> = {
  waiting: {
    title: (branch) => `${branch} needs input`,
    description: 'Session is waiting for your response',
    isError: false,
  },
  idle: {
    title: (branch) => `${branch} idle`,
    description: 'Session has gone idle',
    isError: false,
  },
  error: {
    title: (branch) => `${branch} error`,
    description: 'Session encountered an error',
    isError: true,
  },
};

/**
 * Fire an in-app toast for a session state change.
 * Only fires for waiting, idle, error states (not working or null).
 */
export function fireSessionToast(terminalId: string, branchName: string, state: string) {
  const config = toastConfig[state];
  if (!config) return; // Only fire for known alertable states

  dismissOldestIfAtCapacity();

  const action = {
    label: 'View Session',
    onClick: () => useTerminalStore.getState().focusSession(terminalId),
  };

  const onDismiss = (t: { id: string | number }) => untrackToast(t.id);
  const onAutoClose = (t: { id: string | number }) => untrackToast(t.id);

  if (config.isError) {
    const id = toast.error(config.title(branchName), {
      description: config.description,
      duration: Infinity,
      action,
      onDismiss,
      onAutoClose,
    });
    trackToast(id, true);
  } else {
    const className = state === 'waiting' ? 'grove-toast-waiting' : 'grove-toast-idle';
    const id = toast(config.title(branchName), {
      description: config.description,
      duration: 5000,
      action,
      className,
      onDismiss,
      onAutoClose,
    });
    trackToast(id, false);
  }
}

/**
 * Fire a system error toast (non-session).
 * Persists until manually dismissed.
 */
export function fireErrorToast(title: string, description: string) {
  dismissOldestIfAtCapacity();

  const id = toast.error(title, {
    description,
    duration: Infinity,
    onDismiss: (t: { id: string | number }) => untrackToast(t.id),
    onAutoClose: (t: { id: string | number }) => untrackToast(t.id),
  });
  trackToast(id, true);
}

/**
 * Fire a toast when a session exits (clean or crash).
 * Clean exit: info toast with 5s auto-dismiss.
 * Crash: persistent error toast until manually dismissed.
 */
export function fireExitToast(terminalId: string, branchName: string, exitCode: number | null) {
  const isClean = exitCode === null || exitCode === 0;
  dismissOldestIfAtCapacity();

  const action = {
    label: 'View Session',
    onClick: () => useTerminalStore.getState().focusSession(terminalId),
  };
  const onDismiss = (t: { id: string | number }) => untrackToast(t.id);
  const onAutoClose = (t: { id: string | number }) => untrackToast(t.id);

  if (isClean) {
    const id = toast(`${branchName} exited`, {
      description: 'Session completed successfully',
      duration: 5000,
      action,
      onDismiss,
      onAutoClose,
    });
    trackToast(id, false);
  } else {
    const id = toast.error(`${branchName} crashed`, {
      description: `Exited with code ${exitCode}`,
      duration: Infinity,
      action,
      onDismiss,
      onAutoClose,
    });
    trackToast(id, true);
  }
}

/**
 * Main entry point for session state change alerts.
 * Fires in-app toast always. Fires OS notification + chime for waiting state only when unfocused.
 */
export function fireSessionAlert(terminalId: string, branchName: string, state: string) {
  // Always fire in-app toast
  fireSessionToast(terminalId, branchName, state);

  // For waiting state: also fire audio chime and OS notification when unfocused
  if (state === 'waiting') {
    playAttentionChime();
    // OS notification only when app window is not focused
    getCurrentWindow().isFocused().then((focused) => {
      if (!focused) {
        requestWindowAttention();
      }
    }).catch(() => {
      // Not available outside Tauri context
    });
  }
}
