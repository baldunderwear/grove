import { useState, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'error';

export function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Delay check to not impact startup time (NFR-01.1)
    const timer = setTimeout(async () => {
      try {
        const result = await check();
        if (result) {
          setUpdate(result);
          setVersion(result.version);
          setStatus('available');
        }
      } catch (e) {
        // Silently fail -- update check is non-critical
        console.error('[grove] Update check failed:', e);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!update) return;
    setStatus('downloading');
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        }
        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        }
      });
      await relaunch();
    } catch (e) {
      setErrorMsg(String(e));
      setStatus('error');
    }
  };

  if (status === 'idle') return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-blue-600 text-white text-sm">
      {status === 'available' && (
        <>
          <span>Grove v{version} is available</span>
          <button
            onClick={handleUpdate}
            className="px-3 py-1 bg-white text-blue-600 rounded font-medium hover:bg-blue-50"
          >
            Update now
          </button>
        </>
      )}
      {status === 'downloading' && (
        <span>Downloading update... {progress}%</span>
      )}
      {status === 'error' && (
        <>
          <span>Update failed: {errorMsg}</span>
          <button
            onClick={handleUpdate}
            className="px-3 py-1 bg-white text-blue-600 rounded font-medium hover:bg-blue-50"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
