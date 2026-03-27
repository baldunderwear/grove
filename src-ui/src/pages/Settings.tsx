import { useState } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
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
      <h1 className="text-xl font-semibold text-gray-50">Settings</h1>

      {/* General */}
      <Card className="p-4 mt-4">
        <div className="space-y-6">
          {/* Refresh interval */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-gray-400">
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
              <span className="text-sm text-gray-400">seconds</span>
            </div>
            <p className="text-xs text-gray-500">
              How often to check git status, in seconds.
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
              className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="start-minimized" className="text-sm text-gray-50 cursor-pointer">
              Start minimized to tray
            </Label>
          </div>

          {/* Start with Windows */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="start-with-windows"
              checked={settings.start_with_windows}
              onChange={(e) =>
                store.updateSettings({ start_with_windows: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500/50"
            />
            <Label htmlFor="start-with-windows" className="text-sm text-gray-50 cursor-pointer">
              Launch when Windows starts
            </Label>
          </div>
        </div>
      </Card>

      {/* Theme */}
      <Card className="p-4 mt-6">
        <p className="text-sm text-gray-50">Dark mode</p>
        <p className="text-xs text-gray-500 mt-1">
          Light theme coming in a future version.
        </p>
      </Card>

      {/* Data / Configuration */}
      <Card className="p-4 mt-6">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-3">
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
        <p className="text-xs text-gray-500 mt-3">
          Export saves your projects and settings. Import replaces current
          configuration.
        </p>
      </Card>
    </div>
  );
}
