import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a Unix timestamp (seconds) to a human-readable relative string.
 */
export function relativeTime(unixSeconds: number): string {
  const now = Date.now();
  const then = unixSeconds * 1000;
  const diffMs = now - then;

  if (diffMs < 0 || diffMs < 10_000) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Returns true if the given Unix timestamp (seconds) is older than 7 days.
 */
export function isStale(unixSeconds: number): boolean {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const then = unixSeconds * 1000;
  return Date.now() - then > sevenDaysMs;
}
