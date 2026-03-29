import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User } from 'lucide-react';
import { useConfigStore } from '@/stores/config-store';

export function ProfileSelector() {
  const profiles = useConfigStore((s) => s.config?.profiles) ?? [];
  const showConfig = useConfigStore((s) => s.showConfig);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (profiles.length === 0) return null;

  const defaultProfile = profiles.find((p) => p.is_default);
  const displayName = defaultProfile?.name ?? profiles[0]?.name ?? 'No profiles';

  return (
    <div ref={ref} className="relative px-2 mb-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-8 px-2.5 flex items-center gap-2 rounded-md text-xs transition-colors cursor-pointer"
        style={{
          border: '1px solid var(--grove-canopy)',
          color: 'var(--grove-stone)',
          background: 'transparent',
        }}
      >
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate flex-1 text-left">{displayName}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 mt-1 rounded-md shadow-lg z-50 py-1"
          style={{ background: 'var(--grove-void)', border: '1px solid var(--grove-canopy)' }}
        >
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                showConfig();
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--grove-canopy)]"
              style={{ color: profile.is_default ? 'var(--grove-bright)' : 'var(--grove-stone)' }}
            >
              <span className="truncate">{profile.name}</span>
              {profile.is_default && (
                <span
                  className="text-[9px] px-1 py-0.5 rounded-full shrink-0"
                  style={{ background: 'var(--grove-leaf)', color: 'var(--grove-void)' }}
                >
                  default
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
