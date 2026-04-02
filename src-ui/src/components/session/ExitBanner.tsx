import { CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';

interface ExitBannerProps {
  exitCode: number | null;
  sessionState: 'exited' | 'disconnected';
}

export function ExitBanner({ exitCode, sessionState }: ExitBannerProps) {
  if (sessionState === 'disconnected') {
    return (
      <div className="flex items-center gap-2 rounded-lg py-2 px-4 bg-zinc-500/10">
        <WifiOff className="h-4 w-4 text-[var(--grove-stone)] shrink-0" />
        <span className="text-[13px] font-semibold text-[var(--grove-stone)]">
          Session disconnected
        </span>
      </div>
    );
  }

  const isClean = exitCode === null || exitCode === 0;

  if (isClean) {
    return (
      <div className="flex items-center gap-2 rounded-lg py-2 px-4 bg-emerald-500/10">
        <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
        <span className="text-[13px] font-semibold text-emerald-300">
          Session complete
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg py-2 px-4 bg-red-500/10">
      <AlertTriangle className="h-4 w-4 text-red-300 shrink-0" />
      <span className="text-[13px] font-semibold text-red-300">
        Session crashed (exit code {exitCode})
      </span>
    </div>
  );
}
