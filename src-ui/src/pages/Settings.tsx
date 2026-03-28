import { useState } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { enable, disable } from '@tauri-apps/plugin-autostart';
import { useConfigStore } from '@/stores/config-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Settings() {
  const store = useConfigStore();
  const settings = store.config?.settings;

  const [refreshValue, setRefreshValue] = useState(
    String(settings?.refresh_interval ?? 30)
  );
  const [fetchValue, setFetchValue] = useState(
    String(settings?.auto_fetch_interval ?? 300)
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleRefreshBlur = async () => {
    const parsed = parseInt(refreshValue, 10);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 300) {
      await store.updateSettings({ refresh_interval: parsed });
    } else {
      // Reset to current value if invalid
      setRefreshValue(String(settings?.refresh_interval ?? 30));
    }
  };

  const handleFetchBlur = async () => {
    const parsed = parseInt(fetchValue, 10);
    if (!isNaN(parsed) && (parsed === 0 || parsed >= 60) && parsed <= 3600) {
      await store.updateSettings({ auto_fetch_interval: parsed });
    } else {
      setFetchValue(String(settings?.auto_fetch_interval ?? 300));
    }
  };

  const handleExport = async () => {
    setExportError(null);
    try {
      const filePath = await save({
        defaultPath: 'grove-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        await invoke('export_config', { path: filePath });
      }
    } catch (e) {
      setExportError(String(e));
    }
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selected) {
        await invoke('import_config', { path: selected as string });
        await store.loadConfig();
      }
    } catch (e) {
      setImportError(String(e));
    }
  };

  if (!settings) return null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--grove-white)]">Settings</h1>

      {/* General */}
      <Card className="p-4 mt-4">
        <div className="space-y-6">
          {/* Refresh interval */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Refresh interval
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={5}
                max={300}
                value={refreshValue}
                onChange={(e) => setRefreshValue(e.target.value)}
                onBlur={handleRefreshBlur}
                className="w-24"
              />
              <span className="text-sm text-[var(--grove-fog)]">seconds</span>
            </div>
            <p className="text-xs text-[var(--grove-stone)]">
              How often to check git status, in seconds.
            </p>
          </div>

          {/* Auto-fetch interval */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-[var(--grove-fog)]">
              Remote fetch interval
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={3600}
                value={fetchValue}
                onChange={(e) => setFetchValue(e.target.value)}
                onBlur={handleFetchBlur}
                className="w-24"
              />
              <span className="text-sm text-[var(--grove-fog)]">seconds</span>
            </div>
            <p className="text-xs text-[var(--grove-stone)]">
              How often to fetch from remote. Set to 0 to disable. Minimum 60 seconds.
            </p>
          </div>

          {/* Start minimized */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="start-minimized"
              checked={settings.start_minimized}
              onChange={(e) =>
                store.updateSettings({ start_minimized: e.target.checked })
              }
              className="h-4 w-4 rounded border-[var(--grove-canopy)] bg-[var(--grove-deep)] text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="start-minimized" className="text-sm text-[var(--grove-white)] cursor-pointer">
              Start minimized to tray
            </Label>
          </div>

          {/* Start with Windows */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="start-with-windows"
              checked={settings.start_with_windows}
              onChange={async (e) => {
                const enabled = e.target.checked;
                try {
                  if (enabled) {
                    await enable();
                  } else {
                    await disable();
                  }
                  await store.updateSettings({ start_with_windows: enabled });
                } catch (err) {
                  console.error('Autostart toggle failed:', err);
                }
              }}
              className="h-4 w-4 rounded border-[var(--grove-canopy)] bg-[var(--grove-deep)] text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="start-with-windows" className="text-sm text-[var(--grove-white)] cursor-pointer">
              Launch when Windows starts
            </Label>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-4 mt-6">
        <h2 className="text-xs uppercase tracking-wider text-[var(--grove-fog)] mb-3">
          Notifications
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notify-merge-ready"
              checked={settings.notify_merge_ready}
              onChange={(e) =>
                store.updateSettings({ notify_merge_ready: e.target.checked })
              }
              className="h-4 w-4 rounded border-[var(--grove-canopy)] bg-[var(--grove-deep)] text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="notify-merge-ready" className="text-sm text-[var(--grove-white)] cursor-pointer">
              Notify when a branch is merge-ready
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notify-stale"
              checked={settings.notify_stale_branch}
              onChange={(e) =>
                store.updateSettings({ notify_stale_branch: e.target.checked })
              }
              className="h-4 w-4 rounded border-[var(--grove-canopy)] bg-[var(--grove-deep)] text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="notify-stale" className="text-sm text-[var(--grove-white)] cursor-pointer">
              Notify when a branch is stale (7+ days inactive)
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notify-merge-complete"
              checked={settings.notify_merge_complete}
              onChange={(e) =>
                store.updateSettings({ notify_merge_complete: e.target.checked })
              }
              className="h-4 w-4 rounded border-[var(--grove-canopy)] bg-[var(--grove-deep)] text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="notify-merge-complete" className="text-sm text-[var(--grove-white)] cursor-pointer">
              Notify when a merge completes
            </Label>
          </div>
        </div>
      </Card>

      {/* Theme */}
      <Card className="p-4 mt-6">
        <p className="text-sm text-[var(--grove-white)]">Dark mode</p>
        <p className="text-xs text-[var(--grove-stone)] mt-1">
          Light theme coming in a future version.
        </p>
      </Card>

      {/* Data / Configuration */}
      <Card className="p-4 mt-6">
        <h2 className="text-xs uppercase tracking-wider text-[var(--grove-fog)] mb-3">
          Configuration
        </h2>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport}>
            Export Config
          </Button>
          <Button variant="outline" onClick={handleImport}>
            Import Config
          </Button>
        </div>
        {exportError && (
          <p className="text-xs text-red-500 mt-2">{exportError}</p>
        )}
        {importError && (
          <p className="text-xs text-red-500 mt-2">{importError}</p>
        )}
        <p className="text-xs text-[var(--grove-stone)] mt-3">
          Export saves your projects and settings. Import replaces current
          configuration.
        </p>
      </Card>
    </div>
  );
}
