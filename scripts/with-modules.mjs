#!/usr/bin/env node
/**
 * Module resolver wrapper for NAS environments.
 *
 * The NAS (Z: drive) blocks creation of directories named "node_modules".
 * This script:
 * 1. Syncs source files to a local C: drive mirror that has node_modules
 * 2. Runs the requested command from the local mirror
 * 3. For 'vite build', copies the dist output back to Z:
 *
 * Usage: node scripts/with-modules.mjs <command> [args...]
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { resolve, join } from 'path';

const home = process.env.USERPROFILE || process.env.HOME || '';
const srcUi = resolve(import.meta.dirname, '..', 'src-ui');
const localDir = resolve(home, 'grove-src-ui');
const localNM = resolve(localDir, 'node_modules');
const localSrcUiNM = resolve(srcUi, 'node_modules');

// Use local node_modules if src-ui has it (non-NAS environment)
const useLocalMirror = !existsSync(localSrcUiNM);
const workDir = useLocalMirror ? localDir : srcUi;
const nmDir = useLocalMirror ? localNM : localSrcUiNM;
const binDir = join(nmDir, '.bin');

if (!existsSync(nmDir)) {
  console.error(`ERROR: node_modules not found at ${localSrcUiNM} or ${localNM}`);
  console.error('Run: bash scripts/ui-setup.sh');
  process.exit(1);
}

// If using local mirror, sync source files
if (useLocalMirror) {
  // Sync key files from Z: to local
  const filesToSync = [
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.local.json',
    'index.html',
    'package.json',
  ];
  for (const f of filesToSync) {
    const src = resolve(srcUi, f);
    if (existsSync(src)) {
      cpSync(src, resolve(localDir, f), { force: true });
    }
  }
  // Sync src/ directory
  const srcDir = resolve(srcUi, 'src');
  const localSrc = resolve(localDir, 'src');
  if (existsSync(srcDir)) {
    cpSync(srcDir, localSrc, { recursive: true, force: true });
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/with-modules.mjs <command> [args...]');
  process.exit(1);
}

// For tsc, use tsconfig.local.json if it exists
let finalArgs = args;
if (cmd === 'tsc' && useLocalMirror) {
  const localTsconfig = resolve(localDir, 'tsconfig.local.json');
  if (existsSync(localTsconfig)) {
    const hasB = finalArgs.indexOf('-b');
    if (hasB !== -1) {
      finalArgs = [...finalArgs];
      finalArgs.splice(hasB, 1);
      finalArgs.unshift('-p', 'tsconfig.local.json');
    } else if (!finalArgs.includes('-p') && !finalArgs.includes('--project')) {
      finalArgs = ['-p', 'tsconfig.local.json', ...finalArgs];
    }
  }
}

// Resolve the binary
const isWin = process.platform === 'win32';
const cmdExt = isWin ? '.cmd' : '';
const binPath = join(binDir, cmd + cmdExt);
const executable = existsSync(binPath) ? binPath : cmd;

const env = {
  ...process.env,
  NODE_PATH: nmDir,
  PATH: `${binDir}${isWin ? ';' : ':'}${process.env.PATH}`,
};

try {
  execSync(`"${executable}" ${finalArgs.join(' ')}`, {
    stdio: 'inherit',
    env,
    cwd: workDir,
  });
} catch (e) {
  process.exit(e.status || 1);
}

// If built dist, copy back to Z:
if (useLocalMirror && cmd === 'vite' && args.includes('build')) {
  const localDist = resolve(localDir, 'dist');
  const remoteDist = resolve(srcUi, 'dist');
  if (existsSync(localDist)) {
    mkdirSync(remoteDist, { recursive: true });
    cpSync(localDist, remoteDist, { recursive: true, force: true });
    console.log(`Copied dist to ${remoteDist}`);
  }
}
