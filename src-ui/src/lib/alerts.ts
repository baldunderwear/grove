import { getCurrentWindow } from '@tauri-apps/api/window';

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
 */
export function fireWaitingAlert() {
  playAttentionChime();
  requestWindowAttention();
}
