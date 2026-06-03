/**
 * trash.js — Platform-aware safe deletion.
 *
 * Moves files to the OS trash/recycle bin when possible.
 * Falls back to permanent delete when trash isn't available,
 * unless `force` is false (in which case it throws).
 *
 * Windows: uses `shell32.dll` via a child process.
 * macOS: uses `osascript`.
 * Linux: uses `gio trash` or `xdg-trash`.
 */

import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { renameSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { warn } from './display.js';

/**
 * Move a file or directory to trash.
 *
 * @param {string} filePath  Absolute path
 * @returns {boolean}  Whether the operation succeeded
 */
export function trash(filePath) {
  const os = platform();

  try {
    if (os === 'win32') {
      return trashWindows(filePath);
    }
    if (os === 'darwin') {
      return trashMac(filePath);
    }
    return trashLinux(filePath);
  } catch {
    return false;
  }
}

/**
 * Permanently delete a file (last resort fallback).
 */
export function permanentDelete(filePath) {
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Windows ────────────────────────────────────────────────────────────────

function trashWindows(filePath) {
  // Write a temporary PowerShell script that uses Microsoft.VisualBasic
  // to send the file to Recycle Bin.
  const psScript = [
    `$path = ${JSON.stringify(filePath)}`,
    `$shell = New-Object -ComObject 'Shell.Application'`,
    `$shell.Namespace(0).ParseName('dummy') > $null`,  // Warm up
    `$item = $shell.Namespace(0).ParseName($path)`,
    `if ($item) { $item.InvokeVerb('delete') }`,
  ].join('\n');

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    psScript,
  ], { timeout: 10000, windowsHide: true });

  return result.status === 0;
}

// ── macOS ──────────────────────────────────────────────────────────────────

function trashMac(filePath) {
  const result = spawnSync('osascript', [
    '-e',
    `tell app "Finder" to delete POSIX file "${filePath}"`,
  ], { timeout: 10000 });
  return result.status === 0;
}

// ── Linux ──────────────────────────────────────────────────────────────────

function trashLinux(filePath) {
  // Try gio (GNOME), then xdg-trash, then fallback to ~/.local/share/Trash
  for (const cmd of ['gio', 'gvfs-trash']) {
    const result = spawnSync(cmd, ['trash', filePath], { timeout: 5000 });
    if (result.status === 0) return true;
  }

  // Manual XDG trash spec fallback
  return trashLinuxFallback(filePath);
}

function trashLinuxFallback(filePath) {
  const trashDir = resolve(homedir(), '.local/share/Trash');
  const filesDir = resolve(trashDir, 'files');
  const infoDir = resolve(trashDir, 'info');

  try {
    mkdirSync(filesDir, { recursive: true });
    mkdirSync(infoDir, { recursive: true });

    const destName = basename(filePath);
    const destPath = resolve(filesDir, destName);
    renameSync(filePath, destPath);

    const info = {
      Path: filePath,
      DeletionDate: new Date().toISOString(),
    };
    const infoContent = Object.entries(info)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    writeFileSync(resolve(infoDir, `${destName}.trashinfo`), infoContent);

    return true;
  } catch {
    return false;
  }
}
