/**
 * undo.js — Persistent undo log.
 *
 * Every mutating operation writes a manifest to
 *   ~/.file-magician/undo/<timestamp>-<type>.json
 *
 * The `undo` command reads the most recent manifest and reverses
 * each operation: rename re-reverses, delete restores from backup,
 * copy removes target.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync,
         renameSync, unlinkSync, copyFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { homedir, hostname } from 'node:os';
import { info, warn, error as logError } from './display.js';

const UNDO_DIR = resolve(homedir(), '.file-magician', 'undo');
const BACKUP_DIR = resolve(homedir(), '.file-magician', 'backup');

/**
 * @typedef {object} UndoEntry
 * @property {'rename'|'copy'|'move'|'delete'|'image'} type
 * @property {string} from  Original path before the operation
 * @property {string} to    Path after the operation
 * @property {string} [backup]  Backup path (for delete/overwrite)
 */

/**
 * @typedef {object} UndoManifest
 * @property {string}   id
 * @property {number}   timestamp
 * @property {string}   hostname
 * @property {string}   cwd
 * @property {string}   command
 * @property {UndoEntry[]} operations
 */

/**
 * Record a set of changes for undo.
 *
 * @param {string} command     e.g. "rename --pattern 'img_{n}'"
 * @param {UndoEntry[]} entries
 */
export function recordUndo(command, entries) {
  ensureDirs();

  const timestamp = Date.now();
  const id = `${timestamp}-${command.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}`;

  /** @type {UndoManifest} */
  const manifest = {
    id,
    timestamp,
    hostname: hostname(),
    cwd: process.cwd(),
    command,
    operations: entries,
  };

  writeFileSync(
    resolve(UNDO_DIR, `${id}.json`),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return id;
}

/**
 * List recent undo manifests (newest first).
 *
 * @param {number} [limit=20]
 * @returns {UndoManifest[]}
 */
export function listUndo(limit = 20) {
  ensureDirs();

  return readdirSync(UNDO_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(resolve(UNDO_DIR, f), 'utf-8')));
}

/**
 * Roll back a specific undo manifest.
 *
 * @param {string} id  Manifest id (or 'last' for the most recent)
 * @returns {boolean}
 */
export function rollback(id) {
  ensureDirs();

  const file = id === 'last'
    ? readdirSync(UNDO_DIR).filter((f) => f.endsWith('.json')).sort().pop()
    : readdirSync(UNDO_DIR).find((f) => f.startsWith(id));

  if (!file) {
    logError(`No undo record found for "${id}".`);
    return false;
  }

  /** @type {UndoManifest} */
  const manifest = JSON.parse(readFileSync(resolve(UNDO_DIR, file), 'utf-8'));
  const ops = [...manifest.operations].reverse();

  let done = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      switch (op.type) {
        case 'rename':
          // Reverse: to → from
          if (existsSync(op.to)) {
            renameSync(op.to, op.from);
          }
          break;

        case 'copy':
          // Reverse: remove the copy
          if (existsSync(op.to)) {
            unlinkSync(op.to);
          }
          break;

        case 'move':
          // Reverse: move back
          if (existsSync(op.to)) {
            renameSync(op.to, op.from);
          }
          break;

        case 'delete':
          // Reverse: restore from backup
          if (op.backup && existsSync(op.backup)) {
            renameSync(op.backup, op.from);
          }
          break;

        case 'image': {
          // Reverse: restore original
          if (op.backup && existsSync(op.backup)) {
            copyFileSync(op.backup, op.to);
            unlinkSync(op.backup);
          }
          break;
        }
      }
      done++;
    } catch (err) {
      warn(`Undo failed for ${op.from}: ${err.message}`);
      failed++;
    }
  }

  info(`Undo: ${done} reversed, ${failed} failed`);
  return failed === 0;
}

// ── Backup ─────────────────────────────────────────────────────────────────

/**
 * Create a backup of a file before overwriting it.
 *
 * @param {string} filePath
 * @returns {string|undefined} Backup path, or undefined on failure
 */
export function backupFile(filePath) {
  ensureDirs();
  const backupPath = resolve(BACKUP_DIR, `${basename(filePath)}.${Date.now()}.bak`);
  try {
    copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return undefined;
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const d of [UNDO_DIR, BACKUP_DIR]) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
    }
  }
}
